import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { createSupplierOrderToken } from "@/lib/supplier-link";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoles(["OWNER", "MANAGER"]);
  if (auth.response) return auth.response;
  const { id } = await params;

  const order = await db.purchaseOrder.findFirst({
    where: { id, businessId: auth.context.business.id },
    select: { id: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "PURCHASE_ORDER_NOT_FOUND" }, { status: 404 });
  if (["RECEIVED", "CANCELLED"].includes(order.status)) {
    return NextResponse.json({ error: "ORDER_NOT_SHAREABLE" }, { status: 409 });
  }

  try {
    const token = createSupplierOrderToken(order.id);
    const url = new URL(`/supplier/order/${token}`, request.url).toString();
    return NextResponse.json({ url, expiresInHours: 72 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LINK_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
