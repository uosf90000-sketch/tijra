import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  listingId: z.string().min(1),
  minQty: z.coerce.number().positive().max(100000000),
  price: z.coerce.number().positive().max(1000000),
  customerBusinessId: z.string().trim().optional(),
  validUntil: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const listing = await db.marketplaceListing.findFirst({ where: { id: parsed.data.listingId, sellerBusinessId: context.business.id } });
  if (!listing) return NextResponse.json({ error: "LISTING_NOT_FOUND" }, { status: 404 });
  const validUntil = parsed.data.validUntil ? new Date(`${parsed.data.validUntil}T23:59:59`) : null;
  if (validUntil && Number.isNaN(validUntil.getTime())) return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });

  const tier = await db.inventoryAuditEvent.create({
    data: {
      businessId: context.business.id,
      action: "LISTING_PRICE_TIER",
      listingId: listing.id,
      itemName: listing.name,
      quantity: parsed.data.minQty,
      previousQuantity: parsed.data.price,
      actorUserId: context.user.id,
      actorName: context.user.name,
      actorRole: context.membership.role,
      note: JSON.stringify({ customerBusinessId: parsed.data.customerBusinessId || null, validUntil: validUntil?.toISOString() || null }),
    },
  });
  return NextResponse.json({ tier }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const tier = await db.inventoryAuditEvent.findFirst({ where: { id, businessId: auth.context.business.id, action: "LISTING_PRICE_TIER" } });
  if (!tier) return NextResponse.json({ error: "TIER_NOT_FOUND" }, { status: 404 });
  await db.inventoryAuditEvent.delete({ where: { id: tier.id } });
  return NextResponse.json({ ok: true });
}
