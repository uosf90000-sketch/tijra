import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { safeJson, syncProductForListing } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const orderItemSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100000000),
});

const orderSchema = z.union([
  orderItemSchema,
  z.object({ items: z.array(orderItemSchema).min(1).max(100) }),
]);

type CartItem = z.infer<typeof orderItemSchema>;

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const context = auth.context;
  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "RETAILER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const incomingItems: CartItem[] = "items" in parsed.data ? parsed.data.items : [parsed.data];
  const combined = new Map<string, number>();
  for (const item of incomingItems) combined.set(item.listingId, (combined.get(item.listingId) ?? 0) + item.quantity);
  const cartItems = [...combined.entries()].map(([listingId, quantity]) => ({ listingId, quantity }));

  try {
    const orders = await db.$transaction(async (tx) => {
      const listingIds = cartItems.map((item) => item.listingId);
      // Serialize reservations per listing. Sorting keeps multi-listing carts from
      // acquiring the same advisory locks in different orders and deadlocking.
      for (const listingId of [...listingIds].sort()) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tijra-marketplace-listing'), hashtext(${listingId}))`;
      }

      const listings = await tx.marketplaceListing.findMany({ where: { id: { in: listingIds } } });
      const listingMap = new Map(listings.map((listing) => [listing.id, listing]));

      if (listings.length !== listingIds.length) throw new Error("LISTING_NOT_FOUND");

      for (const item of cartItems) {
        const listing = listingMap.get(item.listingId);
        if (!listing || !listing.active) throw new Error("LISTING_NOT_FOUND");
        if (listing.sellerBusinessId === context.business.id) throw new Error("SELF_ORDER_NOT_ALLOWED");
        const min = Number(listing.minOrderQty);
        const available = Number(listing.quantity);
        if (item.quantity < min) throw new Error(`BELOW_MINIMUM:${listing.id}`);
        if (item.quantity > available) throw new Error(`INSUFFICIENT_STOCK:${listing.id}`);
      }

      const tierRows = await tx.inventoryAuditEvent.findMany({
        where: {
          action: "LISTING_PRICE_TIER",
          listingId: { in: listingIds },
          businessId: { in: [...new Set(listings.map((listing) => listing.sellerBusinessId))] },
        },
      });
      const tiersByListing = new Map<string, typeof tierRows>();
      for (const tier of tierRows) {
        if (!tier.listingId) continue;
        const current = tiersByListing.get(tier.listingId) ?? [];
        current.push(tier);
        tiersByListing.set(tier.listingId, current);
      }

      const now = Date.now();
      const pricedItems = cartItems.map((item) => {
        const listing = listingMap.get(item.listingId)!;
        const eligible = (tiersByListing.get(listing.id) ?? []).map((tier) => {
          const config = safeJson<{ customerBusinessId?: string | null; validUntil?: string | null }>(tier.note, {});
          const validUntil = config.validUntil ? new Date(config.validUntil).getTime() : null;
          return {
            minQty: Number(tier.quantity ?? 0),
            price: Number(tier.previousQuantity ?? listing.price),
            customerBusinessId: config.customerBusinessId || null,
            expired: validUntil != null && validUntil < now,
          };
        }).filter((tier) => !tier.expired && tier.minQty <= item.quantity && (!tier.customerBusinessId || tier.customerBusinessId === context.business.id))
          .sort((a, b) => {
            const aSpecific = a.customerBusinessId ? 1 : 0;
            const bSpecific = b.customerBusinessId ? 1 : 0;
            if (aSpecific !== bSpecific) return bSpecific - aSpecific;
            if (a.minQty !== b.minQty) return b.minQty - a.minQty;
            return a.price - b.price;
          });

        return {
          ...item,
          listing,
          unitPrice: eligible[0]?.price ?? Number(listing.price),
          tierApplied: Boolean(eligible[0]),
        };
      });

      const groups = new Map<string, typeof pricedItems>();
      for (const item of pricedItems) {
        const current = groups.get(item.listing.sellerBusinessId) ?? [];
        current.push(item);
        groups.set(item.listing.sellerBusinessId, current);
      }

      const createdOrders = [];
      for (const [sellerBusinessId, items] of groups) {
        const expectedTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        const created = await tx.marketplaceOrder.create({
          data: {
            buyerBusinessId: context.business.id,
            sellerBusinessId,
            expectedTotal,
            notes: items.some((item) => item.tierApplied) ? "تم تطبيق أسعار كمية على بعض أصناف الطلب." : undefined,
            items: {
              create: items.map((item) => ({ listingId: item.listingId, quantity: item.quantity, unitPrice: item.unitPrice })),
            },
          },
          include: { items: true, seller: true },
        });

        for (const item of items) {
          await tx.marketplaceListing.update({ where: { id: item.listingId }, data: { quantity: { decrement: item.quantity } } });
          const internalProduct = await syncProductForListing(tx, {
            businessId: sellerBusinessId,
            listing: item.listing,
            delta: -item.quantity,
          });
          if (internalProduct) {
            await tx.stockMovement.create({
              data: {
                businessId: sellerBusinessId,
                productId: internalProduct.id,
                type: "ADJUSTMENT_OUT",
                quantity: -item.quantity,
                unitCost: internalProduct.averageCost,
                sourceType: "MARKETPLACE_ORDER_RESERVATION",
                sourceId: created.id,
                note: `حجز بضاعة لطلب تاجر ${created.id.slice(-8).toUpperCase()}`,
              },
            });
          }
        }
        createdOrders.push(created);
      }

      return createdOrders;
    });

    return NextResponse.json({ orders, order: orders[0] ?? null }, { status: 201 });
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : "ORDER_FAILED";
    const code = rawCode.split(":")[0];
    const listingId = rawCode.includes(":") ? rawCode.split(":")[1] : undefined;
    const status = code === "LISTING_NOT_FOUND" ? 404 : ["INSUFFICIENT_STOCK", "BELOW_MINIMUM", "SELF_ORDER_NOT_ALLOWED"].includes(code) ? 409 : 500;
    return NextResponse.json({ error: code, listingId }, { status });
  }
}
