import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, ClipboardList, PackageCheck, ShoppingCart, Store, TrendingUp } from "lucide-react";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const dynamic = "force-dynamic";

type SmartInsight = {
  title: string;
  note: string;
  href: string;
  tone?: "warning" | "danger" | "good";
  icon: typeof Store;
};

type StatStripItem = {
  label: string;
  value: string;
  note: string;
  icon: typeof Store;
  href?: string;
};

type ChartPoint = { label: string; value: number };

function dayStart(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function monthStart() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function weekTemplate() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = dayStart(index - 6);
    return {
      date,
      key: dayKey(date),
      label: new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(date),
    };
  });
}

function StatStrip({ items }: { items: StatStripItem[] }) {
  return <section className="dashboardStatStrip executiveStats">{items.map(({ label, value, note, icon: Icon, href }) => {
    const content = <><span className="dashboardStripIcon"><Icon size={18} /></span><span className="dashboardStripLabel">{label}</span><strong>{value}</strong><small>{note}</small></>;
    return href
      ? <Link className="dashboardStripItem dashboardStripLink" href={href} key={label}>{content}</Link>
      : <article className="dashboardStripItem" key={label}>{content}</article>;
  })}</section>;
}

function Donut({ percent, label }: { percent: number; label: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return <div className="executiveDonutWrap"><div className="dashboardDonut" style={{ "--donut": `${safe * 3.6}deg` } as CSSProperties}><div><strong>{safe}%</strong><span>{label}</span></div></div></div>;
}

function ColumnChart({ points, valueLabel }: { points: ChartPoint[]; valueLabel: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return <div className="executiveChartBody">
    <div className="executiveChartSummary"><span>{valueLabel}</span><strong>{formatSar(total)}</strong></div>
    <div className="executiveColumns" role="img" aria-label={`${valueLabel} خلال آخر 7 أيام`}>
      {points.map((point) => <div className="executiveColumn" key={point.label} title={`${point.label}: ${formatSar(point.value)}`}>
        <div className="executiveColumnTrack"><span style={{ height: `${Math.max(point.value > 0 ? 8 : 2, (point.value / max) * 100)}%` }} /></div>
        <small>{point.label}</small>
      </div>)}
    </div>
  </div>;
}

function SmartInsights({ items }: { items: SmartInsight[] }) {
  const visible = items.slice(0, 3);
  return <section className="smartOwnerPanel executiveAttention">
    <div className="smartOwnerPanelHead"><div><span className="dashboardEyebrow">يحتاج قرارك</span><h2>المهم الآن</h2></div><span>{visible.length || 0}</span></div>
    {visible.length ? <div className="smartOwnerList">{visible.map(({ title, note, href, tone = "warning", icon: Icon }) => <Link href={href} className={`smartOwnerInsight ${tone}`} key={`${href}-${title}`}><span className="smartOwnerInsightIcon"><Icon size={19} /></span><div><strong>{title}</strong><span>{note}</span></div></Link>)}</div> : <div className="smartOwnerAllGood"><PackageCheck size={20} /><div><strong>كل شيء تحت السيطرة</strong><span>لا يوجد شيء عاجل يحتاج تدخلك الآن.</span></div></div>}
  </section>;
}

function ExecutiveHeader({ firstName, mode }: { firstName: string; mode: "retailer" | "supplier" }) {
  return <header className="dashboardGreeting executiveGreeting">
    <div><span>{mode === "supplier" ? "إدارة التوريد" : "إدارة المنشأة"}</span><h1>مرحبًا {firstName}</h1><p>نظرة واحدة تكفي لمعرفة وضع شركتك اليوم.</p></div>
    <span className="dashboardDate">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date())}</span>
  </header>;
}

