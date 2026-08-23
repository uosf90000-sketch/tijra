import { db } from "@/lib/db";

export type SaleLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type RecordSaleInput = {
  businessId: string;
  invoiceNumber?: string;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  items: SaleLineInput[];
};

export async function recordSale(input: RecordSaleInput) {
  return db.$transaction(async (tx) => {
    const productIds = input.items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { businessId: input.businessId, id: { in: productIds }, active: true },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));

    if (productMap.size !== productIds.length) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const costTotal = input.items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      return sum + item.quantity * Number(product?.averageCost ?? 0);
    }, 0);

    const sale = await tx.sale.create({
      data: {
        businessId: input.businessId,
        invoiceNumber: input.invoiceNumber,
        paymentMethod: input.paymentMethod ?? "CASH",
        total,
        costTotal,
        items: {
          create: input.items.map((item) => {
            const product = productMap.get(item.productId)!;
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: product.averageCost,
            };
          }),
        },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      const updated = await tx.product.updateMany({
        where: {
          id: item.productId,
          businessId: input.businessId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });

      if (updated.count !== 1) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      }

      await tx.stockMovement.create({
        data: {
          businessId: input.businessId,
          productId: item.productId,
          type: "SALE",
          quantity: -item.quantity,
          unitCost: product.averageCost,
          sourceType: "Sale",
          sourceId: sale.id,
        },
      });
    }

    if (input.actorName) {
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: input.businessId,
          action: "CASHIER_SALE",
          itemName: input.invoiceNumber ? `فاتورة ${input.invoiceNumber}` : `فاتورة ${sale.id.slice(-8).toUpperCase()}`,
          quantity: total,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          note: `${input.items.length} صنف · إجمالي البيع ${total.toFixed(2)} ر.س`,
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
};

export type ReceivePurchaseInput = {
  businessId: string;
  purchaseOrderId: string;
  invoiceNumber?: string;
  issuedAt?: Date;
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

      await tx.stockMovement.create({
        data: {
          businessId: input.businessId,
          productId: product.id,
          type: "PURCHASE_RECEIPT",
          quantity: item.receivedQty,
          unitCost: item.unitCost,
          sourceType: "PurchaseInvoice",
          sourceId: invoice.id,
        },
      });
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
