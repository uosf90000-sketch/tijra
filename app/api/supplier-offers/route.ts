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

  const offer = await db.$transaction(async (tx) => {
    const existing = await tx.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
    });
    const updated = await tx.supplierProduct.upsert({
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
    // Append an immutable price observation only when the quoted price or MOQ changes.
    // First quotes establish a baseline rather than a fake price increase.
    if (!existing || Number(existing.price) !== parsed.data.price ||
        Number(existing.minOrderQty ?? 0) !== Number(parsed.data.minOrderQty ?? 0)) {
      await tx.supplierPriceHistory.create({
        data: {
          businessId: auth.context.business.id,
          supplierId: supplier.id,
          productId: product.id,
          price: parsed.data.price,
          minOrderQty: parsed.data.minOrderQty,
          source: "QUOTE",
        },
      });
    }
    return updated;
  });

  return NextResponse.json({ offer }, { status: 201 });
}
