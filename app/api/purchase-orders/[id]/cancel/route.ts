import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({ reason: z.string().trim().min(8).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  if (auth.context.membership.role !== "OWNER") {
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REASON" }, { status: 400 });
  const { id } = await params;

  try {
    const updated = await db.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, businessId: auth.context.business.id },
        include: { items: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (["RECEIVED", "CANCELLED"].includes(order.status)) throw new Error("ORDER_CLOSED");
      if (order.items.some((line) => Number(line.receivedQty) > 0)) {
        throw new Error("PARTIALLY_RECEIVED_ORDER");
      }
      const result = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "SUPPLIER_PO_CANCELLED",
          orderId: order.id,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: parsed.data.reason,
        },
      });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ order: updated });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "ORDER_NOT_FOUND") return NextResponse.json({ error: reason }, { status: 404 });
    if (["ORDER_CLOSED", "PARTIALLY_RECEIVED_ORDER"].includes(reason) ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: reason || "CONCURRENT_ORDER_CHANGE" }, { status: 409 });
    }
    console.error("Purchase order cancellation failed", error);
    return NextResponse.json({ error: "ORDER_CANCEL_FAILED" }, { status: 500 });
  }
}
