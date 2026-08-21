import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

const orderSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100000000),
});

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!['RETAILER', 'BOTH'].includes(context.business.businessType)) {
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

      const unitPrice = Number(listing.price);
      const created = await tx.marketplaceOrder.create({
        data: {
          buyerBusinessId: context.business.id,
          sellerBusinessId: listing.sellerBusinessId,
          expectedTotal: unitPrice * qty,
          items: { create: { listingId: listing.id, quantity: qty, unitPrice } },
        },
        include: { items: true, seller: true },
      });

      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { quantity: { decrement: qty } },
      });
      return created;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ORDER_FAILED";
    const status = code === "LISTING_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" || code === "BELOW_MINIMUM" || code === "SELF_ORDER_NOT_ALLOWED" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
