import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, ShoppingBasket, Sparkles, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { buildSmartPriceAlerts } from "@/lib/price-intelligence";

export const metadata = { title: "تنبيهات السعر الأذكى" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const businessId = context.business.id;

  const offers = await db.supplierProduct.findMany({
    where: { supplier: { businessId }, product: { active: true } },
    include: { supplier: true, product: true },
    orderBy: [{ productId: "asc" }, { price: "asc" }],
    take: 1000,
  });

  const alerts = buildSmartPriceAlerts(offers.map((offer) => ({
    productId: offer.productId,
    productName: offer.product.name,
    unit: offer.product.unit,
    supplierId: offer.supplierId,
    supplierName: offer.supplier.name,
    unitPrice: Number(offer.price),
    minOrderQty: offer.minOrderQty == null ? null : Number(offer.minOrderQty),
    onHand: Number(offer.product.quantity),
    reorderPoint: Number(offer.product.reorderPoint),
    lastQuotedAt: offer.lastQuotedAt,
  })));

  const totalPotentialSaving = alerts.reduce((sum, alert) => sum + alert.estimatedOrderSaving, 0);
  const biggestPercent = alerts.reduce((max, alert) => Math.max(max, alert.savingPercent), 0);

  return (
    <>
      <PageHeader
        eyebrow="السعر الأذكى"
        title="تنبيهات توفير الموردين"
        description="تِجرا يقارن أسعار نفس الصنف بين الموردين ويبلغك عندما يجد عرضًا أرخص."
        actions={<Link className="button secondary" href="/suppliers"><Tags size={17} /> إدارة الأسعار</Link>}
      />

      <section className="metricsGrid three">
        <MetricCard label="فرص توفير" value={`${alerts.length}`} note="أصناف لها مورد أرخص" icon={BellRing} />
        <MetricCard label="توفير محتمل" value={formatSar(totalPotentialSaving)} note="على الكميات المقترحة" icon={Sparkles} tone="blue" />
        <MetricCard label="أعلى نسبة توفير" value={`${Math.round(biggestPercent)}%`} note="مقارنة بالمورد الأعلى سعرًا" icon={ShoppingBasket} tone="amber" />
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">مقارنة فورية</span><h2>وجدنا لك أسعارًا أفضل</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead>
              <tr><th>الصنف</th><th>المورد المقارن</th><th>سعره</th><th>المورد الأرخص</th><th>السعر الأفضل</th><th>التوفير</th><th>على الطلب المقترح</th></tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.productId}>
                  <td><strong>{alert.productName}</strong></td>
                  <td>{alert.comparedSupplierName}</td>
                  <td>{formatSar(alert.comparedPrice)}</td>
                  <td><strong>{alert.bestSupplierName}</strong></td>
                  <td><strong className="positive">{formatSar(alert.bestPrice)}</strong></td>
                  <td><span className="savingText">وفر {formatSar(alert.savingPerUnit)} · {Math.round(alert.savingPercent)}%</span></td>
                  <td>{alert.suggestedQty} {alert.unit} = <strong className="positive">{formatSar(alert.estimatedOrderSaving)}</strong></td>
                </tr>
              ))}
              {!alerts.length && (
                <tr><td colSpan={7}><div className="infoNote">لا توجد فرصة توفير بعد. أضف سعرين أو أكثر لنفس الصنف من موردين مختلفين وسيبدأ تِجرا بالمقارنة تلقائيًا.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="panel">
          <div className="noticeBox">
            <Sparkles size={18} />
            <div>
              <strong>مثال التنبيه الذي يظهر للتاجر</strong>
              <span>وجدنا موردًا أرخص لـ {alerts[0].productName}: {formatSar(alerts[0].bestPrice)} بدل {formatSar(alerts[0].comparedPrice)}. التوفير {formatSar(alerts[0].savingPerUnit)} للوحدة.</span>
            </div>
          </div>
          <div className="panelActions"><Link className="button primary" href="/purchases">استخدم السعر الأفضل في المشتريات</Link></div>
        </section>
      )}
    </>
  );
}
