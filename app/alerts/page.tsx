import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgePercent, BellRing, CircleAlert, CircleDollarSign, ShoppingBasket, Sparkles, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { buildEarlyStockoutAlerts, buildSmartPriceAlerts } from "@/lib/price-intelligence";

export const metadata = { title: "تنبيهات تِجرا الذكية" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const businessId = context.business.id;

  const lookbackDays = 30;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const [offers, products, recentSales] = await Promise.all([
    db.supplierProduct.findMany({
      where: { supplier: { businessId }, product: { active: true } },
      include: { supplier: true, product: true },
      orderBy: [{ productId: "asc" }, { price: "asc" }],
      take: 1000,
    }),
    db.product.findMany({
      where: { businessId, active: true },
      select: {
        id: true,
        name: true,
        unit: true,
        quantity: true,
        reorderPoint: true,
        targetCoverageDays: true,
      },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    db.saleItem.findMany({
      where: {
        sale: { businessId, soldAt: { gte: since } },
      },
      select: { productId: true, quantity: true },
    }),
  ]);

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

  const salesByProduct = new Map<string, number>();
  for (const sale of recentSales) {
    salesByProduct.set(sale.productId, (salesByProduct.get(sale.productId) ?? 0) + Number(sale.quantity));
  }

  const stockoutAlerts = buildEarlyStockoutAlerts(products.map((product) => ({
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    onHand: Number(product.quantity),
    reorderPoint: Number(product.reorderPoint),
    targetCoverageDays: product.targetCoverageDays,
    soldQty: salesByProduct.get(product.id) ?? 0,
    lookbackDays,
  })));

  const urgentStockoutAlerts = stockoutAlerts.filter((alert) => alert.status !== "LOW_STOCK");
  const totalPotentialSaving = alerts.reduce((sum, alert) => sum + alert.estimatedOrderSaving, 0);
  const biggestPercent = alerts.reduce((max, alert) => Math.max(max, alert.savingPercent), 0);
  const bestOpportunity = [...alerts].sort((a, b) => b.estimatedOrderSaving - a.estimatedOrderSaving)[0];

  return (
    <>
      <PageHeader
        eyebrow="الإنذار المبكر + السعر الأذكى"
        title="تنبيهات تِجرا الذكية"
        description="تِجرا يراقب سرعة استهلاك المخزون، يتوقع قرب النفاد، ويقارن أسعار الموردين لتحويل التنبيه إلى قرار شراء."
        actions={<Link className="button secondary" href="/suppliers"><Tags size={17} /> إدارة الأسعار</Link>}
      />

      <section className="metricsGrid three">
        <MetricCard label="إنذارات المخزون" value={`${urgentStockoutAlerts.length}`} note="أصناف تحتاج انتباهًا مبكرًا" icon={CircleAlert} />
        <MetricCard label="فرص توفير" value={`${alerts.length}`} note="أصناف لها مورد أرخص" icon={BellRing} />
        <MetricCard label="توفير محتمل" value={formatSar(totalPotentialSaving)} note="على الكميات المقترحة" icon={Sparkles} tone="blue" />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="smartPriceSectionHead">
          <div>
            <span className="eyebrow"><CircleAlert size={14} /> الإنذار المبكر لنفاد المخزون</span>
            <h2>نعرف قبل أن ينفد الصنف</h2>
            <p>التوقع يعتمد على مبيعات آخر {lookbackDays} يومًا، مع مراعاة حد إعادة الطلب وهدف تغطية المخزون.</p>
          </div>
          <span className="smartPriceCount">{urgentStockoutAlerts.length} تنبيه</span>
        </div>

        <div className="smartPriceGrid">
          {urgentStockoutAlerts.map((alert) => (
            <article className="smartPriceCard" key={alert.productId}>
              <div className="smartPriceCardTop">
                <div className="grow">
                  <span className="smartPriceLabel">{alert.productName}</span>
                  <strong>{alert.status === "OUT_OF_STOCK" ? "نافد الآن" : "معرض للنفاد مبكرًا"}</strong>
                </div>
                <span className="smartPricePercent">
                  {alert.daysUntilStockout === null ? "بحاجة بيانات" : `${Math.max(0, Math.ceil(alert.daysUntilStockout))} يوم`}
                </span>
              </div>

              <div className="smartPriceSavings">
                <div><CircleAlert size={16} /><span>المخزون الحالي</span><strong>{alert.onHand} {alert.unit}</strong></div>
                <div><ShoppingBasket size={16} /><span>متوسط الاستهلاك</span><strong>{alert.averageDailySales.toFixed(2)} / يوم</strong></div>
                <div className="total"><Sparkles size={16} /><span>كمية إعادة الطلب</span><strong>{alert.recommendedOrderQty} {alert.unit}</strong></div>
              </div>

              <Link className="smartPriceAction" href="/purchases">ابدأ إعادة الطلب <ArrowLeft size={15} /></Link>
            </article>
          ))}

          {!urgentStockoutAlerts.length && (
            <article className="smartPriceEmpty panel">
              <div className="softIcon brand"><CircleAlert size={21} /></div>
              <h2>لا توجد إنذارات مبكرة حاليًا</h2>
              <p>تِجرا يراقب المبيعات والمخزون باستمرار ويظهر التنبيه عندما يتوقع قرب النفاد أو يصل الصنف إلى حد إعادة الطلب.</p>
            </article>
          )}
        </div>
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
