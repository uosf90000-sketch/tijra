import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAppPermission } from "@/lib/access";
import { requireApiAnyPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({ action: z.enum(["ACCEPT", "CANCEL", "RECEIVE"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAnyPermission(["PURCHASES", "INVENTORY"]);
  if (auth.response) return auth.response;
  const context = auth.context;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

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
        return tx.marketplaceOrder.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      }

      if (parsed.data.action === "CANCEL") {
        if (!isSeller && !isBuyer) throw new Error("FORBIDDEN");
        if (isSeller && !hasAppPermission(context.membership, "INVENTORY")) throw new Error("FORBIDDEN");
        if (isBuyer && !hasAppPermission(context.membership, "PURCHASES")) throw new Error("FORBIDDEN");
        if (!['PLACED', 'ACCEPTED'].includes(order.status)) throw new Error("INVALID_STATUS");
        for (const item of order.items) {
          await tx.marketplaceListing.update({ where: { id: item.listingId }, data: { quantity: { increment: item.quantity } } });
        }
        return tx.marketplaceOrder.update({ where: { id }, data: { status: "CANCELLED" } });
      }

      if (!isBuyer || !hasAppPermission(context.membership, "PURCHASES")) throw new Error("FORBIDDEN");
      if (order.status !== "ACCEPTED") throw new Error("INVALID_STATUS");

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
