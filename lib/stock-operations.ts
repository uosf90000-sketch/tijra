import { db } from "@/lib/db";
import { adjustLocationStock, consumeLots, receiveLot, safeJson, syncListingForProduct } from "@/lib/commerce-ops";
import { decodeRecipeNote, requiredStockQuantity, type RecipeState } from "@/lib/recipes";

export type SaleLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  adjustments?: Array<{ componentId: string; multiplier: 0 | 1 | 2 }>;
  serials?: string[];
};

export type RecordSaleInput = {
  businessId: string;
  invoiceNumber?: string;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  locationId?: string | null;
  items: SaleLineInput[];
};

type RecipeConsumption = RecipeState & { multiplier: number; stockQuantity: number };

type SalePlan = {
  input: SaleLineInput;
  product: { id: string; name: string; unit: string; quantity: unknown; averageCost: unknown };
  unitPrice: number;
  unitCost: number;
  recipe: RecipeConsumption[];
  skipStock: boolean;
};

export async function recordSale(input: RecordSaleInput) {
  return db.$transaction(async (tx) => {
    const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
    const products = await tx.product.findMany({
      where: { businessId: input.businessId, id: { in: productIds }, active: true },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    if (productMap.size !== productIds.length) throw new Error("PRODUCT_NOT_FOUND");

    const [recipeRows, configRows] = await Promise.all([
      tx.inventoryAuditEvent.findMany({
        where: { businessId: input.businessId, action: "RECIPE_COMPONENT", listingId: { in: productIds } },
        orderBy: { occurredAt: "asc" },
      }),
      tx.inventoryAuditEvent.findMany({
        where: { businessId: input.businessId, action: "PRODUCT_CONFIG", listingId: { in: productIds } },
      }),
    ]);
    const productConfigMap = new Map(configRows.map((row) => [row.listingId, safeJson<{ saleMode?: string }>(row.note, {})]));
    const ingredientIds = Array.from(new Set(recipeRows.map((row) => row.orderId).filter((value): value is string => Boolean(value))));
    const ingredients = ingredientIds.length
      ? await tx.product.findMany({ where: { businessId: input.businessId, id: { in: ingredientIds }, active: true } })
      : [];
    const ingredientMap = new Map(ingredients.map((item) => [item.id, item]));
    const recipeMap = new Map<string, RecipeState[]>();

    for (const row of recipeRows) {
      if (!row.listingId || !row.orderId || row.quantity == null) continue;
      const ingredient = ingredientMap.get(row.orderId);
      if (!ingredient) continue;
      const config = decodeRecipeNote(row.note);
      const component: RecipeState = {
        id: row.id,
        saleProductId: row.listingId,
        ingredientProductId: row.orderId,
        ingredientName: ingredient.name,
        ingredientUnit: ingredient.unit,
        ingredientQuantity: Number(ingredient.quantity),
        ingredientAverageCost: Number(ingredient.averageCost),
        quantity: Number(row.quantity),
        unit: config.unit,
        canRemove: config.canRemove,
        canExtra: config.canExtra,
        extraPrice: Number(row.previousQuantity ?? 0),
        yieldPercent: Number(row.newQuantity ?? 100),
      };
      const current = recipeMap.get(row.listingId) ?? [];
      current.push(component);
      recipeMap.set(row.listingId, current);
    }

    const plans: SalePlan[] = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const recipe = recipeMap.get(item.productId) ?? [];
      const saleMode = productConfigMap.get(item.productId)?.saleMode;
      const skipStock = saleMode === "SERVICE";
      if (!recipe.length) {
        return {
          input: item,
          product,
          unitPrice: item.unitPrice,
          unitCost: skipStock ? 0 : Number(product.averageCost),
          recipe: [],
          skipStock,
        };
      }

      const adjustmentMap = new Map((item.adjustments ?? []).map((adjustment) => [adjustment.componentId, adjustment.multiplier]));
      for (const adjustment of item.adjustments ?? []) {
        const component = recipe.find((row) => row.id === adjustment.componentId);
        if (!component) throw new Error("INVALID_RECIPE_ADJUSTMENT");
        if (adjustment.multiplier === 0 && !component.canRemove) throw new Error("RECIPE_COMPONENT_REQUIRED");
        if (adjustment.multiplier === 2 && !component.canExtra) throw new Error("RECIPE_EXTRA_NOT_ALLOWED");
      }

      let effectivePrice = item.unitPrice;
      let totalCost = 0;
      const consumption = recipe.map((component) => {
        const multiplier = adjustmentMap.get(component.id) ?? 1;
        const stockQuantity = requiredStockQuantity(component, item.quantity, multiplier);
        if (multiplier > 1) effectivePrice += component.extraPrice * (multiplier - 1);
        totalCost += stockQuantity * component.ingredientAverageCost;
        return { ...component, multiplier, stockQuantity };
      });

      return {
        input: item,
        product,
        unitPrice: effectivePrice,
        unitCost: item.quantity > 0 ? totalCost / item.quantity : 0,
        recipe: consumption,
        skipStock: false,
      };
    });

    for (const plan of plans) {
      if (!plan.input.serials?.length) continue;
      if (plan.recipe.length || plan.skipStock) throw new Error("SERIALS_NOT_ALLOWED_FOR_SALE_MODE");
      const expected = Math.round(plan.input.quantity);
      if (Math.abs(plan.input.quantity - expected) > 0.000001 || plan.input.serials.length !== expected) {
        throw new Error(`SERIAL_COUNT_MISMATCH:${expected}`);
      }
      const unique = new Set(plan.input.serials);
      if (unique.size !== plan.input.serials.length) throw new Error("DUPLICATE_SERIALS");
      const serialRows = await tx.inventoryAuditEvent.findMany({
        where: {
          businessId: input.businessId,
          action: "PRODUCT_SERIAL",
          listingId: plan.input.productId,
          itemName: { in: plan.input.serials },
          quantity: { gt: 0 },
        },
      });
      if (serialRows.length !== plan.input.serials.length) throw new Error("SERIAL_NOT_AVAILABLE");
    }

    const total = plans.reduce((sum, plan) => sum + plan.input.quantity * plan.unitPrice, 0);
    const costTotal = plans.reduce((sum, plan) => sum + plan.input.quantity * plan.unitCost, 0);

    const sale = await tx.sale.create({
      data: {
        businessId: input.businessId,
        invoiceNumber: input.invoiceNumber,
        paymentMethod: input.paymentMethod ?? "CASH",
        total,
        costTotal,
        items: {
          create: plans.map((plan) => ({
            productId: plan.input.productId,
            quantity: plan.input.quantity,
            unitPrice: plan.unitPrice,
            unitCost: plan.unitCost,
          })),
        },
      },
      include: { items: true },
    });

    for (const plan of plans) {
      if (plan.skipStock) {
        await tx.inventoryAuditEvent.create({
          data: {
            businessId: input.businessId,
            action: "SERVICE_SALE",
            listingId: plan.product.id,
            orderId: sale.id,
            itemName: plan.product.name,
            quantity: plan.input.quantity,
            actorUserId: input.actorUserId,
            actorName: input.actorName || "النظام",
            actorRole: input.actorRole,
            note: "خدمة مباعة بدون خصم مخزون",
          },
        });
        continue;
      }

      if (!plan.recipe.length) {
        const updated = await tx.product.updateMany({
          where: {
            id: plan.input.productId,
            businessId: input.businessId,
            quantity: { gte: plan.input.quantity },
          },
          data: { quantity: { decrement: plan.input.quantity } },
        });
        if (updated.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${plan.product.name}`);

        if (input.locationId) {
          await adjustLocationStock(tx, {
            businessId: input.businessId,
            locationId: input.locationId,
            productId: plan.input.productId,
            productName: plan.product.name,
            delta: -plan.input.quantity,
          });
        }
        await consumeLots(tx, {
          businessId: input.businessId,
          productId: plan.input.productId,
          quantity: plan.input.quantity,
          locationId: input.locationId,
        });
        await syncListingForProduct(tx, { businessId: input.businessId, productId: plan.input.productId, delta: -plan.input.quantity });

        if (plan.input.serials?.length) {
          for (const serial of plan.input.serials) {
            const row = await tx.inventoryAuditEvent.findFirst({
              where: { businessId: input.businessId, action: "PRODUCT_SERIAL", listingId: plan.input.productId, itemName: serial, quantity: { gt: 0 } },
            });
            if (!row) throw new Error(`SERIAL_NOT_AVAILABLE:${serial}`);
            await tx.inventoryAuditEvent.update({
              where: { id: row.id },
              data: { quantity: 0, orderId: sale.id, note: JSON.stringify({ status: "SOLD", saleId: sale.id, locationId: input.locationId || null }), occurredAt: new Date() },
            });
          }
        }

        await tx.stockMovement.create({
          data: {
            businessId: input.businessId,
            productId: plan.input.productId,
            type: "SALE",
            quantity: -plan.input.quantity,
            unitCost: plan.product.averageCost as never,
            sourceType: "Sale",
            sourceId: sale.id,
            note: plan.input.serials?.length ? `Serial: ${plan.input.serials.join(", ")}` : input.locationId ? `بيع من موقع المخزون ${input.locationId}` : undefined,
          },
        });
        continue;
      }

      const consumed: string[] = [];
      for (const component of plan.recipe) {
        if (component.stockQuantity <= 0) {
          consumed.push(`${component.ingredientName}: بدون`);
          continue;
        }
        const updated = await tx.product.updateMany({
          where: {
            id: component.ingredientProductId,
            businessId: input.businessId,
            quantity: { gte: component.stockQuantity },
          },
          data: { quantity: { decrement: component.stockQuantity } },
        });
        if (updated.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${component.ingredientName}`);

        if (input.locationId) {
          await adjustLocationStock(tx, {
            businessId: input.businessId,
            locationId: input.locationId,
            productId: component.ingredientProductId,
            productName: component.ingredientName,
            delta: -component.stockQuantity,
          });
        }
        await consumeLots(tx, {
          businessId: input.businessId,
          productId: component.ingredientProductId,
          quantity: component.stockQuantity,
          locationId: input.locationId,
        });
        await syncListingForProduct(tx, { businessId: input.businessId, productId: component.ingredientProductId, delta: -component.stockQuantity });

        await tx.stockMovement.create({
          data: {
            businessId: input.businessId,
            productId: component.ingredientProductId,
            type: "SALE",
            quantity: -component.stockQuantity,
            unitCost: component.ingredientAverageCost,
            sourceType: "RecipeSale",
            sourceId: sale.id,
            note: `${plan.product.name} · ${component.multiplier === 0 ? "بدون" : component.multiplier > 1 ? "إضافي" : "وصفة أساسية"}`,
          },
        });
        consumed.push(`${component.ingredientName}: ${component.stockQuantity.toFixed(3)} ${component.ingredientUnit}${component.multiplier > 1 ? " (إضافي)" : ""}`);
      }

      if (input.actorName) {
        await tx.inventoryAuditEvent.create({
          data: {
            businessId: input.businessId,
            action: "RECIPE_SALE",
            listingId: plan.product.id,
            itemName: plan.product.name,
            quantity: plan.input.quantity,
            actorUserId: input.actorUserId,
            actorName: input.actorName,
            actorRole: input.actorRole,
            note: consumed.join(" · "),
          },
        });
      }
    }

    if (input.actorName) {
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: input.businessId,
          action: "CASHIER_SALE",
          orderId: sale.id,
          itemName: input.invoiceNumber ? `فاتورة ${input.invoiceNumber}` : `فاتورة ${sale.id.slice(-8).toUpperCase()}`,
          quantity: total,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          note: `${input.items.length} صنف · إجمالي البيع ${total.toFixed(2)} ر.س${input.locationId ? ` · موقع ${input.locationId}` : ""}`,
        },
      });
    }

    return sale;
  });
}

