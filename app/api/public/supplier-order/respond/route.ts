import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifySupplierOrderToken } from "@/lib/supplier-link";

const schema = z.object({
  token: z.string().min(20),
  action: z.enum(["CONFIRM", "DECLINE"]),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const payload = verifySupplierOrderToken(parsed.data.token);
  if (!payload) return NextResponse.json({ error: "INVALID_OR_EXPIRED_LINK" }, { status: 401 });

  const order = await db.purchaseOrder.findUnique({ where: { id: payload.orderId } });
  if (!order) return NextResponse.json({ error: "PURCHASE_ORDER_NOT_FOUND" }, { status: 404 });
  if (["RECEIVED", "CANCELLED"].includes(order.status)) {
    return NextResponse.json({ error: "ORDER_ALREADY_CLOSED" }, { status: 409 });
  }

  const updated = await db.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: parsed.data.action === "CONFIRM" ? "CONFIRMED" : "CANCELLED",
      notes: [order.notes, parsed.data.action === "CONFIRM" ? "أكد المورد الطلب من الرابط المشترك." : "اعتذر المورد عن تنفيذ الطلب من الرابط المشترك."].filter(Boolean).join("\n"),
    },
  });

  return NextResponse.json({ order: { id: updated.id, status: updated.status } });
}
