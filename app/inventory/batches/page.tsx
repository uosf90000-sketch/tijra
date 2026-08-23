import { redirect } from "next/navigation";
import { CalendarClock, PackageCheck, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { listInventoryLocations, listLots, safeJson } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الدفعات والصلاحية" };
export const dynamic = "force-dynamic";

function daysUntil(date: Date) { return Math.ceil((date.getTime() - Date.now()) / 86400000); }

export default async function BatchesPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  const [lots, products, locations] = await Promise.all([
    listLots(context.business.id),
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, unit: true }, take: 2000 }),
    listInventoryLocations(context.business.id),
  ]);
  const productMap = new Map(products.map((x) => [x.id, x])); const locationMap = new Map(locations.map((x) => [x.id, x.name]));
  const active = lots.filter((x) => x.quantity > 0); const expiring = active.filter((x) => x.expiresAt && daysUntil(x.expiresAt) <= 30 && daysUntil(x.expiresAt) >= 0); const expired = active.filter((x) => x.expiresAt && daysUntil(x.expiresAt) < 0);
  const value = active.reduce((s, x) => s + x.quantity * (x.unitCost ?? 0), 0);
  return <>
    <PageHeader eyebrow="المخزون" title="الدفعات وتواريخ الصلاحية" description="تِجرا يحتفظ بالدفعة وتاريخ الانتهاء عند الاستلام، ويعرض الأقرب للصلاحية أولًا حتى تقلل التلف والهدر." />
    <section className="metricsGrid three"><MetricCard label="دفعات نشطة" value={`${active.length}`} note={formatSar(value)} icon={PackageCheck} /><MetricCard label="تنتهي خلال 30 يوم" value={`${expiring.length}`} note="تحتاج متابعة" icon={CalendarClock} tone="amber" /><MetricCard label="منتهية" value={`${expired.length}`} note="لا ينبغي بيعها" icon={TriangleAlert} tone="red" /></section>
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">FEFO</span><h2>الأقرب انتهاءً أولًا</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>الدفعة</th><th>الموقع</th><th>الكمية</th><th>الصلاحية</th><th>الحالة</th><th>التكلفة</th></tr></thead><tbody>{[...active].sort((a,b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity)).map((lot) => { const product = productMap.get(lot.productId); const days = lot.expiresAt ? daysUntil(lot.expiresAt) : null; return <tr key={lot.id}><td><strong>{product?.name || "صنف"}</strong></td><td>{lot.lotNumber}</td><td>{lot.locationId ? locationMap.get(lot.locationId) || "موقع" : "عام"}</td><td>{lot.quantity.toLocaleString("ar-SA")} {product?.unit || ""}</td><td>{lot.expiresAt ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(lot.expiresAt) : "بدون تاريخ"}</td><td className={days != null && days < 0 ? "dangerText" : days != null && days <= 30 ? "warningText" : "positive"}>{days == null ? "غير محددة" : days < 0 ? `منتهية منذ ${Math.abs(days)} يوم` : `${days} يوم`}</td><td>{lot.unitCost == null ? "—" : formatSar(lot.unitCost)}</td></tr>; })}{!active.length && <tr><td colSpan={7}><div className="infoNote">أدخل رقم الدفعة وتاريخ الصلاحية أثناء الاستلام الذكي ليبدأ التتبع.</div></td></tr>}</tbody></table></div></section>
  </>;
}
