import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), actualQuantity: z.coerce.number().nonnegative().max(100000000) })).min(1).max(1000),
  note: z.string().trim().max(240).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const closeId = randomUUID();
  try {
    const result = await db.$transaction(async (tx) => {
      const ids = parsed.data.items.map((item) => item.productId);
      const products = await tx.product.findMany({ where: { businessId: auth.context.business.id, id: { in: ids }, active: true } });
      const map = new Map(products.map((item) => [item.id, item]));
      if (map.size !== new Set(ids).size) throw new Error("PRODUCT_NOT_FOUND");

      let totalVariance = 0;
      let varianceLines = 0;
      for (const item of parsed.data.items) {
        const product = map.get(item.productId)!;
        const theoretical = Number(product.quantity);
        const actual = item.actualQuantity;
        const delta = actual - theoretical;
        totalVariance += Math.abs(delta);
        if (Math.abs(delta) > 0.000001) varianceLines += 1;

        if (Math.abs(delta) > 0.000001) {
          await tx.product.update({ where: { id: product.id }, data: { quantity: actual } });
          await tx.stockMovement.create({
            data: {
              businessId: auth.context.business.id,
              productId: product.id,
              type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
              quantity: delta,
              unitCost: product.averageCost,
              sourceType: "DAY_CLOSE",
              sourceId: closeId,
              note: `تسوية إقفال اليوم · المتوقع ${theoretical} · الفعلي ${actual}`,
            },
          });
        }

        await tx.inventoryAuditEvent.create({
          data: {
            businessId: auth.context.business.id,
            action: "DAY_CLOSE_LINE",
            listingId: product.id,
            orderId: closeId,
            itemName: product.name,
            quantity: Math.abs(delta),
            previousQuantity: theoretical,
            newQuantity: actual,
            actorUserId: auth.context.user.id,
            actorName: auth.context.user.name,
            actorRole: auth.context.membership.role,
            note: delta === 0 ? "مطابق" : delta > 0 ? `زيادة فعلية ${delta}` : `نقص فعلي ${Math.abs(delta)}`,
          },
        });
      }

      await tx.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "DAY_CLOSE",
          orderId: closeId,
          itemName: "إقفال نهاية اليوم",
          quantity: totalVariance,
          previousQuantity: parsed.data.items.length,
          newQuantity: varianceLines,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: parsed.data.note || `${varianceLines} صنف بفروقات من أصل ${parsed.data.items.length}`,
        },
      });

      return { totalVariance, varianceLines, count: parsed.data.items.length };
    });

    return NextResponse.json({ closeId, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DAY_CLOSE_FAILED";
    return NextResponse.json({ error: code }, { status: code === "PRODUCT_NOT_FOUND" ? 404 : 500 });
  }
}
