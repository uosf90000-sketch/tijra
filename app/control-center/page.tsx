import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, CalendarClock, ClipboardCheck, RotateCcw, ShoppingBasket } from "lucide-react";
import { firstPermissionHref } from "@/lib/access";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { listLots, listShifts } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "مركز الرقابة" };
export const dynamic = "force-dynamic";

function daysUntil(date: Date) { return Math.ceil((date.getTime() - Date.now()) / 86400000); }

export default async function ControlCenterPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  if (context.membership.role === "STAFF") redirect(firstPermissionHref(context.membership));
  const businessId = context.business.id;
  const since7 = new Date(); since7.setDate(since7.getDate() - 7);
  const since30 = new Date(); since30.setDate(since30.getDate() - 30);
  const [products, lots, shifts, events, buyerOrders, sellerOrders] = await Promise.all([
    db.product.findMany({ where: { businessId, active: true }, select: { id: true, name: true, quantity: true, reorderPoint: true, unit: true }, orderBy: { quantity: "asc" }, take: 1200 }),
    listLots(businessId),
    listShifts(businessId, 100),
    db.inventoryAuditEvent.findMany({ where: { businessId, occurredAt: { gte: since7 }, action: { in: ["WASTE", "DAMAGED", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "DAY_CLOSE_ADJUSTMENT", "LOCATION_TRANSFER"] } }, orderBy: { occurredAt: "desc" }, take: 200 }),
    db.marketplaceOrder.findMany({ where: { buyerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, include: { seller: true }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, include: { buyer: true }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  const low = products.filter((x) => Number(x.quantity) <= Math.max(Number(x.reorderPoint), 0) && Number(x.reorderPoint) > 0);
  const out = products.filter((x) => Number(x.quantity) <= 0);
  const expiring = lots.filter((x) => x.quantity > 0 && x.expiresAt && daysUntil(x.expiresAt) >= 0 && daysUntil(x.expiresAt) <= 30);
  const expired = lots.filter((x) => x.quantity > 0 && x.expiresAt && daysUntil(x.expiresAt) < 0);
  const closedShifts = shifts.filter((x) => x.status === "CLOSED" && x.closedAt && x.closedAt >= since30);
  const shiftIssues = closedShifts.filter((x) => Math.abs((x.actualCash ?? 0) - (x.expectedCash ?? 0)) >= 1);
  const totalShiftDifference = shiftIssues.reduce((s, x) => s + Math.abs((x.actualCash ?? 0) - (x.expectedCash ?? 0)), 0);
  const waste = events.filter((x) => x.action === "WASTE" || x.action === "DAMAGED").reduce((s, x) => s + Number(x.quantity ?? 0), 0);
  const returns = events.filter((x) => x.action === "CUSTOMER_RETURN" || x.action === "SUPPLIER_RETURN").length;
  const alerts = [
    ...out.slice(0, 8).map((x) => ({ level: "danger", title: `${x.name} نافد`, note: "الرصيد صفر — راجع الشراء أو المورد.", href: "/inventory" })),
    ...low.filter((x) => Number(x.quantity) > 0).slice(0, 8).map((x) => ({ level: "warning", title: `${x.name} منخفض`, note: `المتبقي ${Number(x.quantity).toLocaleString("ar-SA")} ${x.unit}.`, href: "/smart-buy" })),
    ...expired.slice(0, 8).map((x) => ({ level: "danger", title: `دفعة منتهية`, note: `${x.lotNumber} — راجع الدفعات فورًا.`, href: "/inventory/batches" })),
    ...expiring.slice(0, 8).map((x) => ({ level: "warning", title: `صلاحية قريبة`, note: `${x.lotNumber} تنتهي خلال ${daysUntil(x.expiresAt!)} يوم.`, href: "/inventory/batches" })),
    ...shiftIssues.slice(0, 5).map((x) => ({ level: "danger", title: `فرق وردية ${x.actorName}`, note: `الفرق ${formatSar((x.actualCash ?? 0) - (x.expectedCash ?? 0))}.`, href: "/sales/shifts" })),
  ].slice(0, 25);
  return <>
    <PageHeader eyebrow="الإدارة" title="مركز الرقابة" description="ملخص واحد لما يحتاج انتباهك الآن: المخزون، الصلاحية، فروقات الورديات، المرتجعات والهدر والطلبات المفتوحة." />
    <section className="metricsGrid four"><MetricCard label="أصناف منخفضة/نافدة" value={`${new Set([...low, ...out].map((x) => x.id)).size}`} note={`${out.length} نافد`} icon={Boxes} /><MetricCard label="صلاحيات قريبة/منتهية" value={`${expiring.length + expired.length}`} note={`${expired.length} منتهية`} icon={CalendarClock} tone="amber" /><MetricCard label="فروقات ورديات" value={formatSar(totalShiftDifference)} note={`${shiftIssues.length} وردية خلال 30 يوم`} icon={ClipboardCheck} tone="violet" /><MetricCard label="هدر/تالف 7 أيام" value={waste.toLocaleString("ar-SA")} note={`${returns} حركة مرتجع`} icon={RotateCcw} tone="blue" /></section>
    <section className="workflowGrid two"><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><AlertTriangle size={14} /> يحتاج انتباه</span><h2>تنبيهات التشغيل</h2></div><strong>{alerts.length}</strong></div><div className="alertStack">{alerts.map((alert, index) => <Link key={`${alert.title}-${index}`} href={alert.href} className={`controlAlert ${alert.level}`}><AlertTriangle size={17} /><div><strong>{alert.title}</strong><span>{alert.note}</span></div></Link>)}{!alerts.length && <div className="infoNote">لا توجد إشارات حرجة في البيانات الحالية.</div>}</div></article><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><ShoppingBasket size={14} /> الطلبات</span><h2>الحركة المفتوحة</h2></div></div><div className="insightList"><div><strong>{buyerOrders.length}</strong><span>طلبات شراء كتاجر</span></div><div><strong>{sellerOrders.length}</strong><span>طلبات واردة كمورد</span></div><div><strong>{events.length}</strong><span>حركات استثنائية خلال 7 أيام</span></div><div><strong>{shifts.filter((x) => x.status === "OPEN").length}</strong><span>وردية مفتوحة</span></div></div><div className="pageActionGroup"><Link className="button secondary" href="/inventory/movements">سجل حركة الصنف</Link><Link className="button secondary" href="/activity">مركز النشاط</Link></div></article></section>
    {events.length ? <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">آخر 7 أيام</span><h2>حركات تحتاج مراجعة</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الوقت</th><th>الحركة</th><th>الصنف</th><th>الكمية</th><th>الموظف</th><th>التفاصيل</th></tr></thead><tbody>{events.slice(0, 50).map((e) => <tr key={e.id}><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(e.occurredAt)}</td><td>{e.action}</td><td>{e.itemName || "—"}</td><td>{Number(e.quantity ?? 0).toLocaleString("ar-SA")}</td><td>{e.actorName}</td><td>{e.note || "—"}</td></tr>)}</tbody></table></div></section> : null}
  </>;
}
