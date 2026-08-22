import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  supplierId: z.string().min(1),
  productId: z.string().min(1),
  supplierSku: z.string().trim().max(80).optional(),
  price: z.number().nonnegative(),
  minOrderQty: z.number().nonnegative().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const [supplier, product] = await Promise.all([
    db.supplier.findFirst({ where: { id: parsed.data.supplierId, businessId: auth.context.business.id } }),
    db.product.findFirst({ where: { id: parsed.data.productId, businessId: auth.context.business.id, active: true } }),
  ]);
  if (!supplier || !product) return NextResponse.json({ error: "SUPPLIER_OR_PRODUCT_NOT_FOUND" }, { status: 404 });

  const offer = await db.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
    create: {
      supplierId: supplier.id,
      productId: product.id,
      supplierSku: parsed.data.supplierSku || null,
      price: parsed.data.price,
      minOrderQty: parsed.data.minOrderQty,
    },
    update: {
      supplierSku: parsed.data.supplierSku || null,
      price: parsed.data.price,
      minOrderQty: parsed.data.minOrderQty,
      lastQuotedAt: new Date(),
    },
  });

  return NextResponse.json({ offer }, { status: 201 });
}
