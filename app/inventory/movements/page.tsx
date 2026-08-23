import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowDownLeft, ArrowUpRight, Boxes } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "سجل حركة الصنف" };
export const dynamic = "force-dynamic";

const movementLabels: Record<string, string> = {
  OPENING_BALANCE: "رصيد افتتاحي", SALE: "بيع", PURCHASE_RECEIPT: "استلام شراء", ADJUSTMENT_IN: "تسوية / إضافة", ADJUSTMENT_OUT: "تسوية / إخراج", RETURN_IN: "مرتجع داخل", RETURN_OUT: "مرتجع خارج", WASTE: "هدر",
};
const auditLabels: Record<string, string> = {
  CUSTOMER_RETURN: "مرتجع عميل", SUPPLIER_RETURN: "مرتجع للمورد", DAMAGED: "تالف", WASTE: "هدر", LOCATION_TRANSFER: "تحويل موقع", SMART_RECEIPT: "استلام ذكي", RECIPE_SALE: "استهلاك وصفة", DAY_CLOSE_ADJUSTMENT: "فرق إقفال", STOCK_IN: "إضافة مورد", STOCK_OUT: "إخراج مورد",
};

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const context = await getSessionContext(); if (!context) redirect("/login");
  const params = await searchParams;
  const products = await db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, quantity: true, unit: true }, orderBy: { name: "asc" }, take: 1000 });
  const selected = products.find((x) => x.id === params.productId) || products[0];
  const [movements, audit] = selected ? await Promise.all([
    db.stockMovement.findMany({ where: { businessId: context.business.id, productId: selected.id }, orderBy: { occurredAt: "desc" }, take: 250 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, listingId: selected.id, action: { in: Object.keys(auditLabels) } }, orderBy: { occurredAt: "desc" }, take: 150 }),
  ]) : [[], []];
  const incoming = movements.filter((x) => Number(x.quantity) > 0).reduce((s, x) => s + Number(x.quantity), 0);
  const outgoing = movements.filter((x) => Number(x.quantity) < 0).reduce((s, x) => s + Math.abs(Number(x.quantity)), 0);
  const timeline = [
    ...movements.map((x) => ({ id: `m-${x.id}`, at: x.occurredAt, label: movementLabels[x.type] || x.type, qty: Number(x.quantity), note: x.note || x.sourceType || "حركة مخزون", actor: "النظام" })),
    ...audit.map((x) => ({ id: `a-${x.id}`, at: x.occurredAt, label: auditLabels[x.action] || x.action, qty: Number(x.quantity ?? 0) * (x.action === "SUPPLIER_RETURN" || x.action === "DAMAGED" || x.action === "WASTE" ? -1 : 1), note: x.note || "—", actor: x.actorName })),
  ].sort((a,b) => b.at.getTime() - a.at.getTime()).slice(0, 300);
  return <>
    <PageHeader eyebrow="التتبع" title="سجل حركة الصنف" description="اختر أي صنف وشاهد دخوله وخروجه: استلام، بيع، طلبات، مرتجعات، تحويلات، هدر وتسويات — مع الوقت والسبب." />
    <div className="chipList">{products.slice(0, 80).map((x) => <Link key={x.id} className={selected?.id === x.id ? "active" : ""} href={`/inventory/movements?productId=${x.id}`}>{x.name}</Link>)}</div>
    {selected ? <><section className="metricsGrid three"><MetricCard label="الرصيد الحالي" value={`${Number(selected.quantity).toLocaleString("ar-SA")} ${selected.unit}`} note={selected.name} icon={Boxes} /><MetricCard label="إجمالي الداخل المسجل" value={incoming.toLocaleString("ar-SA")} note="استلام ومرتجعات وتسويات" icon={ArrowDownLeft} tone="blue" /><MetricCard label="إجمالي الخارج المسجل" value={outgoing.toLocaleString("ar-SA")} note="بيع وإخراج وتسويات" icon={ArrowUpRight} tone="amber" /></section><section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow"><Activity size={14} /> التسلسل الزمني</span><h2>{selected.name}</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الوقت</th><th>الحركة</th><th>الكمية</th><th>الموظف/المصدر</th><th>التفاصيل</th></tr></thead><tbody>{timeline.map((x) => <tr key={x.id}><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(x.at)}</td><td><strong>{x.label}</strong></td><td className={x.qty < 0 ? "dangerText" : x.qty > 0 ? "positive" : ""}>{x.qty > 0 ? "+" : ""}{x.qty.toLocaleString("ar-SA")}</td><td>{x.actor}</td><td>{x.note}</td></tr>)}{!timeline.length && <tr><td colSpan={5}><div className="infoNote">لا توجد حركة مسجلة لهذا الصنف حتى الآن.</div></td></tr>}</tbody></table></div></section></> : <div className="infoNote">أضف أول صنف للمخزون ليبدأ سجل الحركة.</div>}
  </>;
}
