import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAppPermission } from "@/lib/access";
import { requireApiAnyPermission } from "@/lib/api-auth";
import { adjustLocationStock, ensureDefaultLocation, syncProductForListing } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const schema = z.object({ action: z.enum(["ACCEPT", "CANCEL", "RECEIVE"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAnyPermission(["PURCHASES", "INVENTORY"]);
  if (auth.response) return auth.response;
  const context = auth.context;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;
  const receiptLocation = parsed.data.action === "RECEIVE" ? await ensureDefaultLocation(context.business.id) : null;

  try {
    const result = await db.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findUnique({
        where: { id },
        include: { items: { include: { listing: true } } },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");

      const isSeller = order.sellerBusinessId === context.business.id;
      const isBuyer = order.buyerBusinessId === context.business.id;

      if (parsed.data.action === "ACCEPT") {
        if (!isSeller || !hasAppPermission(context.membership, "INVENTORY")) throw new Error("FORBIDDEN");
        if (order.status !== "PLACED") throw new Error("INVALID_STATUS");

        const updatedOrder = await tx.marketplaceOrder.update({
          where: { id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });

        for (const item of order.items) {
          await tx.inventoryAuditEvent.create({
            data: {
              businessId: context.business.id,
              action: "OUTBOUND_ORDER",
              listingId: item.listingId,
              orderId: order.id,
              itemName: item.listing.name,
              quantity: Number(item.quantity),
              previousQuantity: Number(item.listing.quantity),
              newQuantity: Number(item.listing.quantity),
              actorUserId: context.user.id,
              actorName: context.user.name,
              actorRole: context.membership.role,
              note: "تم اعتماد الطلب. الكمية كانت محجوزة عند إنشاء الطلب.",
            },
          });
        }

        return updatedOrder;
      }

      if (parsed.data.action === "CANCEL") {
        if (!isSeller && !isBuyer) throw new Error("FORBIDDEN");
        if (isSeller && !hasAppPermission(context.membership, "INVENTORY")) throw new Error("FORBIDDEN");
        if (isBuyer && !hasAppPermission(context.membership, "PURCHASES")) throw new Error("FORBIDDEN");
        if (!["PLACED", "ACCEPTED"].includes(order.status)) throw new Error("INVALID_STATUS");

        for (const item of order.items) {
          const restored = await tx.marketplaceListing.update({
            where: { id: item.listingId },
            data: { quantity: { increment: item.quantity } },
          });
          const internalProduct = await syncProductForListing(tx, { businessId: order.sellerBusinessId, listing: item.listing, delta: Number(item.quantity) });
          if (internalProduct) {
            await tx.stockMovement.create({
              data: {
                businessId: order.sellerBusinessId,
                productId: internalProduct.id,
                type: "ADJUSTMENT_IN",
                quantity: Number(item.quantity),
                unitCost: internalProduct.averageCost,
                sourceType: "MARKETPLACE_ORDER_CANCEL",
                sourceId: order.id,
                note: "فك حجز البضاعة بعد إلغاء طلب التاجر",
              },
            });
          }

          if (isSeller) {
            await tx.inventoryAuditEvent.create({
              data: {
                businessId: context.business.id,
                action: "ORDER_CANCEL_RESTORE",
                listingId: item.listingId,
                orderId: order.id,
                itemName: item.listing.name,
                quantity: Number(item.quantity),
                previousQuantity: Number(restored.quantity) - Number(item.quantity),
                newQuantity: Number(restored.quantity),
                actorUserId: context.user.id,
                actorName: context.user.name,
                actorRole: context.membership.role,
                note: "إرجاع الكمية للمخزون بعد إلغاء الطلب",
              },
            });
          }
        }
        return tx.marketplaceOrder.update({ where: { id }, data: { status: "CANCELLED" } });
      }

      if (!isBuyer || !hasAppPermission(context.membership, "PURCHASES")) throw new Error("FORBIDDEN");
      if (order.status !== "ACCEPTED") throw new Error("INVALID_STATUS");
      if (!receiptLocation) throw new Error("RECEIPT_LOCATION_NOT_FOUND");

      for (const item of order.items) {
        const listing = item.listing;
        const qty = Number(item.quantity);
        const unitCost = Number(item.unitPrice);
        const existing = listing.barcode
          ? await tx.product.findFirst({ where: { businessId: context.business.id, barcode: listing.barcode, active: true } })
          : await tx.product.findFirst({ where: { businessId: context.business.id, name: listing.name, active: true } });

        if (existing) {
          const oldQty = Number(existing.quantity);
          const oldCost = Number(existing.averageCost);
          const newQty = oldQty + qty;
          const weightedCost = newQty > 0 ? ((oldQty * oldCost) + (qty * unitCost)) / newQty : unitCost;
          await tx.product.update({ where: { id: existing.id }, data: { quantity: newQty, averageCost: weightedCost } });
          await adjustLocationStock(tx, { businessId: context.business.id, locationId: receiptLocation.id, productId: existing.id, productName: existing.name, delta: qty });
          await tx.stockMovement.create({
            data: {
              businessId: context.business.id,
              productId: existing.id,
              type: "PURCHASE_RECEIPT",
              quantity: qty,
              unitCost,
              sourceType: "MARKETPLACE_ORDER",
              sourceId: order.id,
              note: `استلام من سوق تِجرا - ${listing.name}`,
            },
          });
          await tx.inventoryAuditEvent.create({
            data: {
              businessId: context.business.id,
              action: "SMART_RECEIPT",
              listingId: existing.id,
              orderId: order.id,
              itemName: existing.name,
              quantity: qty,
              previousQuantity: qty,
              newQuantity: qty,
              actorUserId: context.user.id,
              actorName: context.user.name,
              actorRole: context.membership.role,
              note: `استلام طلب سوق إلى ${receiptLocation.name}`,
            },
          });
        } else {
          const product = await tx.product.create({
            data: {
              businessId: context.business.id,
              name: listing.name,
              sku: listing.sku,
              barcode: listing.barcode,
              category: listing.category,
              unit: listing.unit,
              salePrice: unitCost,
              averageCost: unitCost,
              quantity: qty,
              reorderPoint: 0,
            },
          });
          await adjustLocationStock(tx, { businessId: context.business.id, locationId: receiptLocation.id, productId: product.id, productName: product.name, delta: qty });
          await tx.stockMovement.create({
            data: {
              businessId: context.business.id,
              productId: product.id,
              type: "PURCHASE_RECEIPT",
              quantity: qty,
              unitCost,
              sourceType: "MARKETPLACE_ORDER",
              sourceId: order.id,
              note: `استلام من سوق تِجرا - ${listing.name}`,
            },
          });
          await tx.inventoryAuditEvent.create({
            data: {
              businessId: context.business.id,
              action: "SMART_RECEIPT",
              listingId: product.id,
              orderId: order.id,
              itemName: product.name,
              quantity: qty,
              previousQuantity: qty,
              newQuantity: qty,
              actorUserId: context.user.id,
              actorName: context.user.name,
              actorRole: context.membership.role,
              note: `إنشاء الصنف واستلامه إلى ${receiptLocation.name}`,
            },
          });
        }
      }

      return tx.marketplaceOrder.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    });

    return NextResponse.json({ order: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UPDATE_FAILED";
    const status = code === "ORDER_NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "INVALID_STATUS" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
