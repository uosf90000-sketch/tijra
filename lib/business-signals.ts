import { db } from "@/lib/db";
import {
  combineIncomingQuantities, getIncomingPurchaseQuantities, getMarketplaceIncomingQuantities,
} from "@/lib/operating-intelligence";
import { identifyOperatingSignals, halalasToDecimal, outstandingHalalas } from "@/lib/tijra-360";

/**
 * Read-only, explainable cross-module signals; datasets are bounded.
 * Rules intentionally create review tasks, NEVER automatic purchases, invoices,
 * messages, bank transactions or customer notifications.
 */
export async function currentBusinessSignals(businessId: string, now = new Date()) {
  const [products, orders, marketplaceOrders, receivables, approvals, rfqs] = await Promise.all([
    db.product.findMany({
      where: { businessId, active: true }, select: {
        id: true, name: true, barcode: true, unit: true,
        quantity: true, reorderPoint: true,
      }, take: 1000, orderBy: { createdAt: "desc" },
    }),
    db.purchaseOrder.findMany({
      where: { businessId, status: { in: ["PENDING_APPROVAL","SENT","CONFIRMED","PARTIALLY_RECEIVED"] } },
      select: { status: true, items: { select: { productId: true, orderedQty: true, receivedQty: true } } },
      take: 1000,
    }),
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: businessId, status: { in: ["PLACED","ACCEPTED"] } },
      select: { status: true, items: { select: {
        quantity: true, listing: { select: { barcode: true, unit: true } },
      } } }, take: 1000,
    }),
    db.receivable.findMany({
      where: { businessId, status: { in: ["OPEN", "PARTIALLY_PAID"] } },
      select: { id: true, invoiceRef: true, dueAt: true, amount: true,
        receipts: { select: { amount: true } } }, take: 1000,
    }),
    db.purchaseOrder.findMany({
      where: { businessId, status: "PENDING_APPROVAL" },
      select: { id: true, orderNumber: true, expectedTotal: true }, take: 1000,
    }),
    db.sourcingRequest.findMany({
      where: { businessId, status: "OPEN", quoteDeadline: { not: null } },
      include: { product: { select: { name: true } } }, take: 1000,
    }),
  ]);
  const incoming = combineIncomingQuantities(
    getIncomingPurchaseQuantities(orders.map((row) => ({
      status: row.status,
      items: row.items.map((item) => ({
        productId: item.productId, orderedQty: Number(item.orderedQty), receivedQty: Number(item.receivedQty),
      })),
    }))),
    getMarketplaceIncomingQuantities(
      products.map((p) => ({ id: p.id, barcode: p.barcode, unit: p.unit })),
      marketplaceOrders.map((order) => ({
        status: order.status,
        items: order.items.map((item) => ({
          barcode: item.listing.barcode, unit: item.listing.unit, quantity: Number(item.quantity),
        })),
      })),
    ),
  );
  return identifyOperatingSignals({
    products: products.map((p) => ({
      id: p.id, name: p.name, quantity: Number(p.quantity), reorderPoint: Number(p.reorderPoint),
      incoming: incoming.get(p.id) || 0,
    })),
    receivables: receivables.map((row) => ({
      id: row.id, invoiceRef: row.invoiceRef, dueAt: row.dueAt,
      remaining: halalasToDecimal(outstandingHalalas(row.amount.toFixed(2),
        row.receipts.map((receipt) => receipt.amount.toFixed(2)))),
    })),
    approvals: approvals.map((row) => ({
      id: row.id, orderNumber: row.orderNumber, amount: row.expectedTotal.toFixed(2),
    })),
    rfqs: rfqs.filter((r): r is typeof r & { quoteDeadline: Date } => r.quoteDeadline !== null)
      .map((r) => ({ id: r.id, productName: r.product.name, deadline: r.quoteDeadline })),
    now,
  });
}
