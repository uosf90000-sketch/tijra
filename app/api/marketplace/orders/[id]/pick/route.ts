import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({ barcode: z.string().trim().min(1).max(120) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  const order = await db.marketplaceOrder.findFirst({
    where: { id, sellerBusinessId: auth.context.business.id, status: { in: ["PLACED", "ACCEPTED"] } },
    include: { items: { include: { listing: true } }, buyer: true },
  });
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  const item = order.items.find((row) => row.listing.barcode === parsed.data.barcode);
  if (!item) return NextResponse.json({ error: "BARCODE_NOT_IN_ORDER" }, { status: 409 });

  const progress = await db.inventoryAuditEvent.findFirst({
    where: { businessId: auth.context.business.id, action: "PICK_PROGRESS", orderId: order.id, listingId: item.listingId },
  });
  const scannedBefore = Number(progress?.quantity ?? 0);
  const required = Number(item.quantity);
  if (scannedBefore >= required) return NextResponse.json({ error: "ITEM_ALREADY_COMPLETE", required, scanned: scannedBefore }, { status: 409 });

  const scanned = scannedBefore + 1;
  if (progress) {
    await db.inventoryAuditEvent.update({
      where: { id: progress.id },
      data: {
        quantity: scanned,
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        occurredAt: new Date(),
      },
    });
  } else {
    await db.inventoryAuditEvent.create({
      data: {
        businessId: auth.context.business.id,
        action: "PICK_PROGRESS",
        orderId: order.id,
        listingId: item.listingId,
        itemName: item.listing.name,
        quantity: scanned,
        previousQuantity: required,
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: `تجهيز طلب ${order.id.slice(-8).toUpperCase()}`,
      },
    });
  }

  const progressRows = await db.inventoryAuditEvent.findMany({
    where: { businessId: auth.context.business.id, action: "PICK_PROGRESS", orderId: order.id },
  });
  const scanMap = new Map(progressRows.map((row) => [row.listingId, Number(row.quantity ?? 0)]));
  scanMap.set(item.listingId, scanned);
  const completed = order.items.every((row) => (scanMap.get(row.listingId) ?? 0) >= Number(row.quantity));

  if (completed) {
    const existingComplete = await db.inventoryAuditEvent.findFirst({ where: { businessId: auth.context.business.id, action: "PICK_COMPLETE", orderId: order.id } });
    if (!existingComplete) {
      await db.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "PICK_COMPLETE",
          orderId: order.id,
          itemName: `طلب ${order.id.slice(-8).toUpperCase()}`,
          quantity: order.items.reduce((sum, row) => sum + Number(row.quantity), 0),
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: `اكتمل تجهيز طلب ${order.buyer.name} بالمسح`,
        },
      });
    }
  }

  return NextResponse.json({
    item: { id: item.id, name: item.listing.name, required, scanned, complete: scanned >= required },
    orderComplete: completed,
  });
}
