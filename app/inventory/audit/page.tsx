import { redirect } from "next/navigation";
import { ClipboardCheck, History, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StoreStockCountForm } from "@/components/store-stock-count-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "الجرد" };
export const dynamic = "force-dynamic";

export default async function InventoryAuditPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const [products, events] = await Promise.all([
    db.product.findMany({ where: { businessId: context.business.id, active: true }, orderBy: { name: "asc" }, take: 500 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: "STORE_COUNT" }, orderBy: { occurredAt: "desc" }, take: 100 }),
  ]);
  const employees = new Set(events.map((event) => event.actorName)).size;
  const differences = events.filter((event) => Number(event.previousQuantity ?? 0) !== Number(event.newQuantity ?? 0)).length;

  return (
    <>
      <PageHeader eyebrow="المخزون" title="الجرد" description="امسح الصنف، أدخل الكمية الفعلية، وتِجرا يحفظ الفرق واسم الموظف والوقت تلقائيًا." />
      <section className="metricsGrid three">
        <MetricCard label="عمليات الجرد" value={`${events.length}`} note="آخر 100 عملية" icon={ClipboardCheck} />
        <MetricCard label="فروقات مكتشفة" value={`${differences}`} note="عمليات احتاجت تسوية" icon={History} tone="amber" />
        <MetricCard label="موظفون نفذوا الجرد" value={`${employees}`} note="حسب الحساب المنفذ" icon={UsersRound} tone="blue" />
      </section>
      <StoreStockCountForm products={products.map((item) => ({ id: item.id, name: item.name, barcode: item.barcode, quantity: Number(item.quantity), unit: item.unit }))} />
      <section className="panel tablePanel workflowTable">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>آخر عمليات الجرد</h2></div></div>
        <div className="tableScroll"><table className="dataTable"><thead><tr><th>الموظف</th><th>الصنف</th><th>قبل</th><th>بعد</th><th>الفرق</th><th>الوقت</th></tr></thead><tbody>
          {events.map((event) => {
            const before = Number(event.previousQuantity ?? 0);
            const after = Number(event.newQuantity ?? 0);
            const delta = after - before;
            return <tr key={event.id}><td><strong>{event.actorName}</strong></td><td>{event.itemName || "—"}</td><td>{before.toLocaleString("ar-SA")}</td><td>{after.toLocaleString("ar-SA")}</td><td className={delta === 0 ? "positive" : "dangerText"}>{delta > 0 ? "+" : ""}{delta.toLocaleString("ar-SA")}</td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}</td></tr>;
          })}
          {!events.length && <tr><td colSpan={6}><div className="infoNote">أول جرد تسجله سيظهر هنا.</div></td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
