import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { adjustLocationStock, ensureDefaultLocation, syncListingForProduct } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const schema = z.object({
  barcode: z.string().trim().min(1).max(80),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().positive().max(100000000),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const { barcode, direction, quantity } = parsed.data;
  const businessId = auth.context.business.id;
  const location = await ensureDefaultLocation(businessId);

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { businessId, barcode, active: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const before = Number(product.quantity);
      const delta = direction === "IN" ? quantity : -quantity;

      if (direction === "OUT") {
        const updated = await tx.product.updateMany({
          where: { id: product.id, businessId, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
      } else {
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: { increment: quantity } },
        });
      }

      await adjustLocationStock(tx, {
        businessId,
        locationId: location.id,
        productId: product.id,
        productName: product.name,
        delta,
      });

      await syncListingForProduct(tx, {
        businessId,
        productId: product.id,
        delta,
      });

      await tx.stockMovement.create({
        data: {
          businessId,
          productId: product.id,
          type: direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: delta,
          unitCost: product.averageCost,
          sourceType: "StaffQuickStock",
          sourceId: auth.context.user.id,
          note: `${direction === "IN" ? "إدخال" : "إخراج"} سريع بالباركود بواسطة ${auth.context.user.name}`,
        },
      });

      const after = before + delta;
      await tx.inventoryAuditEvent.create({
        data: {
          businessId,
          action: direction === "IN" ? "QUICK_STOCK_IN" : "QUICK_STOCK_OUT",
          listingId: product.id,
          itemName: product.name,
          quantity,
          previousQuantity: before,
          newQuantity: after,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: `${direction === "IN" ? "إدخال" : "إخراج"} ${quantity} ${product.unit}`,
        },
      });

      return { product: { id: product.id, name: product.name, unit: product.unit }, before, after };
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "QUICK_ADJUST_FAILED";
    const status = code === "PRODUCT_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
