import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  imageUrl: z.string().max(950_000).refine((value) => value.startsWith("data:image/jpeg;base64,"), "INVALID_IMAGE").optional(),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1).max(30).default("حبة"),
  salePrice: z.number().nonnegative(),
  averageCost: z.number().nonnegative().default(0),
  quantity: z.number().nonnegative().default(0),
  reorderPoint: z.number().nonnegative().default(0),
  targetCoverageDays: z.number().int().min(1).max(60).default(7),
});

export async function GET() {
  const auth = await requireApiAnyPermission(["INVENTORY", "PURCHASES"]);
  if (auth.response) return auth.response;

  const products = await db.product.findMany({
    where: { businessId: auth.context.business.id, active: true },
    include: { supplierItems: { include: { supplier: true }, orderBy: { price: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;

  const parsed = productSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  try {
    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          businessId: auth.context.business.id,
          name: data.name,
          sku: data.sku || null,
          barcode: data.barcode || null,
          imageUrl: data.imageUrl || null,
          category: data.category || null,
          unit: data.unit,
          salePrice: data.salePrice,
          averageCost: data.averageCost,
          quantity: data.quantity,
          reorderPoint: data.reorderPoint,
          targetCoverageDays: data.targetCoverageDays,
        },
      });

      if (data.quantity > 0) {
        await tx.stockMovement.create({
          data: {
            businessId: auth.context.business.id,
            productId: created.id,
            type: "OPENING_BALANCE",
            quantity: data.quantity,
            unitCost: data.averageCost,
            sourceType: "PRODUCT_CREATE",
            sourceId: created.id,
            note: "رصيد افتتاحي عند إضافة الصنف",
          },
        });
      }
      return created;
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU_ALREADY_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ error: "PRODUCT_CREATE_FAILED" }, { status: 500 });
  }
}
