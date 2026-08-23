import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { actorFromContext, ensureDefaultLocation } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { receivePurchaseOrder } from "@/lib/stock-operations";

const schema = z.object({
  purchaseOrderId: z.string().min(1),
  productId: z.string().optional(),
  barcode: z.string().trim().max(120).optional(),
  receivedQty: z.coerce.number().positive().max(100000000),
  unitCost: z.coerce.number().nonnegative().max(1000000).optional(),
  locationId: z.string().optional(),
  invoiceNumber: z.string().trim().max(100).optional(),
  lotNumber: z.string().trim().max(120).optional(),
  expiryDate: z.string().trim().optional(),
  serials: z.array(z.string().trim().min(1).max(120)).max(500).optional(),
}).refine((data) => Boolean(data.productId || data.barcode), { message: "PRODUCT_OR_BARCODE_REQUIRED" });

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const businessId = auth.context.business.id;
  const defaultLocation = await ensureDefaultLocation(businessId);
  const order = await db.purchaseOrder.findFirst({
    where: { id: parsed.data.purchaseOrderId, businessId },
    include: { items: { include: { product: true } } },
  });
  if (!order) return NextResponse.json({ error: "PURCHASE_ORDER_NOT_FOUND" }, { status: 404 });

  const line = parsed.data.productId
    ? order.items.find((item) => item.productId === parsed.data.productId)
    : order.items.find((item) => item.product.barcode && item.product.barcode === parsed.data.barcode);
  if (!line) return NextResponse.json({ error: "PRODUCT_NOT_IN_PURCHASE_ORDER" }, { status: 404 });

  const remainingBefore = Number(line.orderedQty) - Number(line.receivedQty);
  if (parsed.data.receivedQty > remainingBefore) {
    return NextResponse.json({ error: "RECEIVED_QTY_EXCEEDS_ORDER", remaining: remainingBefore }, { status: 409 });
  }

  const serials = parsed.data.serials ?? [];
  if (serials.length) {
    const expected = Math.round(parsed.data.receivedQty);
    if (Math.abs(parsed.data.receivedQty - expected) > 0.000001 || serials.length !== expected) {
      return NextResponse.json({ error: "SERIAL_COUNT_MISMATCH", expected }, { status: 409 });
    }
    if (new Set(serials).size !== serials.length) return NextResponse.json({ error: "DUPLICATE_SERIALS" }, { status: 409 });
    const existing = await db.inventoryAuditEvent.findFirst({ where: { businessId, action: "PRODUCT_SERIAL", itemName: { in: serials } } });
    if (existing) return NextResponse.json({ error: "SERIAL_ALREADY_EXISTS", serial: existing.itemName }, { status: 409 });
  }

  const actor = actorFromContext(auth.context);
  const unitCost = parsed.data.unitCost ?? Number(line.unitCost);
  const expiry = parsed.data.expiryDate ? new Date(`${parsed.data.expiryDate}T12:00:00`) : undefined;
  if (expiry && Number.isNaN(expiry.getTime())) return NextResponse.json({ error: "INVALID_EXPIRY_DATE" }, { status: 400 });
  const locationId = parsed.data.locationId || defaultLocation.id;

  try {
    const result = await receivePurchaseOrder({
      businessId,
      purchaseOrderId: order.id,
      invoiceNumber: parsed.data.invoiceNumber,
      issuedAt: new Date(),
      locationId,
      actorUserId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
      items: [{
        productId: line.productId,
        receivedQty: parsed.data.receivedQty,
        unitCost,
        lotNumber: parsed.data.lotNumber,
        expiresAt: expiry,
      }],
    });

    if (serials.length) {
      await db.inventoryAuditEvent.createMany({
        data: serials.map((serial) => ({
          businessId,
          action: "PRODUCT_SERIAL",
          listingId: line.productId,
          itemName: serial,
          quantity: 1,
          actorUserId: actor.userId,
          actorName: actor.name,
          actorRole: actor.role,
          note: JSON.stringify({ status: "IN_STOCK", locationId }),
        })),
      });
    }

    const refreshed = await db.purchaseOrderItem.findUnique({ where: { id: line.id } });
    const receivedAfter = Number(refreshed?.receivedQty ?? 0);
    return NextResponse.json({
      receipt: result,
      item: {
        productId: line.productId,
        productName: line.product.name,
        ordered: Number(line.orderedQty),
        received: receivedAfter,
        remaining: Math.max(0, Number(line.orderedQty) - receivedAfter),
      },
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECEIVING_FAILED";
    const status = code.startsWith("RECEIVED_QTY_EXCEEDS_ORDER") || code.includes("ALREADY_RECEIVED") ? 409 : code.includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
