import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PurchaseReceiptForm } from "@/components/purchase-receipt-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "مطابقة واستلام فاتورة المورد" };
export const dynamic = "force-dynamic";

export default async function PurchaseInvoicePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const orders = await db.purchaseOrder.findMany({
    where: {
      businessId: context.business.id,
      status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] },
    },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });

  const previousInvoices = await db.purchaseInvoice.findMany({
    where: { businessId: context.business.id, status: "APPROVED", supplierId: { in: orders.map((order) => order.supplierId) } },
    include: { items: true },
    orderBy: { approvedAt: "desc" },
    take: 500,
  });
  const previousUnitCost = new Map<string, number>();
  for (const invoice of previousInvoices) {
    for (const item of invoice.items) {
      const key = invoice.supplierId + ":" + item.productId;
      if (!previousUnitCost.has(key)) previousUnitCost.set(key, Number(item.unitCost));
    }
  }

  const receiptOrders = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber || order.id.slice(-8).toUpperCase(),
    supplierName: order.supplier.name,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      unit: item.product.unit,
      orderedQty: Number(item.orderedQty),
      receivedQty: Number(item.receivedQty),
      unitCost: Number(item.unitCost),
      previousUnitCost: previousUnitCost.get(order.supplierId + ":" + item.productId) ?? null,
    })),
  }));

  return (
    <>
      <PageHeader
        eyebrow="الاستلام"
        title="فاتورة المورد والاستلام"
        description="اقرأ الفاتورة بالصورة للمساعدة، ثم اعتمد ما استلمته فعلًا ليُحدّث المخزون ومتوسط التكلفة."
        actions={<Link className="button secondary" href="/purchases"><ArrowRight size={17} /> رجوع للمشتريات</Link>}
      />

      <PurchaseReceiptForm orders={receiptOrders} />
    </>
  );
}
