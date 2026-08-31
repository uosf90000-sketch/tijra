import { revalidatePath } from "next/cache";
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

  try {
    const result = await db.$transaction(async (tx) => {
      // One order is picked sequentially even when multiple scanners submit at
      // exactly the same time. This prevents lost PICK_PROGRESS updates.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tijra-pick-order'), hashtext(${id}))`;

      const order = await tx.marketplaceOrder.findFirst({
        where: { id, sellerBusinessId: auth.context.business.id, status: { in: ["PLACED", "ACCEPTED"] } },
        include: { items: { include: { listing: true } }, buyer: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");

      const item = order.items.find((row) => row.listing.barcode === parsed.data.barcode);
      if (!item) throw new Error("BARCODE_NOT_IN_ORDER");

      if (order.status === "PLACED") {
        await tx.marketplaceOrder.update({
          where: { id: order.id },
          data: { status: "ACCEPTED", acceptedAt: order.acceptedAt ?? new Date() },
        });
      }

      const progressRowsForItem = await tx.inventoryAuditEvent.findMany({
        where: { businessId: auth.context.business.id, action: "PICK_PROGRESS", orderId: order.id, listingId: item.listingId },
        orderBy: { occurredAt: "desc" },
      });
      const progress = progressRowsForItem[0] ?? null;
      const scannedBefore = progressRowsForItem.reduce((max, row) => Math.max(max, Number(row.quantity ?? 0)), 0);
      const required = Number(item.quantity);
      if (scannedBefore >= required) {
        return { kind: "already-complete" as const, required, scanned: scannedBefore };
      }

      const scanned = scannedBefore + 1;
      if (progress) {
        await tx.inventoryAuditEvent.update({
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
        await tx.inventoryAuditEvent.create({
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

      const progressRows = await tx.inventoryAuditEvent.findMany({
        where: { businessId: auth.context.business.id, action: "PICK_PROGRESS", orderId: order.id },
      });
      const scanMap = new Map<string | null, number>();
      for (const row of progressRows) {
        scanMap.set(row.listingId, Math.max(scanMap.get(row.listingId) ?? 0, Number(row.quantity ?? 0)));
      }
      scanMap.set(item.listingId, Math.max(scanMap.get(item.listingId) ?? 0, scanned));
      const completed = order.items.every((row) => (scanMap.get(row.listingId) ?? 0) >= Number(row.quantity));

      if (completed) {
        const existingComplete = await tx.inventoryAuditEvent.findFirst({
          where: { businessId: auth.context.business.id, action: "PICK_COMPLETE", orderId: order.id },
        });
        if (!existingComplete) {
          await tx.inventoryAuditEvent.create({
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

      return {
        kind: "ok" as const,
        item: { id: item.id, name: item.listing.name, required, scanned, complete: scanned >= required },
        orderComplete: completed,
      };
    });

    if (result.kind === "already-complete") {
      return NextResponse.json({ error: "ITEM_ALREADY_COMPLETE", required: result.required, scanned: result.scanned }, { status: 409 });
    }

    revalidatePath("/supplier/picking");
    return NextResponse.json({ item: result.item, orderComplete: result.orderComplete, orderStatus: "ACCEPTED" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PICK_FAILED";
    const status = code === "ORDER_NOT_FOUND" ? 404 : code === "BARCODE_NOT_IN_ORDER" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
