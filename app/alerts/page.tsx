import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgePercent, BellRing, CircleDollarSign, ShoppingBasket, Sparkles, Tags } from "lucide-react";
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
  const bestOpportunity = [...alerts].sort((a, b) => b.estimatedOrderSaving - a.estimatedOrderSaving)[0];

  return (
    <>
      <PageHeader
        eyebrow="السعر الأذكى"
        title="تنبيهات توفير الموردين"
        description="تِجرا يقارن أسعار نفس الصنف بين الموردين ويحول فرق السعر إلى قرار شراء واضح ومباشر."
        actions={<Link className="button secondary" href="/suppliers"><Tags size={17} /> إدارة الأسعار</Link>}
      />

      <section className="metricsGrid three">
        <MetricCard label="فرص توفير" value={`${alerts.length}`} note="أصناف لها مورد أرخص" icon={BellRing} />
        <MetricCard label="توفير محتمل" value={formatSar(totalPotentialSaving)} note="على الكميات المقترحة" icon={Sparkles} tone="blue" />
        <MetricCard label="أعلى نسبة توفير" value={`${Math.round(biggestPercent)}%`} note="مقارنة بالسعر الأعلى" icon={ShoppingBasket} tone="amber" />
      </section>

      {bestOpportunity && (
        <section className="smartPriceHero panel">
          <div className="smartPriceHeroCopy">
            <span className="smartPriceKicker"><Sparkles size={15} /> أفضل فرصة الآن</span>
            <h2>وفر {formatSar(bestOpportunity.estimatedOrderSaving)} على {bestOpportunity.productName}</h2>
            <p>
              {bestOpportunity.bestSupplierName} يقدمه بـ {formatSar(bestOpportunity.bestPrice)} بدل {formatSar(bestOpportunity.comparedPrice)} لدى {bestOpportunity.comparedSupplierName}.
            </p>
            <div className="smartPriceHeroActions">
              <Link className="button primary" href="/purchases"><ShoppingBasket size={17} /> استخدم السعر الأفضل</Link>
              <Link className="button secondary" href="/suppliers">راجع الموردين <ArrowLeft size={15} /></Link>
            </div>
          </div>
          <div className="smartPriceHeroSaving">
            <span>نسبة التوفير</span>
            <strong>{Math.round(bestOpportunity.savingPercent)}%</strong>
            <small>{formatSar(bestOpportunity.savingPerUnit)} لكل {bestOpportunity.unit}</small>
          </div>
        </section>
      )}

      <section className="smartPriceSection">
        <div className="smartPriceSectionHead">
          <div><span className="eyebrow"><BadgePercent size={14} /> مقارنة فورية</span><h2>الأسعار الأفضل المكتشفة</h2></div>
          <span className="smartPriceCount">{alerts.length} فرصة</span>
        </div>

        <div className="smartPriceGrid">
          {alerts.map((alert) => (
            <article className="smartPriceCard" key={alert.productId}>
              <div className="smartPriceCardTop">
                <div className="grow">
                  <span className="smartPriceLabel">{alert.productName}</span>
                  <strong>{alert.bestSupplierName}</strong>
                </div>
                <span className="smartPricePercent">-{Math.round(alert.savingPercent)}%</span>
              </div>

              <div className="priceCompare" aria-label={`مقارنة سعر ${alert.productName}`}>
                <div className="priceOld">
                  <span>{alert.comparedSupplierName}</span>
                  <strong>{formatSar(alert.comparedPrice)}</strong>
                  <small>السعر المقارن</small>
                </div>
                <ArrowLeft className="priceArrow" size={20} />
                <div className="priceBest">
                  <span>{alert.bestSupplierName}</span>
                  <strong>{formatSar(alert.bestPrice)}</strong>
                  <small>السعر الأفضل</small>
                </div>
              </div>

              <div className="smartPriceSavings">
                <div><CircleDollarSign size={16} /><span>توفر للوحدة</span><strong>{formatSar(alert.savingPerUnit)}</strong></div>
                <div><ShoppingBasket size={16} /><span>الكمية المقترحة</span><strong>{alert.suggestedQty} {alert.unit}</strong></div>
                <div className="total"><Sparkles size={16} /><span>توفير الطلبية</span><strong>{formatSar(alert.estimatedOrderSaving)}</strong></div>
              </div>

              <Link className="smartPriceAction" href="/purchases">أضفها للمشتريات <ArrowLeft size={15} /></Link>
            </article>
          ))}

          {!alerts.length && (
            <article className="smartPriceEmpty panel">
              <div className="softIcon brand"><Tags size={21} /></div>
              <h2>أضف سعرين لنفس الصنف</h2>
              <p>سجّل نفس المنتج عند موردين مختلفين، وتِجرا يبدأ المقارنة تلقائيًا ويبلغك عند ظهور سعر أفضل.</p>
              <Link className="button primary" href="/suppliers/prices/new">تسجيل سعر مورد</Link>
            </article>
          )}
        </div>
      </section>
    </>
  );
}
