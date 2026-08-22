import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
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
  const listing = listingId
    ? await db.marketplaceListing.findFirst({
        where: { id: listingId, sellerBusinessId: context.business.id },
      })
    : await db.marketplaceListing.findFirst({
        where: {
          sellerBusinessId: context.business.id,
          barcode: barcode || "__NO_BARCODE__",
        },
        orderBy: { updatedAt: "desc" },
      });

  if (!listing) {
    return NextResponse.json({ error: "LISTING_NOT_FOUND" }, { status: 404 });
  }

  const updated = await db.marketplaceListing.updateMany({
    where: {
      id: listing.id,
      sellerBusinessId: context.business.id,
      quantity: { gte: quantity },
    },
    data: {
      quantity: { decrement: quantity },
    },
  });

  if (updated.count !== 1) {
    return NextResponse.json({
      error: "INSUFFICIENT_STOCK",
      available: Number(listing.quantity),
    }, { status: 409 });
  }

  const current = await db.marketplaceListing.findUnique({ where: { id: listing.id } });
  return NextResponse.json({
    listing: current,
    deducted: quantity,
    source: "EXTERNAL_SALE",
  });
}
