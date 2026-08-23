import { redirect } from "next/navigation";
import { RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { ReturnForm } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ensureDefaultLocation, listInventoryLocations } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "المرتجعات" };
export const dynamic = "force-dynamic";

const labels: Record<string, string> = { CUSTOMER_RETURN: "مرتجع عميل", SUPPLIER_RETURN: "مرتجع للمورد", DAMAGED: "تالف / غير صالح" };

export default async function ReturnsPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  await ensureDefaultLocation(context.business.id);
  const [locations, products, events] = await Promise.all([
    listInventoryLocations(context.business.id),
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, barcode: true, unit: true, quantity: true }, orderBy: { name: "asc" }, take: 1000 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: { in: ["CUSTOMER_RETURN", "SUPPLIER_RETURN", "DAMAGED"] } }, orderBy: { occurredAt: "desc" }, take: 100 }),
  ]);
  const customer = events.filter((x) => x.action === "CUSTOMER_RETURN").reduce((s, x) => s + Number(x.quantity ?? 0), 0);
  const supplier = events.filter((x) => x.action === "SUPPLIER_RETURN").reduce((s, x) => s + Number(x.quantity ?? 0), 0);
  const damaged = events.filter((x) => x.action === "DAMAGED").reduce((s, x) => s + Number(x.quantity ?? 0), 0);
  return <>
    <PageHeader eyebrow="المخزون" title="المرتجعات" description="مرتجع العميل يعيد البضاعة للمخزون، والمرتجع للمورد أو التالف يخرجها. كل حركة مرتبطة بالموظف والسبب." />
    <section className="metricsGrid three"><MetricCard label="مرتجعات العملاء" value={customer.toLocaleString("ar-SA")} note="كمية عادت للمخزون" icon={RotateCcw} /><MetricCard label="مرتجع للمورد" value={supplier.toLocaleString("ar-SA")} note="كمية خرجت للمورد" icon={Truck} tone="blue" /><MetricCard label="تالف" value={damaged.toLocaleString("ar-SA")} note="غير صالح للبيع" icon={ShieldAlert} tone="amber" /></section>
    <ReturnForm products={products.map((x) => ({ id: x.id, name: x.name, barcode: x.barcode, unit: x.unit, quantity: Number(x.quantity) }))} locations={locations} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>آخر المرتجعات</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>النوع</th><th>الصنف</th><th>الكمية</th><th>الموظف</th><th>الوقت</th><th>السبب</th></tr></thead><tbody>{events.map((e) => <tr key={e.id}><td>{labels[e.action] || e.action}</td><td><strong>{e.itemName || "—"}</strong></td><td>{Number(e.quantity ?? 0).toLocaleString("ar-SA")}</td><td>{e.actorName}</td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(e.occurredAt)}</td><td>{e.note || "—"}</td></tr>)}{!events.length && <tr><td colSpan={6}><div className="infoNote">لا توجد مرتجعات مسجلة بعد.</div></td></tr>}</tbody></table></div></section>
  </>;
}
