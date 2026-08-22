import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  Boxes,
  CircleDollarSign,
  PackageSearch,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusPill } from "@/components/status-pill";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { buildSmartPriceAlerts } from "@/lib/price-intelligence";

export const dynamic = "force-dynamic";

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default async function DashboardPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role === "STAFF") redirect(firstPermissionHref(context.membership));
  const businessId = context.business.id;
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const [todaySales, products, weekSalesRows, employees, latestPayroll, supplierOffers] = await Promise.all([
    db.sale.aggregate({
      where: { businessId, soldAt: { gte: today } },
      _sum: { total: true, costTotal: true },
    }),
    db.product.findMany({
      where: { businessId, active: true },
      include: { supplierItems: { include: { supplier: true }, orderBy: { price: "asc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    db.sale.findMany({ where: { businessId, soldAt: { gte: weekStart } }, select: { soldAt: true, total: true } }),
    db.employee.findMany({ where: { businessId, active: true }, select: { baseSalary: true, defaultAllowance: true } }),
    db.payrollRun.findFirst({ where: { businessId }, include: { items: true }, orderBy: { periodEnd: "desc" } }),
    db.supplierProduct.findMany({
      where: { supplier: { businessId }, product: { active: true } },
      include: { supplier: true, product: true },
      orderBy: [{ productId: "asc" }, { price: "asc" }],
      take: 1000,
    }),
  ]);

  const salesToday = Number(todaySales._sum.total ?? 0);
  const costToday = Number(todaySales._sum.costTotal ?? 0);
  const grossProfit = Math.max(0, salesToday - costToday);
  const stockValue = products.reduce((sum, item) => sum + Number(item.quantity) * Number(item.averageCost), 0);

  const lowItems = products
    .filter((item) => Number(item.quantity) <= Number(item.reorderPoint))
    .map((item) => {
      const quantity = Number(item.quantity);
      const reorderPoint = Number(item.reorderPoint);
      return {
        ...item,
        quantityNumber: quantity,
        reorderPointNumber: reorderPoint,
        status: quantity <= Math.max(1, reorderPoint * 0.5) ? "critical" : "low",
      };
    })
    .slice(0, 6);

  const purchaseSuggestions = lowItems
    .map((item) => {
      const offer = item.supplierItems[0];
      const target = Math.max(item.reorderPointNumber * 2, item.reorderPointNumber + 1);
      const suggested = Math.max(0, Math.ceil(target - item.quantityNumber));
      return offer && suggested > 0 ? {
        product: item.name,
        supplier: offer.supplier.name,
        suggested,
        unit: item.unit,
        unitPrice: Number(offer.price),
      } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const suggestedTotal = purchaseSuggestions.reduce((sum, item) => sum + item.suggested * item.unitPrice, 0);

  const smartPriceAlerts = buildSmartPriceAlerts(supplierOffers.map((offer) => ({
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
  const topSmartPrice = smartPriceAlerts[0];
  const totalSmartSaving = smartPriceAlerts.reduce((sum, alert) => sum + alert.estimatedOrderSaving, 0);

  const daySlots = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return { date, key: date.toISOString().slice(0, 10), value: 0 };
  });
  for (const row of weekSalesRows) {
    const key = row.soldAt.toISOString().slice(0, 10);
    const slot = daySlots.find((item) => item.key === key);
    if (slot) slot.value += Number(row.total);
  }
  const weeklySales = daySlots.map((slot) => ({
    day: new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(slot.date),
    value: slot.value,
  }));
  const maxSales = Math.max(1, ...weeklySales.map((item) => item.value));
  const weekTotal = weeklySales.reduce((sum, item) => sum + item.value, 0);

  const payrollTotal = latestPayroll
    ? latestPayroll.items.reduce((sum, item) => sum + Number(item.netSalary), 0)
    : employees.reduce((sum, item) => sum + Number(item.baseSalary) + Number(item.defaultAllowance), 0);

  const pageDate = new Intl.DateTimeFormat("ar-SA", { dateStyle: "full" }).format(now);

  return (
    <>
      <PageHeader
        eyebrow={pageDate}
        title={`أهلًا ${context.user.name.split(" ")[0]} 👋`}
        description="هذه أهم الأرقام والتنبيهات من بيانات منشأتك الفعلية."
        actions={<Link className="button primary" href="/purchases"><Sparkles size={18} /> جهّز مشتريات اليوم</Link>}
      />

      <section className="metricsGrid" aria-label="ملخص اليوم">
        <MetricCard label="مبيعات اليوم" value={formatSar(salesToday)} note="من عمليات البيع المسجلة" icon={TrendingUp} />
        <MetricCard label="الربح الإجمالي" value={formatSar(grossProfit)} note={salesToday > 0 ? `هامش ${Math.round((grossProfit / salesToday) * 100)}%` : "لا توجد مبيعات اليوم"} icon={CircleDollarSign} tone="blue" />
        <MetricCard label="قيمة المخزون" value={formatSar(stockValue)} note={`${products.length} صنفًا فعليًا`} icon={Boxes} tone="violet" />
        <MetricCard label="مشتريات مقترحة" value={formatSar(suggestedTotal)} note={`${purchaseSuggestions.length} أصناف لها سعر مورد`} icon={ShoppingBasket} tone="amber" />
      </section>

      {topSmartPrice && (
        <section className="smartPriceHero panel" aria-label="أفضل فرصة توفير">
          <div className="smartPriceHeroCopy">
            <span className="smartPriceKicker"><BellRing size={15} /> السعر الأذكى</span>
            <h2>وجدنا موردًا أرخص لـ {topSmartPrice.productName}</h2>
            <p>
              {topSmartPrice.comparedSupplierName} بسعر {formatSar(topSmartPrice.comparedPrice)}، بينما {topSmartPrice.bestSupplierName} بسعر {formatSar(topSmartPrice.bestPrice)}. وفر {formatSar(topSmartPrice.savingPerUnit)} لكل {topSmartPrice.unit} ({Math.round(topSmartPrice.savingPercent)}%).
            </p>
            <div className="smartPriceHeroActions">
              <Link className="button primary" href="/alerts">عرض فرص التوفير</Link>
              <Link className="button secondary" href="/suppliers">مقارنة الموردين</Link>
            </div>
          </div>
          <div className="smartPriceHeroSaving">
            <span>توفير محتمل</span>
            <strong>{formatSar(totalSmartSaving)}</strong>
            <small>على الكميات المقترحة</small>
          </div>
        </section>
      )}

      <section className="dashboardGrid">
        <article className="panel aiRecommendation">
          <div className="panelHeader">
            <div><span className="eyebrow"><Sparkles size={14} /> اقتراح تِجرا</span><h2>{purchaseSuggestions.length ? "طلبية اليوم جاهزة للمراجعة" : "لا توجد طلبية عاجلة الآن"}</h2></div>
            <div className="softIcon brand"><Sparkles size={21} /></div>
          </div>
          <p className="panelLead">
            {purchaseSuggestions.length
              ? `حسب نقاط إعادة الطلب والأسعار المسجلة، توجد ${purchaseSuggestions.length} أصناف بقيمة تقريبية ${formatSar(suggestedTotal)}.`
              : "أضف أسعار الموردين ونقاط إعادة الطلب حتى تبني تِجرا اقتراحات شراء دقيقة تلقائيًا."}
          </p>

          <div className="suggestionPreview">
            {purchaseSuggestions.slice(0, 4).map((item) => (
              <div className="suggestionRow" key={`${item.product}-${item.supplier}`}>
                <div className="productDot" />
                <div className="grow"><strong>{item.product}</strong><span>{item.supplier}</span></div>
                <div className="alignEnd"><strong>{item.suggested} {item.unit}</strong><span>{formatSar(item.suggested * item.unitPrice)}</span></div>
              </div>
            ))}
            {!purchaseSuggestions.length && <div className="noticeBox"><PackageSearch size={18} /><div><strong>أكمل بيانات الموردين</strong><span>أضف سعرًا واحدًا على الأقل لكل صنف تريد مقارنته.</span></div></div>}
          </div>

          <div className="panelActions">
            <Link className="button primary" href="/purchases">فتح المشتريات</Link>
            <Link className="button secondary" href="/suppliers">إدارة الموردين</Link>
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow amber"><TriangleAlert size={14} /> تنبيه المخزون</span><h2>أصناف تحتاج انتباهًا</h2></div>
            <Link className="textLink" href="/inventory">عرض الكل <ArrowLeft size={15} /></Link>
          </div>

          <div className="alertList">
            {lowItems.map((item) => (
              <div className="alertRow" key={item.id}>
                <div className="grow">
                  <div className="rowTitle"><strong>{item.name}</strong><StatusPill status={item.status} /></div>
                  <span>{item.quantityNumber} {item.unit} · نقطة إعادة الطلب {item.reorderPointNumber}</span>
                  <ProgressBar value={item.quantityNumber} max={Math.max(item.reorderPointNumber * 2, 1)} tone={item.status === "critical" ? "red" : "amber"} />
                </div>
              </div>
            ))}
            {!lowItems.length && <div className="noticeBox"><PackageSearch size={18} /><div><strong>لا توجد نواقص مسجلة</strong><span>ستظهر هنا الأصناف التي تصل إلى نقطة إعادة الطلب.</span></div></div>}
          </div>
        </article>
      </section>

      <section className="dashboardGrid lower">
        <article className="panel chartPanel">
          <div className="panelHeader">
            <div><span className="eyebrow">آخر 7 أيام</span><h2>اتجاه المبيعات</h2></div>
            <div className="miniSummary"><strong>{formatSar(weekTotal)}</strong><span>إجمالي الأسبوع</span></div>
          </div>
          <div className="barChart" aria-label="مبيعات آخر سبعة أيام">
            {weeklySales.map((item, index) => (
              <div className="barColumn" key={`${item.day}-${index}`}>
                <span className="barValue">{item.value >= 1000 ? `${Math.round(item.value / 100) / 10}k` : Math.round(item.value)}</span>
                <div className="barTrack"><div className="bar" style={{ height: `${Math.max(6, (item.value / maxSales) * 100)}%` }} /></div>
                <span>{item.day}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow violet"><UsersRound size={14} /> الرواتب</span><h2>{latestPayroll ? "آخر مسير" : "الرواتب المتوقعة"}</h2></div>
            <StatusPill status={latestPayroll?.status.toLowerCase() ?? "draft"} />
          </div>
          <div className="payrollSnapshot">
            <div><span>صافي الرواتب</span><strong>{formatSar(payrollTotal)}</strong></div>
            <div><span>الموظفون</span><strong>{employees.length}</strong></div>
            <div><span>حالة المسير</span><strong>{latestPayroll?.status === "PAID" ? "مدفوع" : latestPayroll?.status === "APPROVED" ? "معتمد" : "مسودة"}</strong></div>
          </div>
          <div className="noticeBox"><PackageSearch size={18} /><div><strong>الرواتب منفصلة عن التمويل</strong><span>تِجرا يحسب ويدير المسير فقط ولا يقدم تمويلًا أو إقراضًا.</span></div></div>
          <Link className="button secondary full" href="/payroll">فتح مسير الرواتب</Link>
        </article>
      </section>
    </>
  );
}
