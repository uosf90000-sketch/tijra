import { redirect } from "next/navigation";
import { ClipboardCheck, History, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SupplierInventoryAuditForm } from "@/components/supplier-inventory-audit-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "جرد المورد" };
export const dynamic = "force-dynamic";

export default async function SupplierStockCountPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  const [listings, events] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id, active: true }, orderBy: { name: "asc" }, take: 1000 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: "COUNT" }, orderBy: { occurredAt: "desc" }, take: 100 }),
  ]);
  const differences = events.filter((event) => Number(event.previousQuantity ?? 0) !== Number(event.newQuantity ?? 0)).length;
  const employees = new Set(events.map((event) => event.actorName)).size;
  return <><PageHeader eyebrow="المخزون" title="الجرد السريع" description="اختر المنتج وأدخل الكمية الفعلية. يحفظ تِجرا الموظف والوقت والفرق تلقائيًا." /><section className="metricsGrid three"><MetricCard label="عمليات الجرد" value={`${events.length}`} note="آخر 100 عملية" icon={ClipboardCheck} /><MetricCard label="فروقات" value={`${differences}`} note="احتاجت تسوية" icon={History} tone="amber" /><MetricCard label="موظفون" value={`${employees}`} note="نفذوا جردًا" icon={UsersRound} tone="blue" /></section><section className="panel workflowPanel"><SupplierInventoryAuditForm listings={listings.map((item) => ({ id: item.id, name: item.name, unit: item.unit, quantity: Number(item.quantity) }))} /></section><section className="panel tablePanel workflowTable"><div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>آخر الجردات</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الموظف</th><th>الصنف</th><th>قبل</th><th>بعد</th><th>الوقت</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><strong>{event.actorName}</strong></td><td>{event.itemName || "—"}</td><td>{Number(event.previousQuantity ?? 0).toLocaleString("ar-SA")}</td><td>{Number(event.newQuantity ?? 0).toLocaleString("ar-SA")}</td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}</td></tr>)}{!events.length && <tr><td colSpan={5}><div className="infoNote">لا توجد عمليات جرد بعد.</div></td></tr>}</tbody></table></div></section></>;
}
