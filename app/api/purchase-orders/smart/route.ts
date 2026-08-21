import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function POST() {
  const auth = await requireApiRoles(["OWNER", "MANAGER"]);
  if (auth.response) return auth.response;
  const businessId = auth.context.business.id;

  const products = await db.product.findMany({
    where: { businessId, active: true },
    include: {
      supplierItems: {
        where: { supplier: { businessId } },
        orderBy: { price: "asc" },
        include: { supplier: true },
      },
    },
  });

  const groups = new Map<string, { supplierId: string; supplierName: string; items: Array<{ productId: string; orderedQty: number; unitCost: number }> }>();

  for (const product of products) {
    const onHand = Number(product.quantity);
    const reorder = Number(product.reorderPoint);
    if (onHand > reorder || !product.supplierItems.length) continue;
    const offer = product.supplierItems[0];
    const target = Math.max(reorder * 2, reorder + 1);
    const need = Math.max(0, Math.ceil(target - onHand));
    const min = offer.minOrderQty == null ? 0 : Number(offer.minOrderQty);
    const qty = Math.max(need, min);
    if (qty <= 0) continue;

    const group = groups.get(offer.supplierId) ?? {
      supplierId: offer.supplierId,
      supplierName: offer.supplier.name,
      items: [],
    };
    group.items.push({ productId: product.id, orderedQty: qty, unitCost: Number(offer.price) });
    groups.set(offer.supplierId, group);
  }

  if (!groups.size) return NextResponse.json({ orders: [], message: "NO_PURCHASE_NEEDED" });

  const orders = await db.$transaction(
    Array.from(groups.values()).map((group) => {
      const expectedTotal = group.items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
      return db.purchaseOrder.create({
        data: {
          businessId,
          supplierId: group.supplierId,
          orderNumber: `AUTO-${Date.now()}-${group.supplierId.slice(-4)}`,
          status: "SENT",
          expectedTotal,
          orderedAt: new Date(),
          notes: "طلبية أنشأها تِجرا بناءً على نقطة إعادة الطلب وأفضل سعر مسجل.",
          items: { create: group.items },
        },
        include: { supplier: true, items: true },
      });
    }),
  );

  return NextResponse.json({ orders }, { status: 201 });
}