async function RetailerDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const today = dayStart();
  const weekStart = dayStart(-6);
  const [activeOrders, products, weekSales] = await Promise.all([
    db.marketplaceOrder.findMany({ where: { buyerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, select: { id: true } }),
    db.product.findMany({ where: { businessId, active: true }, select: { quantity: true, averageCost: true, reorderPoint: true } }),
    db.sale.findMany({ where: { businessId, soldAt: { gte: weekStart } }, select: { total: true, costTotal: true, soldAt: true } }),
  ]);

  const todaySales = weekSales.filter((sale) => sale.soldAt >= today);
  const todaySalesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const todayProfit = todaySales.reduce((sum, sale) => sum + Number(sale.total) - Number(sale.costTotal), 0);
  const stockValue = products.reduce((sum, item) => sum + Number(item.quantity) * Number(item.averageCost), 0);
  const lowStock = products.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Math.max(1, Number(item.reorderPoint))).length;
  const outOfStock = products.filter((item) => Number(item.quantity) <= 0).length;
  const healthy = products.filter((item) => Number(item.quantity) > Math.max(1, Number(item.reorderPoint))).length;
  const stockHealth = products.length ? (healthy / products.length) * 100 : 100;

  const totalsByDay = new Map<string, number>();
  for (const sale of weekSales) totalsByDay.set(dayKey(sale.soldAt), (totalsByDay.get(dayKey(sale.soldAt)) ?? 0) + Number(sale.total));
  const weekPoints = weekTemplate().map((day) => ({ label: day.label, value: totalsByDay.get(day.key) ?? 0 }));

  const insights: SmartInsight[] = [];
  if (outOfStock) insights.push({ title: `${outOfStock} أصناف نافدة`, note: "راجعها قبل أن تؤثر على المبيعات.", href: "/inventory", tone: "danger", icon: Boxes });
  if (lowStock) insights.push({ title: `${lowStock} أصناف منخفضة`, note: "قد تحتاج طلب شراء قريبًا.", href: "/inventory", tone: "warning", icon: AlertTriangle });
  if (activeOrders.length) insights.push({ title: `${activeOrders.length} طلبات حالية`, note: "تابع حالة الطلبات المفتوحة.", href: "/marketplace/orders", tone: "warning", icon: ClipboardList });

  return <main className="approvedDashboard executiveHome">
    <ExecutiveHeader firstName={firstName} mode="retailer" />
    <StatStrip items={[
      { label: "مبيعات اليوم", value: formatSar(todaySalesTotal), note: `${todaySales.length} فاتورة`, icon: ShoppingCart },
      { label: "ربح اليوم", value: formatSar(todayProfit), note: "بعد تكلفة البضاعة", icon: TrendingUp },
      { label: "قيمة المخزون", value: formatSar(stockValue), note: `${products.length} صنف`, icon: Boxes },
      { label: "الطلبات الحالية", value: `${activeOrders.length}`, note: "قيد التنفيذ", icon: ClipboardList, href: "/marketplace/orders" },
    ]} />
    <section className="executiveVisualGrid">
      <article className="dashboardCard executiveChartCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">المبيعات</span><h2>آخر 7 أيام</h2></div><span className="dashboardCardIcon teal"><TrendingUp size={20} /></span></div><ColumnChart points={weekPoints} valueLabel="إجمالي الأسبوع" /></article>
      <article className="dashboardCard executiveHealthCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">المخزون</span><h2>صحة المخزون</h2><p>{healthy} صنف بوضع جيد</p></div><span className="dashboardCardIcon"><Boxes size={20} /></span></div><Donut percent={stockHealth} label="سليم" /><div className="executiveHealthSignals"><span>{lowStock} منخفض</span><span>{outOfStock} نافد</span></div></article>
    </section>
    <SmartInsights items={insights} />
  </main>;
}

