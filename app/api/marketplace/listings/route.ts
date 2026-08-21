import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
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
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = listingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const listing = await db.marketplaceListing.create({
    data: {
      sellerBusinessId: context.business.id,
      name: parsed.data.name,
      sku: parsed.data.sku || null,
      barcode: parsed.data.barcode || null,
      category: parsed.data.category || null,
      activity: parsed.data.activity,
      unit: parsed.data.unit,
      price: parsed.data.price,
      quantity: parsed.data.quantity,
      minOrderQty: parsed.data.minOrderQty,
    },
  });

  return NextResponse.json({ listing }, { status: 201 });
}
