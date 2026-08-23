import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const context = auth.context;

  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "RETAILER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const order = await db.$transaction(async (tx) => {
      const previous = await tx.marketplaceOrder.findFirst({
        where: { id, buyerBusinessId: context.business.id, status: "RECEIVED" },
        include: { items: { include: { listing: true } }, seller: true },
      });
      if (!previous) throw new Error("ORDER_NOT_FOUND");
      if (!previous.items.length) throw new Error("EMPTY_ORDER");

      let expectedTotal = 0;
      const lines: Array<{ listingId: string; quantity: number; unitPrice: number }> = [];

      for (const item of previous.items) {
        const listing = await tx.marketplaceListing.findUnique({ where: { id: item.listingId } });
        if (!listing || !listing.active) throw new Error(`LISTING_NOT_FOUND:${item.listing.name}`);
        if (listing.sellerBusinessId !== previous.sellerBusinessId) throw new Error("SELLER_CHANGED");

        const quantity = Number(item.quantity);
        const minimum = Number(listing.minOrderQty);
        const available = Number(listing.quantity);
        if (quantity < minimum) throw new Error(`BELOW_MINIMUM:${listing.name}`);
        if (quantity > available) throw new Error(`INSUFFICIENT_STOCK:${listing.name}`);

        const unitPrice = Number(listing.price);
        expectedTotal += unitPrice * quantity;
        lines.push({ listingId: listing.id, quantity, unitPrice });
      }

      const created = await tx.marketplaceOrder.create({
        data: {
          buyerBusinessId: context.business.id,
          sellerBusinessId: previous.sellerBusinessId,
          expectedTotal,
          notes: `إعادة طلب من ${previous.id.slice(-8).toUpperCase()}`,
          items: { create: lines },
        },
        include: { items: true, seller: true },
      });

      for (const line of lines) {
        const reserved = await tx.marketplaceListing.updateMany({
          where: { id: line.listingId, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (reserved.count !== 1) throw new Error("INSUFFICIENT_STOCK");
      }

      return created;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REPEAT_ORDER_FAILED";
    const status = code.startsWith("ORDER_NOT_FOUND") ? 404 : code.includes("INSUFFICIENT_STOCK") || code.includes("BELOW_MINIMUM") || code.includes("LISTING_NOT_FOUND") ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
