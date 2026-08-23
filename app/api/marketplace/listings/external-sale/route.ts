import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { syncProductForListing } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const externalSaleSchema = z.object({
  listingId: z.string().trim().optional(),
  barcode: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().positive().max(100000000),
}).refine((data) => Boolean(data.listingId || data.barcode), {
  message: "LISTING_OR_BARCODE_REQUIRED",
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;

  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = externalSaleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const { listingId, barcode, quantity } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const listing = listingId
        ? await tx.marketplaceListing.findFirst({
            where: { id: listingId, sellerBusinessId: context.business.id },
          })
        : await tx.marketplaceListing.findFirst({
            where: {
              sellerBusinessId: context.business.id,
              barcode: barcode || "__NO_BARCODE__",
            },
            orderBy: { updatedAt: "desc" },
          });

      if (!listing) throw new Error("LISTING_NOT_FOUND");

      const updated = await tx.marketplaceListing.updateMany({
        where: {
          id: listing.id,
          sellerBusinessId: context.business.id,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });

      if (updated.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${Number(listing.quantity)}`);

      const internalProduct = await syncProductForListing(tx, { businessId: context.business.id, listing, delta: -quantity });
      if (internalProduct) {
        await tx.stockMovement.create({
          data: {
            businessId: context.business.id,
            productId: internalProduct.id,
            type: "SALE",
            quantity: -quantity,
            unitCost: internalProduct.averageCost,
            sourceType: "EXTERNAL_SALE",
            sourceId: listing.id,
            note: "بيع خارجي مسجل لدى المورد",
          },
        });
      }

      const current = await tx.marketplaceListing.findUnique({ where: { id: listing.id } });
      if (!current) throw new Error("LISTING_NOT_FOUND");

      await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: "EXTERNAL_SALE",
          listingId: listing.id,
          itemName: listing.name,
          quantity,
          previousQuantity: Number(current.quantity) + quantity,
          newQuantity: Number(current.quantity),
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          note: "إخراج بضاعة بسبب بيع خارج تِجرا",
        },
      });

      return { current, internalProduct };
    });

    return NextResponse.json({
      listing: result.current,
      deducted: quantity,
      source: "EXTERNAL_SALE",
      actor: context.user.name,
      internalProductSynced: Boolean(result.internalProduct),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXTERNAL_SALE_FAILED";
    if (code === "LISTING_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (code.startsWith("INSUFFICIENT_STOCK:")) {
      return NextResponse.json({ error: "INSUFFICIENT_STOCK", available: Number(code.split(":")[1] || 0) }, { status: 409 });
    }
    return NextResponse.json({ error: "EXTERNAL_SALE_FAILED" }, { status: 500 });
  }
}
