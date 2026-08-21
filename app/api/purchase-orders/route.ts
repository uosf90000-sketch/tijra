import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const itemSchema = z.object({
  productId: z.string().min(1),
  orderedQty: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const orderSchema = z.object({
  supplierId: z.string().min(1),
  orderNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
  sendNow: z.boolean().default(true),
  items: z.array(itemSchema).min(1).max(500),
}).superRefine((data, ctx) => {
  const ids = data.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Duplicate products are not allowed" });
  }
});

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;

  const orders = await db.purchaseOrder.findMany({
    where: { businessId: auth.context.business.id },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER"]);
  if (auth.response) return auth.response;
  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const supplier = await db.supplier.findFirst({
    where: { id: parsed.data.supplierId, businessId: auth.context.business.id },
  });
  if (!supplier) return NextResponse.json({ error: "SUPPLIER_NOT_FOUND" }, { status: 404 });

  const productIds = parsed.data.items.map((item) => item.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds }, businessId: auth.context.business.id, active: true },
    select: { id: true },
  });
  if (products.length !== productIds.length) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const expectedTotal = parsed.data.items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
  const order = await db.purchaseOrder.create({
    data: {
      businessId: auth.context.business.id,
      supplierId: supplier.id,
      orderNumber: parsed.data.orderNumber || null,
      notes: parsed.data.notes || null,
      expectedTotal,
      status: parsed.data.sendNow ? "SENT" : "DRAFT",
      orderedAt: parsed.data.sendNow ? new Date() : null,
      items: {
        create: parsed.data.items.map((item) => ({
          productId: item.productId,
          orderedQty: item.orderedQty,
          unitCost: item.unitCost,
        })),
      },
    },
    include: { supplier: true, items: { include: { product: true } } },
  });

  return NextResponse.json({ order }, { status: 201 });
}
