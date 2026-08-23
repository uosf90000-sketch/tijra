import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { actorFromContext, listUnitConversions, upsertUnitConversion } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const schema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  factor: z.coerce.number().positive().max(1000000),
  barcode: z.string().trim().max(120).optional(),
  salePrice: z.coerce.number().nonnegative().max(1000000).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const productId = new URL(request.url).searchParams.get("productId");
  return NextResponse.json({ conversions: await listUnitConversions(auth.context.business.id, productId ? [productId] : undefined) });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  const product = await db.product.findFirst({ where: { id: parsed.data.productId, businessId: auth.context.business.id, active: true } });
  if (!product) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const conversion = await upsertUnitConversion({
    businessId: auth.context.business.id,
    productId: product.id,
    id: parsed.data.id,
    name: parsed.data.name,
    factor: parsed.data.factor,
    barcode: parsed.data.barcode || null,
    salePrice: parsed.data.salePrice ?? null,
    actor: actorFromContext(auth.context),
  });
  return NextResponse.json({ conversion }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const row = await db.inventoryAuditEvent.findFirst({ where: { id, businessId: auth.context.business.id, action: "UNIT_CONVERSION" } });
  if (!row) return NextResponse.json({ error: "CONVERSION_NOT_FOUND" }, { status: 404 });
  await db.inventoryAuditEvent.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
