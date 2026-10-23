import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { adjustLocationStock, ensureDefaultLocation, listInventoryLocations, syncListingForProduct } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { locationAuthorized } from "@/lib/location-access";

const schema = z.object({
  productId: z.string().trim().optional(),
  barcode: z.string().trim().max(80).optional(),
  countedQuantity: z.coerce.number().nonnegative().max(100000000),
  locationId: z.string().optional(),
  clientOperationId: z.string().trim().min(1).max(120).optional(),
  expectedPreviousQuantity: z.coerce.number().nonnegative().max(100000000).optional(),
  recordedAt: z.coerce.date().optional(),
}).refine((data) => Boolean(data.productId || data.barcode), { message: "PRODUCT_OR_BARCODE_REQUIRED" });

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const { productId, barcode, countedQuantity, clientOperationId, expectedPreviousQuantity, recordedAt } = parsed.data;
  const defaultLocation = await ensureDefaultLocation(context.business.id);
  const locationId = parsed.data.locationId || defaultLocation.id;
  const locations = await listInventoryLocations(context.business.id);
  const location = locations.find((item) => item.id === locationId && item.active);
  if (!location) return NextResponse.json({ error: "LOCATION_NOT_FOUND" }, { status: 404 });
  if (!(await locationAuthorized(context, locationId))) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });

  if (clientOperationId) {
    const duplicate = await db.inventoryAuditEvent.findFirst({
      where: { businessId: context.business.id, action: "OFFLINE_COUNT_SYNC", itemName: clientOperationId },
    });
    if (duplicate) return NextResponse.json({ duplicate: true, delta: Number(duplicate.quantity ?? 0), location });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const product = productId
        ? await tx.product.findFirst({ where: { id: productId, businessId: context.business.id, active: true } })
        : await tx.product.findFirst({ where: { businessId: context.business.id, barcode: barcode || "__NO_BARCODE__", active: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const stockRow = await tx.inventoryAuditEvent.findFirst({
        where: { businessId: context.business.id, action: "LOCATION_STOCK", listingId: locationId, orderId: product.id },
      });
      const currentLocationQuantity = Number(stockRow?.quantity ?? (location.isDefault ? product.quantity : 0));
      if (expectedPreviousQuantity != null && Math.abs(expectedPreviousQuantity - currentLocationQuantity) > 0.001) {
        throw new Error("STALE_STOCK_BASELINE");
      }
      const baselineQuantity = currentLocationQuantity;
      const delta = countedQuantity - baselineQuantity;
      if (Number(product.quantity) + delta < -0.001) {
        throw new Error("INSUFFICIENT_GLOBAL_STOCK");
      }

      if (delta !== 0) {
        await adjustLocationStock(tx, {
          businessId: context.business.id,
          locationId,
          productId: product.id,
          productName: product.name,
          delta,
        });
        const newTotal = Number(product.quantity) + delta;
        await tx.product.update({ where: { id: product.id }, data: { quantity: newTotal } });
        await syncListingForProduct(tx, { businessId: context.business.id, productId: product.id, delta });
        await tx.stockMovement.create({
          data: {
            businessId: context.business.id,
            productId: product.id,
            type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantity: delta,
            unitCost: product.averageCost,
            sourceType: "STOCK_COUNT",
            sourceId: product.id,
            note: expectedPreviousQuantity == null
              ? `تسوية جرد ${location.name} بواسطة ${context.user.name}`
              : `تسوية جرد محفوظ دون اتصال في ${location.name} بواسطة ${context.user.name}`,
          },
        });
      }

      const updated = await tx.product.findUnique({ where: { id: product.id } });
      const event = await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: "STORE_COUNT",
          listingId: product.id,
          orderId: locationId,
          itemName: product.name,
          quantity: Math.abs(delta),
          previousQuantity: baselineQuantity,
          newQuantity: countedQuantity,
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          occurredAt: new Date(),
          note: JSON.stringify({ location: location.name, delta,
            offlineRecordedAt: recordedAt?.toISOString() || null,
            syncedOffline: expectedPreviousQuantity != null }),
        },
      });

      if (clientOperationId) {
        await tx.inventoryAuditEvent.create({
          data: {
            businessId: context.business.id,
            action: "OFFLINE_COUNT_SYNC",
            listingId: product.id,
            orderId: locationId,
            itemName: clientOperationId,
            quantity: delta,
            actorUserId: context.user.id,
            actorName: context.user.name,
            actorRole: context.membership.role,
            note: recordedAt ? `وقت الجرد على الجهاز: ${recordedAt.toISOString()}` : "عملية جرد قابلة لإعادة المحاولة بدون تكرار",
          },
        });
      }

      return { updated, event, delta, location };
    });

    return NextResponse.json({ product: result.updated, event: result.event, delta: result.delta, location: result.location });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COUNT_FAILED";
    return NextResponse.json({ error: code }, { status: code === "PRODUCT_NOT_FOUND" ? 404 :
      ["STALE_STOCK_BASELINE", "INSUFFICIENT_GLOBAL_STOCK"].includes(code) || code.startsWith("INSUFFICIENT_LOCATION_STOCK") ? 409 : 500 });
  }
}