async function SupplierDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const start = monthStart();
  const weekStart = dayStart(-6);
  const [listings, receivedOrders, activeOrders] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: businessId, active: true }, select: { quantity: true, price: true, minOrderQty: true } }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: "RECEIVED", createdAt: { gte: start } }, select: { expectedTotal: true, createdAt: true, receivedAt: true } }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, select: { id: true } }),
  ]);

  const monthSales = receivedOrders.reduce((sum, order) => sum + Number(order.expectedTotal), 0);
  const averageOrder = receivedOrders.length ? monthSales / receivedOrders.length : 0;
  const stockValue = listings.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const lowStock = listings.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Math.max(5, Number(item.minOrderQty))).length;
  const outOfStock = listings.filter((item) => Number(item.quantity) <= 0).length;
  const healthy = listings.filter((item) => Number(item.quantity) > Math.max(5, Number(item.minOrderQty))).length;
  const stockHealth = listings.length ? (healthy / listings.length) * 100 : 100;

  const totalsByDay = new Map<string, number>();
  for (const order of receivedOrders) {
    const date = order.receivedAt ?? order.createdAt;
    if (date < weekStart) continue;
    totalsByDay.set(dayKey(date), (totalsByDay.get(dayKey(date)) ?? 0) + Number(order.expectedTotal));
  }
  const weekPoints = weekTemplate().map((day) => ({ label: day.label, value: totalsByDay.get(day.key) ?? 0 }));

  const insights: SmartInsight[] = [];
  if (activeOrders.length) insights.push({ title: `${activeOrders.length} طلبات تحتاج متابعة`, note: "راجع الطلبات المفتوحة.", href: "/marketplace/seller#orders", tone: "warning", icon: ClipboardList });
  if (outOfStock) insights.push({ title: `${outOfStock} منتجات نافدة`, note: "حدّث المخزون قبل استقبال طلبات جديدة.", href: "/inventory", tone: "danger", icon: Boxes });
  if (lowStock) insights.push({ title: `${lowStock} منتجات منخفضة`, note: "قد تحتاج إعادة تعبئة قريبًا.", href: "/inventory", tone: "warning", icon: AlertTriangle });

  return <main className="approvedDashboard executiveHome">
    <ExecutiveHeader firstName={firstName} mode="supplier" />
    <StatStrip items={[
      { label: "مبيعات الشهر", value: formatSar(monthSales), note: `${receivedOrders.length} طلب مستلم`, icon: ShoppingCart },
      { label: "الطلبات الحالية", value: `${activeOrders.length}`, note: "تحتاج إجراء", icon: ClipboardList, href: "/marketplace/seller#orders" },
      { label: "قيمة المخزون", value: formatSar(stockValue), note: `${listings.length} منتج`, icon: Boxes },
      { label: "متوسط الطلب", value: formatSar(averageOrder), note: "هذا الشهر", icon: TrendingUp },
    ]} />
    <section className="executiveVisualGrid">
      <article className="dashboardCard executiveChartCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">المبيعات</span><h2>آخر 7 أيام</h2></div><span className="dashboardCardIcon teal"><TrendingUp size={20} /></span></div><ColumnChart points={weekPoints} valueLabel="إجمالي الأسبوع" /></article>
      <article className="dashboardCard executiveHealthCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">المخزون</span><h2>صحة المخزون</h2><p>{healthy} منتج بوضع جيد</p></div><span className="dashboardCardIcon"><Boxes size={20} /></span></div><Donut percent={stockHealth} label="سليم" /><div className="executiveHealthSignals"><span>{lowStock} منخفض</span><span>{outOfStock} نافد</span></div></article>
    </section>
    <SmartInsights items={insights} />
  </main>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role === "STAFF") redirect(firstPermissionHref(context.membership));

  const params = await searchParams;
  const firstName = context.user.name.split(" ")[0];
  const businessType = context.business.businessType;
  const requestedMode = params.mode === "supplier" ? "supplier" : "retailer";

  if (businessType === "SUPPLIER") return <SupplierDashboard businessId={context.business.id} firstName={firstName} />;
  if (businessType === "BOTH" && requestedMode === "supplier") return <SupplierDashboard businessId={context.business.id} firstName={firstName} />;
  return <RetailerDashboard businessId={context.business.id} firstName={firstName} />;
}
