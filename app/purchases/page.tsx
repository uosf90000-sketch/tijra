import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, Check, CirclePlus, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SmartOrderButton } from "@/components/smart-order-button";
import { StatusPill } from "@/components/status-pill";
import { SupplierShareButton } from "@/components/supplier-share-button";
import { CancelSupplierOrderButton } from "@/components/cancel-supplier-order-button";
import { getSessionContext } from "@/lib/auth";
import { hasAppPermission } from "@/lib/access";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { combineIncomingQuantities, getIncomingPurchaseQuantities, getMarketplaceIncomingQuantities } from "@/lib/operating-intelligence";

export const metadata = { title: "المشتريات" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_APPROVAL: "بانتظار موافقة الإدارة",
  SENT: "مرسل",
  CONFIRMED: "مؤكد",
  PARTIALLY_RECEIVED: "استلام جزئي",
  RECEIVED: "مستلم",
  CANCELLED: "ملغي",
};

export default async function PurchasesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!hasAppPermission(context.membership, "PURCHASES")) redirect("/no-access");
  const businessId = context.business.id;

  const [products, purchaseOrders, pendingOrderLines, pendingMarketplaceOrders] = await Promise.all([
    db.product.findMany({
      where: { businessId, active: true },
      include: { supplierItems: { include: { supplier: true }, orderBy: { price: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: { businessId },
      include: { supplier: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.purchaseOrder.findMany({
      where: { businessId, status: { in: ["PENDING_APPROVAL", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } },
      select: { status: true, items: { select: { productId: true, orderedQty: true, receivedQty: true } } },
    }),
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } },
      select: { status: true, items: { select: {
        quantity: true, listing: { select: { barcode: true, unit: true } },
      } } },
    }),
  ]);
  const purchaseIncoming = getIncomingPurchaseQuantities(pendingOrderLines.map((order) => ({
    status: order.status,
    items: order.items.map((item) => ({
      productId: item.productId,
      orderedQty: Number(item.orderedQty),
      receivedQty: Number(item.receivedQty),
    })),
  })));
  const marketIncoming = getMarketplaceIncomingQuantities(products.map((product) => ({
    id: product.id, barcode: product.barcode, unit: product.unit,
  })), pendingMarketplaceOrders.map((order) => ({
    status: order.status,
    items: order.items.map((item) => ({
      barcode: item.listing.barcode, unit: item.listing.unit, quantity: Number(item.quantity),
    })),
  })));
  const incoming = combineIncomingQuantities(purchaseIncoming, marketIncoming);

  const suggestions = products.flatMap((product) => {
    const current = Number(product.quantity);
    const reorder = Number(product.reorderPoint);
    const offer = product.supplierItems[0];
    const alreadyIncoming = incoming.get(product.id) ?? 0;
    if (current > reorder || !offer) return [];
    const target = Math.max(reorder * 2, reorder + 1);
    const rawQty = Math.max(0, Math.ceil(target - current - alreadyIncoming));
    if (rawQty <= 0) return [];
    const minOrderQty = offer.minOrderQty == null ? 0 : Number(offer.minOrderQty);
    const suggested = Math.max(rawQty, minOrderQty);
    if (suggested <= 0) return [];
    return [{ productId: product.id, product: product.name, current, reorder, alreadyIncoming, suggested, unit: product.unit, supplier: offer.supplier.name, unitPrice: Number(offer.price) }];
  });

  const suggestionTotal = suggestions.reduce((sum, item) => sum + item.suggested * item.unitPrice, 0);
  const activeOrders = purchaseOrders.filter((item) => !["RECEIVED", "CANCELLED"].includes(item.status)).length;
  const supplierCount = new Set(suggestions.map((item) => item.supplier)).size;

  return (
    <>
      <PageHeader
        eyebrow="المشتريات الذكية"
        title="المشتريات"
        description="تِجرا يقترح الكمية، يقسم الطلب حسب المورد، ثم تعطي المورد رابطًا يؤكد منه بدون حساب."
        actions={<><Link className="button secondary" href="/purchases/approvals">الموافقات</Link><Link className="button secondary" href="/purchases/insights"><Sparkles size={17} /> مراقب المشتريات</Link><Link className="button secondary" href="/purchases/invoice"><Camera size={17} /> مطابقة فاتورة</Link><Link className="button primary" href="/suppliers/prices/new"><CirclePlus size={17} /> إضافة سعر مورد</Link></>}
      />

      <div className="infoNote">الكميات قيد التوريد من الموردين وطلبات السوق المتطابقة بباركود ووحدة فريدين خُصمت من الاحتياج. لا تُضاف هذه الكميات للمخزون الفعلي إلا عند اعتماد الاستلام.</div>
      <section className="metricsGrid three">
        <MetricCard label="الطلبية المقترحة" value={formatSar(suggestionTotal)} note={`${suggestions.length} أصناف`} icon={Sparkles} />
        <MetricCard label="موردون في الخطة" value={`${supplierCount}`} note="حسب أفضل سعر مسجل" icon={Check} tone="blue" />
        <MetricCard label="طلبات قيد التنفيذ" value={`${activeOrders}`} note="بدون إدارة التوصيل" icon={CirclePlus} tone="amber" />
      </section>

      <section className="panel smartOrderPanel">
        <div className="panelHeader"><div><span className="eyebrow"><Sparkles size={14} /> خطة اليوم</span><h2>ماذا نطلب الآن؟</h2></div><span className="aiBadge">Smart replenishment</span></div>
        <div className="smartOrderList">
          {suggestions.map((item) => (
            <div className="smartOrderRow" key={item.productId}>
              <div className="grow"><strong>{item.product}</strong><span>الموجود {item.current} · قيد التوريد {item.alreadyIncoming} · نقطة الطلب {item.reorder} · {item.supplier}</span></div>
              <div className="qtyBadge">{item.suggested} {item.unit}</div>
              <div className="priceStack"><strong>{formatSar(item.suggested * item.unitPrice)}</strong><span>{formatSar(item.unitPrice)} للوحدة</span></div>
            </div>
          ))}
          {!suggestions.length && <div className="infoNote">لا توجد أصناف منخفضة لها سعر مورد مسجل.</div>}
        </div>
        <div className="orderSummaryBar"><div><span>الإجمالي التقديري</span><strong>{formatSar(suggestionTotal)}</strong></div><SmartOrderButton /></div>
        <p className="policyNote">تِجرا ينظم الطلب والتأكيد فقط. التوصيل وموعده يبقيان مباشرة بين التاجر والمورد.</p>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>طلبات الشراء</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>رقم الطلب</th><th>المورد</th><th>الأصناف</th><th>القيمة</th><th>الحالة</th><th>التاريخ</th><th>إرسال للمورد</th><th>إدارة الطلب</th></tr></thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.orderNumber || order.id.slice(-8).toUpperCase()}</strong></td>
                  <td>{order.supplier.name}</td>
                  <td>{order.items.length}</td>
                  <td>{formatSar(Number(order.expectedTotal))}</td>
                  <td><StatusPill status={order.status.toLowerCase()} /> <span className="mutedText">{statusLabels[order.status]}</span></td>
                  <td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(order.createdAt)}</td>
                  <td>{["RECEIVED", "CANCELLED", "PENDING_APPROVAL", "DRAFT"].includes(order.status) ? <span className="mutedText">{order.status === "PENDING_APPROVAL" ? "بانتظار الاعتماد" : "غير قابل للإرسال"}</span> : <SupplierShareButton orderId={order.id} />}</td>
                  <td>{context.membership.role === "OWNER" && !["RECEIVED", "CANCELLED"].includes(order.status) && order.items.every((item) => Number(item.receivedQty) <= 0)
                    ? <CancelSupplierOrderButton orderId={order.id} />
                    : <span className="mutedText">—</span>}</td>
                </tr>
              ))}
              {!purchaseOrders.length && <tr><td colSpan={8}><div className="infoNote">لا توجد طلبات شراء بعد.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
