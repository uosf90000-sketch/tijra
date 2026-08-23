import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100000000),
  reason: z.string().trim().min(2).max(240),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: data.productId, businessId: auth.context.business.id, active: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      const previous = Number(product.quantity);
      if (previous < data.quantity) throw new Error("INSUFFICIENT_STOCK");
      const next = previous - data.quantity;

      await tx.product.update({ where: { id: product.id }, data: { quantity: { decrement: data.quantity } } });
      await tx.stockMovement.create({
        data: {
          businessId: auth.context.business.id,
          productId: product.id,
          type: "ADJUSTMENT_OUT",
          quantity: -data.quantity,
          unitCost: product.averageCost,
          sourceType: "WASTE",
          sourceId: product.id,
          note: data.reason,
        },
      });
      const event = await tx.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "WASTE",
          listingId: product.id,
          itemName: product.name,
          quantity: data.quantity,
          previousQuantity: previous,
          newQuantity: next,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: data.reason,
        },
      });
      return { product, event, next };
    });
    return NextResponse.json({ ok: true, remaining: result.next, event: result.event });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WASTE_FAILED";
    const status = code === "PRODUCT_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
