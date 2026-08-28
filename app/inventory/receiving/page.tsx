import { redirect } from "next/navigation";
import { PackageCheck, ScanBarcode, ShoppingBag, TriangleAlert } from "lucide-react";
import { SmartReceivingForm } from "@/components/commerce-forms";
import { MarketplaceOrderActions } from "@/components/marketplace-order-actions";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ensureDefaultLocation, listInventoryLocations } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الاستلام الذكي" };
export const dynamic = "force-dynamic";

export default async function ReceivingPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  await ensureDefaultLocation(context.business.id);

  const [locations, orders, marketplaceOrders] = await Promise.all([
    listInventoryLocations(context.business.id),
    db.purchaseOrder.findMany({
      where: { businessId: context.business.id, status: { notIn: ["RECEIVED", "CANCELLED"] } },
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: context.business.id, status: "ACCEPTED" },
      include: { seller: true, items: { include: { listing: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const openLines = orders
    .flatMap((order) => order.items.map((item) => ({ order, item, remaining: Math.max(0, Number(item.orderedQty) - Number(item.receivedQty)) })))
    .filter((row) => row.remaining > 0);
  const missing = openLines.reduce((sum, row) => sum + row.remaining, 0);
  const marketplaceUnits = marketplaceOrders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + Number(item.quantity), 0), 0);

  return <>
    <PageHeader eyebrow="المخزون" title="الاستلام الذكي" description="استلم طلبات الشراء وطلبات سوق تِجرا من شاشة واحدة. عند تأكيد طلب السوق تدخل الكمية مباشرة إلى مخزون منشأتك ومتوسط التكلفة." />
    <section className="metricsGrid three">
      <MetricCard label="طلبات شراء مفتوحة" value={`${orders.length}`} note="لم يكتمل استلامها" icon={PackageCheck} />
      <MetricCard label="طلبات سوق جاهزة" value={`${marketplaceOrders.length}`} note={`${marketplaceUnits.toLocaleString("ar-SA")} وحدة بانتظار الاستلام`} icon={ShoppingBag} tone="blue" />
      <MetricCard label="إجمالي الكمية المتبقية" value={missing.toLocaleString("ar-SA")} note="حسب طلبات الشراء الداخلية" icon={TriangleAlert} tone="amber" />
    </section>

    {marketplaceOrders.length ? <section className="panel tablePanel">
      <div className="panelHeader tableHeader"><div><span className="eyebrow">سوق تِجرا</span><h2>طلبات جاهزة للاستلام</h2></div></div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>المورد</th><th>المنتجات</th><th>الإجمالي</th><th>الإجراء</th></tr></thead>
        <tbody>{marketplaceOrders.map((order) => <tr key={order.id}>
          <td><strong>{order.seller.name}</strong><span className="mutedText" style={{ display: "block" }}>{order.id.slice(-8).toUpperCase()}</span></td>
          <td>{order.items.map((item) => `${item.listing.name} × ${Number(item.quantity).toLocaleString("ar-SA")}`).join("، ")}</td>
          <td>{formatSar(Number(order.expectedTotal))}</td>
          <td><MarketplaceOrderActions orderId={order.id} actions={["RECEIVE"]} /></td>
        </tr>)}</tbody>
      </table></div>
    </section> : <section className="panel"><div className="infoNote">لا توجد طلبات سوق مقبولة بانتظار الاستلام حاليًا.</div></section>}

    <SmartReceivingForm locations={locations} orders={orders.map((order) => ({ id: order.id, label: `${order.supplier.name} · ${order.orderNumber || order.id.slice(-8).toUpperCase()}`, items: order.items.map((item) => ({ productId: item.productId, name: item.product.name, barcode: item.product.barcode, remaining: Math.max(0, Number(item.orderedQty) - Number(item.receivedQty)), unitCost: Number(item.unitCost) })) }))} />

    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">المطابقة</span><h2>المطلوب مقابل المستلم</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>المورد</th><th>الصنف</th><th>المطلوب</th><th>المستلم</th><th>المتبقي</th></tr></thead><tbody>{openLines.map(({ order, item, remaining }) => <tr key={item.id}><td>{order.supplier.name}</td><td><strong>{item.product.name}</strong><span className="mutedText" style={{ display: "block" }}>{item.product.barcode || "بدون باركود"}</span></td><td>{Number(item.orderedQty).toLocaleString("ar-SA")}</td><td>{Number(item.receivedQty).toLocaleString("ar-SA")}</td><td className={remaining ? "dangerText" : "positive"}>{remaining.toLocaleString("ar-SA")}</td></tr>)}{!openLines.length && <tr><td colSpan={5}><div className="infoNote">لا توجد كميات معلقة من طلبات الشراء الداخلية.</div></td></tr>}</tbody></table></div></section>
  </>;
}
