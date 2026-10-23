import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { combineIncomingQuantities, getIncomingPurchaseQuantities, getMarketplaceIncomingQuantities } from "@/lib/operating-intelligence";

/**
 * Smart order creation is transactional: compute inbound stock and make the new
 * purchase orders on the same serializable DB snapshot, to prevent repeated clicks
 * from silently generating duplicate open orders.
 */
export async function POST() {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const businessId = auth.context.business.id;

  try {
    const orders = await db.$transaction(async (tx) => {
      const [products, openOrders, pendingMarketplaceOrders] = await Promise.all([
        tx.product.findMany({
          where: { businessId, active: true },
          include: {
            supplierItems: {
              where: { supplier: { businessId } },
              orderBy: { price: "asc" },
              include: { supplier: true },
            },
          },
        }),
        tx.purchaseOrder.findMany({
          where: { businessId, status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } },
          select: {
            status: true,
            items: { select: { productId: true, orderedQty: true, receivedQty: true } },
          },
        }),
        tx.marketplaceOrder.findMany({
          where: { buyerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } },
          select: { status: true, items: { select: {
            quantity: true, listing: { select: { barcode: true, unit: true } },
          } } },
        }),
      ]);
      const purchaseIncoming = getIncomingPurchaseQuantities(openOrders.map((order) => ({
        status: order.status,
        items: order.items.map((item) => ({
          productId: item.productId, orderedQty: Number(item.orderedQty), receivedQty: Number(item.receivedQty),
        })),
      })));
      const marketplaceIncoming = getMarketplaceIncomingQuantities(products.map((product) => ({
        id: product.id, barcode: product.barcode, unit: product.unit,
      })), pendingMarketplaceOrders.map((order) => ({
        status: order.status,
        items: order.items.map((item) => ({
          barcode: item.listing.barcode, unit: item.listing.unit, quantity: Number(item.quantity),
        })),
      })));
      const incoming = combineIncomingQuantities(purchaseIncoming, marketplaceIncoming);

      const groups = new Map<string, {
        supplierId: string; supplierName: string;
        items: Array<{ productId: string; orderedQty: number; unitCost: number }>;
      }>();

      for (const product of products) {
        const onHand = Number(product.quantity);
        const reorder = Number(product.reorderPoint);
        const alreadyIncoming = incoming.get(product.id) ?? 0;
        if (onHand > reorder || !product.supplierItems.length) continue;
        const target = Math.max(reorder * 2, reorder + 1);
        const need = Math.max(0, Math.ceil(target - onHand - alreadyIncoming));
        if (need <= 0) continue;

        const offer = product.supplierItems[0];
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

      const created = [];
      for (const group of groups.values()) {
        const expectedTotal = group.items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
        const order = await tx.purchaseOrder.create({
          data: {
            businessId,
            supplierId: group.supplierId,
            orderNumber: "AUTO-" + Date.now() + "-" + group.supplierId.slice(-4),
            status: "SENT",
            expectedTotal,
            orderedAt: new Date(),
            notes: "طلب ذكي بعد خصم كميات الموردين وطلبات السوق ذات التطابق الموثوق؛ التوصيل بين التاجر والمورد.",
            items: { create: group.items },
          },
          include: { supplier: true, items: true },
        });
        created.push(order);
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({
      orders,
      ...(orders.length === 0 ? { message: "NO_PURCHASE_NEEDED_OR_COVERED_BY_PENDING" } : {}),
    }, { status: orders.length ? 201 : 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({
        error: "CONCURRENT_PURCHASE_CHANGE",
        message: "تغيرت الطلبات أثناء إنشاء الخطة؛ حدّث الصفحة وأعد المحاولة.",
      }, { status: 409 });
    }
    console.error("Smart purchase failed", error);
    return NextResponse.json({ error: "SMART_PURCHASE_FAILED" }, { status: 500 });
  }
}
