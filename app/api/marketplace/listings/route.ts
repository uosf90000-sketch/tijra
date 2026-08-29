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

function isBrowserForm(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
}

function sellerRedirect(request: Request, publish: "success" | "duplicate" | "invalid" | "failed") {
  const url = new URL("/marketplace/seller", request.url);
  url.searchParams.set("publish", publish);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  if (!["SUPPLIER", "BOTH"].includes(auth.context.business.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }
  const url = new URL(request.url);
  const sku = url.searchParams.get("sku")?.trim();
  const barcode = url.searchParams.get("barcode")?.trim();
  const name = url.searchParams.get("name")?.trim();
  if (!sku && !barcode && !name) return NextResponse.json({ error: "IDENTIFIER_REQUIRED" }, { status: 400 });

  const listing = await db.marketplaceListing.findFirst({
    where: {
      sellerBusinessId: auth.context.business.id,
      ...(barcode ? { barcode } : sku ? { sku } : { name }),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ exists: Boolean(listing), listing });
}

export async function POST(request: Request) {
  const browserForm = isBrowserForm(request);
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) {
    return browserForm ? sellerRedirect(request, "failed") : NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  let raw: unknown;
  try {
    if (browserForm) {
      const form = await request.formData();
      raw = Object.fromEntries(form.entries());
    } else {
      raw = await request.json();
    }
  } catch {
    return browserForm ? sellerRedirect(request, "invalid") : NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = listingSchema.safeParse(raw);
  if (!parsed.success) {
    return browserForm
      ? sellerRedirect(request, "invalid")
      : NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const existingListing = await tx.marketplaceListing.findFirst({
        where: {
          sellerBusinessId: context.business.id,
          name: parsed.data.name,
          unit: parsed.data.unit,
          price: parsed.data.price,
          quantity: parsed.data.quantity,
          minOrderQty: parsed.data.minOrderQty,
          ...(parsed.data.barcode ? { barcode: parsed.data.barcode } : parsed.data.sku ? { sku: parsed.data.sku } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingListing) {
        const link = await tx.inventoryAuditEvent.findFirst({
          where: { businessId: context.business.id, action: "LISTING_LINKED_PRODUCT", listingId: existingListing.id },
          select: { orderId: true },
        });
        const product = link?.orderId
          ? await tx.product.findFirst({ where: { id: link.orderId, businessId: context.business.id } })
          : null;
        return { listing: existingListing, product, sharedInventory: Boolean(product), duplicate: true };
      }

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

      return { listing, product, sharedInventory: true, duplicate: false };
    });

    if (browserForm) return sellerRedirect(request, result.duplicate ? "duplicate" : "success");
    return NextResponse.json({ listing: result.listing, product: result.product, sharedInventory: result.sharedInventory, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch {
    return browserForm
      ? sellerRedirect(request, "failed")
      : NextResponse.json({ error: "LISTING_SAVE_FAILED" }, { status: 500 });
  }
}
