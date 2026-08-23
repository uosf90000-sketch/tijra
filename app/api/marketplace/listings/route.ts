import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const listingSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  category: z.string().trim().max(100).optional(),
  activity: z.enum(["GROCERY", "ELECTRONICS", "PHARMACY", "RESTAURANT", "CAFE", "FASHION", "BEAUTY", "HARDWARE", "OFFICE", "OTHER"]),
  unit: z.string().trim().min(1).max(40).default("piece"),
  price: z.coerce.number().positive().max(1000000),
  quantity: z.coerce.number().nonnegative().max(100000000),
  minOrderQty: z.coerce.number().positive().max(100000000).default(1),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = listingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const result = await db.$transaction(async (tx) => {
    const existingProduct = parsed.data.barcode
      ? await tx.product.findFirst({ where: { businessId: context.business.id, barcode: parsed.data.barcode, active: true } })
      : parsed.data.sku
        ? await tx.product.findFirst({ where: { businessId: context.business.id, sku: parsed.data.sku, active: true } })
        : await tx.product.findFirst({ where: { businessId: context.business.id, name: parsed.data.name, unit: parsed.data.unit, active: true } });

    const product = existingProduct ?? await tx.product.create({
      data: {
        businessId: context.business.id,
        name: parsed.data.name,
        sku: parsed.data.sku || null,
        barcode: parsed.data.barcode || null,
        category: parsed.data.category || null,
        unit: parsed.data.unit,
        salePrice: parsed.data.price,
        averageCost: 0,
        quantity: parsed.data.quantity,
        reorderPoint: 0,
      },
    });

    const listing = await tx.marketplaceListing.create({
      data: {
        sellerBusinessId: context.business.id,
        name: parsed.data.name,
        sku: parsed.data.sku || null,
        barcode: parsed.data.barcode || null,
        category: parsed.data.category || null,
        activity: parsed.data.activity,
        unit: parsed.data.unit,
        price: parsed.data.price,
        quantity: Number(product.quantity),
        minOrderQty: parsed.data.minOrderQty,
      },
    });

    await tx.inventoryAuditEvent.create({
      data: {
        businessId: context.business.id,
        action: "LISTING_LINKED_PRODUCT",
        listingId: listing.id,
        orderId: product.id,
        itemName: listing.name,
        quantity: Number(product.quantity),
        actorUserId: context.user.id,
        actorName: context.user.name,
        actorRole: context.membership.role,
        note: existingProduct ? "تم ربط العرض بالمخزون الداخلي الموجود" : "تم إنشاء مخزون داخلي وربطه بعرض المورد",
      },
    });

    return { listing, product };
  });

  return NextResponse.json({ listing: result.listing, product: result.product, sharedInventory: true }, { status: 201 });
}
