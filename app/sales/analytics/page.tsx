import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarDays, PackageSearch, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "تحليلات الكاشير" };
export const dynamic = "force-dynamic";

type Range = "day" | "week" | "month";

function rangeStart(range: Range) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (range === "week") date.setDate(date.getDate() - 6);
  if (range === "month") date.setDate(date.getDate() - 29);
  return date;
}

const labels: Record<Range, string> = { day: "اليوم", week: "آخر 7 أيام", month: "آخر 30 يوم" };

export default async function SalesAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect("/sales");

  const params = await searchParams;
  const range: Range = params.range === "week" || params.range === "month" ? params.range : "day";
  const since = rangeStart(range);

  const [sales, cashierEvents] = await Promise.all([
    db.sale.findMany({
      where: { businessId: context.business.id, soldAt: { gte: since } },
      include: { items: { include: { product: true } } },
      orderBy: { soldAt: "asc" },
    }),
    db.inventoryAuditEvent.findMany({
      where: { businessId: context.business.id, action: "CASHIER_SALE", occurredAt: { gte: since } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const total = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const cost = sales.reduce((sum, sale) => sum + Number(sale.costTotal), 0);
  const invoiceCount = sales.length;

  const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const sale of sales) for (const item of sale.items) {
    const current = productMap.get(item.productId) ?? { name: item.product.name, qty: 0, revenue: 0 };
    current.qty += Number(item.quantity);
    current.revenue += Number(item.quantity) * Number(item.unitPrice);
    productMap.set(item.productId, current);
  }
  const products = [...productMap.values()].sort((a, b) => b.qty - a.qty);
  const most = products[0];
  const least = products.length ? [...products].sort((a, b) => a.qty - b.qty)[0] : undefined;

  const dayMap = new Map<string, number>();
  for (const sale of sales) {
    const key = sale.soldAt.toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + Number(sale.total));
  }
  const bestDay = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0];

  const employeeMap = new Map<string, { total: number; count: number }>();
  for (const event of cashierEvents) {
    const current = employeeMap.get(event.actorName) ?? { total: 0, count: 0 };
    current.total += Number(event.quantity ?? 0);
    current.count += 1;
    employeeMap.set(event.actorName, current);
  }
  const employees = [...employeeMap.entries()].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  const productMax = most?.qty ?? 1;
  const employeeMax = employees[0]?.total ?? 1;

  return (
    <>
      <PageHeader eyebrow="لوحة المالك" title="تحليلات المبيعات" description={`قراءة ${labels[range]}: المبيعات، المنتجات، الأيام، وأداء الموظفين.`} actions={<Link className="button secondary" href="/sales"><BarChart3 size={17} /> رجوع للكاشير</Link>} />
      <div className="rangeTabs">{(["day", "week", "month"] as Range[]).map((item) => <Link key={item} className={range === item ? "active" : ""} href={`/sales/analytics?range=${item}`}>{labels[item]}</Link>)}</div>
      <section className="metricsGrid four">
        <MetricCard label="إجمالي المبيعات" value={formatSar(total)} note={`${invoiceCount} فاتورة`} icon={TrendingUp} />
        <MetricCard label="مجمل الربح" value={formatSar(total - cost)} note="البيع ناقص التكلفة" icon={TrendingUp} tone="blue" />
        <MetricCard label="متوسط الفاتورة" value={formatSar(invoiceCount ? total / invoiceCount : 0)} note={labels[range]} icon={BarChart3} tone="violet" />
        <MetricCard label="أفضل يوم" value={bestDay ? formatSar(bestDay[1]) : formatSar(0)} note={bestDay ? new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "short" }).format(new Date(`${bestDay[0]}T12:00:00`)) : "لا توجد مبيعات"} icon={CalendarDays} tone="amber" />
      </section>

      <section className="workflowGrid two">
        <article className="panel workflowPanel">
          <div className="panelHeader"><div><span className="eyebrow"><TrendingUp size={14} /> الأعلى</span><h2>أكثر المنتجات مبيعًا</h2></div></div>
          {most ? <div className="heroStat"><strong>{most.name}</strong><span>{most.qty.toLocaleString("ar-SA")} وحدة · {formatSar(most.revenue)}</span></div> : <div className="infoNote">لا توجد مبيعات بعد.</div>}
          <div className="rankingList">{products.slice(0, 8).map((product, index) => <div className="rankingRow" key={`${product.name}-${index}`}><span>{index + 1}</span><div><strong>{product.name}</strong><i><b style={{ width: `${Math.max(5, (product.qty / productMax) * 100)}%` }} /></i></div><em>{product.qty.toLocaleString("ar-SA")}</em></div>)}</div>
        </article>
        <article className="panel workflowPanel">
          <div className="panelHeader"><div><span className="eyebrow"><TrendingDown size={14} /> الأبطأ</span><h2>أقل المنتجات مبيعًا</h2></div></div>
          {least ? <div className="heroStat muted"><strong>{least.name}</strong><span>{least.qty.toLocaleString("ar-SA")} وحدة · {formatSar(least.revenue)}</span></div> : <div className="infoNote">لا توجد بيانات كافية.</div>}
          <div className="rankingList">{[...products].sort((a, b) => a.qty - b.qty).slice(0, 8).map((product, index) => <div className="rankingRow" key={`${product.name}-low-${index}`}><span>{index + 1}</span><div><strong>{product.name}</strong><i><b style={{ width: `${Math.max(5, (product.qty / productMax) * 100)}%` }} /></i></div><em>{product.qty.toLocaleString("ar-SA")}</em></div>)}</div>
        </article>
      </section>

      <section className="workflowGrid two">
        <article className="panel workflowPanel">
          <div className="panelHeader"><div><span className="eyebrow"><UsersRound size={14} /> الفريق</span><h2>مبيعات الموظفين</h2></div></div>
          <div className="rankingList">{employees.map((employee, index) => <div className="rankingRow" key={employee.name}><span>{index + 1}</span><div><strong>{employee.name}</strong><i><b style={{ width: `${Math.max(5, (employee.total / employeeMax) * 100)}%` }} /></i><small>{employee.count} فواتير</small></div><em>{formatSar(employee.total)}</em></div>)}</div>
          {!employees.length && <div className="infoNote">المبيعات الجديدة ستُسجل باسم الموظف الذي نفذها.</div>}
        </article>
        <article className="panel workflowPanel">
          <div className="panelHeader"><div><span className="eyebrow"><PackageSearch size={14} /> حركة المنتجات</span><h2>قراءة سريعة</h2></div></div>
          <div className="insightList"><div><strong>{products.length}</strong><span>صنف تحرك خلال الفترة</span></div><div><strong>{most?.name || "—"}</strong><span>الأكثر طلبًا</span></div><div><strong>{least?.name || "—"}</strong><span>الأبطأ حركة</span></div><div><strong>{employees[0]?.name || "—"}</strong><span>أعلى موظف مبيعات</span></div></div>
        </article>
      </section>
    </>
  );
}
