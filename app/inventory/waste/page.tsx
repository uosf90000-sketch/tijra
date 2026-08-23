import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { WasteForm } from "@/components/waste-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "الهدر" };
export const dynamic = "force-dynamic";

export default async function WastePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const [products, events] = await Promise.all([
    db.product.findMany({
      where: { businessId: context.business.id, active: true },
      select: { id: true, name: true, unit: true, quantity: true },
      orderBy: { name: "asc" },
    }),
    db.inventoryAuditEvent.findMany({
      where: { businessId: context.business.id, action: "WASTE" },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <>
      <PageHeader eyebrow="المخزون الفعلي" title="الهدر والتالف" description="أي فاقد من تحضير أو طبخ أو انسكاب يُسجل هنا حتى لا يظهر آخر اليوم كفرق غير مبرر." />
      <WasteForm products={products.map((item) => ({ ...item, quantity: Number(item.quantity) }))} />
      <section className="panel tablePanel recipeTablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">آخر الحركات</span><h2>سجل الهدر</h2></div></div>
        <div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>الكمية</th><th>السبب</th><th>الموظف</th><th>الوقت</th></tr></thead><tbody>
          {events.map((event) => <tr key={event.id}><td><strong>{event.itemName || "—"}</strong></td><td>{Number(event.quantity ?? 0).toLocaleString("ar-SA")}</td><td>{event.note || "—"}</td><td>{event.actorName}</td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}</td></tr>)}
          {!events.length && <tr><td colSpan={5}><div className="infoNote">لا يوجد هدر مسجل حتى الآن.</div></td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