export type ReceivePurchaseLineInput = {
  productId: string;
  receivedQty: number;
  unitCost: number;
  lotNumber?: string;
  expiresAt?: Date;
};

export type ReceivePurchaseInput = {
  businessId: string;
  purchaseOrderId: string;
  invoiceNumber?: string;
  issuedAt?: Date;
  locationId?: string | null;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  items: ReceivePurchaseLineInput[];
};

export async function receivePurchaseOrder(input: ReceivePurchaseInput) {
  return db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, businessId: input.businessId },
      include: { items: { include: { product: true } } },
    });

    if (!order) throw new Error("PURCHASE_ORDER_NOT_FOUND");
    if (order.status === "CANCELLED") throw new Error("PURCHASE_ORDER_CANCELLED");
    if (order.status === "RECEIVED") throw new Error("PURCHASE_ORDER_ALREADY_RECEIVED");

    const orderItemMap = new Map(order.items.map((item) => [item.productId, item]));

    for (const item of input.items) {
      const orderItem = orderItemMap.get(item.productId);
      if (!orderItem) throw new Error("PRODUCT_NOT_IN_PURCHASE_ORDER");

      const remaining = Number(orderItem.orderedQty) - Number(orderItem.receivedQty);
      if (item.receivedQty > remaining) {
        throw new Error(`RECEIVED_QTY_EXCEEDS_ORDER:${orderItem.product.name}`);
      }
    }

    const invoiceTotal = input.items.reduce((sum, item) => sum + item.receivedQty * item.unitCost, 0);
    const invoice = await tx.purchaseInvoice.create({
      data: {
        businessId: input.businessId,
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        invoiceNumber: input.invoiceNumber,
        invoiceTotal,
        issuedAt: input.issuedAt,
        approvedAt: new Date(),
        status: "APPROVED",
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            invoicedQty: item.receivedQty,
            receivedQty: item.receivedQty,
            unitCost: item.unitCost,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      const orderItem = orderItemMap.get(item.productId)!;
      const product = orderItem.product;
      const oldQty = Number(product.quantity);
      const oldCost = Number(product.averageCost);
      const newQty = oldQty + item.receivedQty;
      const newAverageCost = newQty === 0
        ? item.unitCost
        : ((oldQty * oldCost) + (item.receivedQty * item.unitCost)) / newQty;

      await tx.product.update({
        where: { id: product.id },
        data: {
          quantity: { increment: item.receivedQty },
          averageCost: newAverageCost,
        },
      });

      await tx.purchaseOrderItem.update({
        where: { id: orderItem.id },
        data: { receivedQty: { increment: item.receivedQty } },
      });

      if (input.locationId) {
        await adjustLocationStock(tx, {
          businessId: input.businessId,
          locationId: input.locationId,
          productId: product.id,
          productName: product.name,
          delta: item.receivedQty,
        });
      }

      await receiveLot(tx, {
        businessId: input.businessId,
        productId: product.id,
        productName: product.name,
        quantity: item.receivedQty,
        unitCost: item.unitCost,
        lotNumber: item.lotNumber,
        expiresAt: item.expiresAt,
        locationId: input.locationId,
        actor: { userId: input.actorUserId, name: input.actorName || "النظام", role: input.actorRole },
      });
      await syncListingForProduct(tx, { businessId: input.businessId, productId: product.id, delta: item.receivedQty });

      await tx.stockMovement.create({
        data: {
          businessId: input.businessId,
          productId: product.id,
          type: "PURCHASE_RECEIPT",
          quantity: item.receivedQty,
          unitCost: item.unitCost,
          sourceType: "PurchaseInvoice",
          sourceId: invoice.id,
          note: item.lotNumber ? `استلام دفعة ${item.lotNumber}` : undefined,
        },
      });

      if (input.actorName) {
        await tx.inventoryAuditEvent.create({
          data: {
            businessId: input.businessId,
            action: "SMART_RECEIPT",
            listingId: product.id,
            orderId: order.id,
            itemName: product.name,
            quantity: item.receivedQty,
            previousQuantity: Number(orderItem.orderedQty),
            newQuantity: Number(orderItem.receivedQty) + item.receivedQty,
            actorUserId: input.actorUserId,
            actorName: input.actorName,
            actorRole: input.actorRole,
            note: `المطلوب ${Number(orderItem.orderedQty).toLocaleString("ar-SA")} · المستلم في هذه العملية ${item.receivedQty.toLocaleString("ar-SA")}`,
          },
        });
      }
    }

    const updatedItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: order.id },
      select: { orderedQty: true, receivedQty: true },
    });

    const fullyReceived = updatedItems.every(
      (item) => Number(item.receivedQty) >= Number(item.orderedQty),
    );

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
        receivedAt: fullyReceived ? new Date() : null,
      },
    });

    return { invoice, fullyReceived };
  });
}
