import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  productId: z.string().trim().optional(),
  barcode: z.string().trim().max(80).optional(),
  countedQuantity: z.coerce.number().nonnegative().max(100000000),
}).refine((data) => Boolean(data.productId || data.barcode), { message: "PRODUCT_OR_BARCODE_REQUIRED" });

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const { productId, barcode, countedQuantity } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const product = productId
        ? await tx.product.findFirst({ where: { id: productId, businessId: context.business.id, active: true } })
        : await tx.product.findFirst({ where: { businessId: context.business.id, barcode: barcode || "__NO_BARCODE__", active: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const previousQuantity = Number(product.quantity);
      const delta = countedQuantity - previousQuantity;
      const updated = await tx.product.update({ where: { id: product.id }, data: { quantity: countedQuantity } });

      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            businessId: context.business.id,
            productId: product.id,
            type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantity: delta,
            unitCost: product.averageCost,
            sourceType: "STOCK_COUNT",
            sourceId: product.id,
            note: `تسوية جرد بواسطة ${context.user.name}`,
          },
        });
      }

      const event = await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: "STORE_COUNT",
          itemName: product.name,
          quantity: Math.abs(delta),
          previousQuantity,
          newQuantity: countedQuantity,
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          note: delta === 0 ? "الجرد مطابق للمخزون" : `فرق جرد ${delta > 0 ? "+" : ""}${delta}`,
        },
      });

      return { updated, event, delta };
    });

    return NextResponse.json({ product: result.updated, event: result.event, delta: result.delta });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COUNT_FAILED";
    return NextResponse.json({ error: code }, { status: code === "PRODUCT_NOT_FOUND" ? 404 : 500 });
  }
}
