import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { adjustLocationStock, ensureDefaultLocation, syncListingForProduct } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { locationAuthorized } from "@/lib/location-access";
import { stockAdjustmentViolation } from "@/lib/governance-checks";

const schema = z.object({
  barcode: z.string().trim().min(1).max(80),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().positive().max(100000000),
  reason: z.string().trim().max(500).optional(),
  locationId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const { barcode, direction, quantity, reason } = parsed.data;
  const businessId = auth.context.business.id;
  const defaultLocation = await ensureDefaultLocation(businessId);
  const locationId = parsed.data.locationId || defaultLocation.id;
  if (!(await locationAuthorized(auth.context, locationId))) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { businessId, barcode, active: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const businessPolicy = await tx.business.findUniqueOrThrow({
        where: { id: businessId }, select: { stockReasonRequired: true, stockValueReviewThreshold: true },
      });
      const value = quantity * Number(product.averageCost);
      const policyError = stockAdjustmentViolation({
        role: auth.context.membership.role,
        quantity, averageCost: Number(product.averageCost), reason,
        reasonRequired: businessPolicy.stockReasonRequired,
        valueThreshold: Number(businessPolicy.stockValueReviewThreshold),
      });
      if (policyError) throw new Error(policyError);
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
        locationId,
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
          note: JSON.stringify({ movement: direction, quantity, unit: product.unit, value,
            reason: reason || null }),
        },
      });

      return { product: { id: product.id, name: product.name, unit: product.unit }, before, after };
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "QUICK_ADJUST_FAILED";
    const status = code === "PRODUCT_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" ? 409 :
      code === "SUPERVISOR_REQUIRED_FOR_LARGE_STOCK_ADJUSTMENT" ? 403 :
      code === "STOCK_REASON_REQUIRED" ? 400 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
