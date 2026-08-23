import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  listingId: z.string().trim().optional(),
  barcode: z.string().trim().max(80).optional(),
  delta: z.coerce.number().refine((value) => value !== 0 && Math.abs(value) <= 100000000),
}).refine((data) => Boolean(data.listingId || data.barcode), { message: "LISTING_OR_BARCODE_REQUIRED" });

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;

  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const { listingId, barcode, delta } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const listing = listingId
        ? await tx.marketplaceListing.findFirst({ where: { id: listingId, sellerBusinessId: context.business.id } })
        : await tx.marketplaceListing.findFirst({ where: { sellerBusinessId: context.business.id, barcode: barcode || "__NO_BARCODE__" }, orderBy: { updatedAt: "desc" } });
      if (!listing) throw new Error("LISTING_NOT_FOUND");

      const previousQuantity = Number(listing.quantity);
      const newQuantity = previousQuantity + delta;
      if (newQuantity < 0) throw new Error("INSUFFICIENT_STOCK");

      const updated = await tx.marketplaceListing.update({ where: { id: listing.id }, data: { quantity: newQuantity } });
      const event = await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: delta > 0 ? "STOCK_IN" : "STOCK_OUT",
          listingId: listing.id,
          itemName: listing.name,
          quantity: Math.abs(delta),
          previousQuantity,
          newQuantity,
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          note: delta > 0 ? "إضافة سريعة للمخزون" : "إخراج سريع من المخزون",
        },
      });

      return { updated, event };
    });

    return NextResponse.json({ listing: result.updated, event: result.event, delta });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STOCK_UPDATE_FAILED";
    const status = code === "LISTING_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
