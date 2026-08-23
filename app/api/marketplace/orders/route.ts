import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { safeJson, syncProductForListing } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const orderSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100000000),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const context = auth.context;
  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "RETAILER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  try {
    const order = await db.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({ where: { id: parsed.data.listingId } });
      if (!listing || !listing.active) throw new Error("LISTING_NOT_FOUND");
      if (listing.sellerBusinessId === context.business.id) throw new Error("SELF_ORDER_NOT_ALLOWED");

      const qty = parsed.data.quantity;
      const min = Number(listing.minOrderQty);
      const available = Number(listing.quantity);
      if (qty < min) throw new Error("BELOW_MINIMUM");
      if (qty > available) throw new Error("INSUFFICIENT_STOCK");

      const tiers = await tx.inventoryAuditEvent.findMany({
        where: { businessId: listing.sellerBusinessId, action: "LISTING_PRICE_TIER", listingId: listing.id },
      });
      const now = Date.now();
      const eligible = tiers.map((tier) => {
        const config = safeJson<{ customerBusinessId?: string | null; validUntil?: string | null }>(tier.note, {});
        const validUntil = config.validUntil ? new Date(config.validUntil).getTime() : null;
        return {
          minQty: Number(tier.quantity ?? 0),
          price: Number(tier.previousQuantity ?? listing.price),
          customerBusinessId: config.customerBusinessId || null,
          expired: validUntil != null && validUntil < now,
        };
      }).filter((tier) => !tier.expired && tier.minQty <= qty && (!tier.customerBusinessId || tier.customerBusinessId === context.business.id))
        .sort((a, b) => {
          const aSpecific = a.customerBusinessId ? 1 : 0;
          const bSpecific = b.customerBusinessId ? 1 : 0;
          if (aSpecific !== bSpecific) return bSpecific - aSpecific;
          if (a.minQty !== b.minQty) return b.minQty - a.minQty;
          return a.price - b.price;
        });

      const unitPrice = eligible[0]?.price ?? Number(listing.price);
      const created = await tx.marketplaceOrder.create({
        data: {
          buyerBusinessId: context.business.id,
          sellerBusinessId: listing.sellerBusinessId,
          expectedTotal: unitPrice * qty,
          notes: eligible[0] ? `تم تطبيق سعر كمية: ${unitPrice.toFixed(2)} ر.س` : undefined,
          items: { create: { listingId: listing.id, quantity: qty, unitPrice } },
        },
        include: { items: true, seller: true },
      });

      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { quantity: { decrement: qty } },
      });
      const internalProduct = await syncProductForListing(tx, { businessId: listing.sellerBusinessId, listing, delta: -qty });
      if (internalProduct) {
        await tx.stockMovement.create({
          data: {
            businessId: listing.sellerBusinessId,
            productId: internalProduct.id,
            type: "ADJUSTMENT_OUT",
            quantity: -qty,
            unitCost: internalProduct.averageCost,
            sourceType: "MARKETPLACE_ORDER_RESERVATION",
            sourceId: created.id,
            note: `حجز بضاعة لطلب تاجر ${created.id.slice(-8).toUpperCase()}`,
          },
        });
      }
      return created;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ORDER_FAILED";
    const status = code === "LISTING_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" || code === "BELOW_MINIMUM" || code === "SELF_ORDER_NOT_ALLOWED" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
