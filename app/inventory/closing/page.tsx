import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DayClosingForm } from "@/components/day-closing-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "إقفال نهاية اليوم" };
export const dynamic = "force-dynamic";

export default async function InventoryClosingPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const [products, closes] = await Promise.all([
    db.product.findMany({
      where: { businessId: context.business.id, active: true },
      select: { id: true, name: true, unit: true, quantity: true },
      orderBy: { name: "asc" },
    }),
    db.inventoryAuditEvent.findMany({
      where: { businessId: context.business.id, action: "DAY_CLOSE" },
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="نهاية الوردية"
        title="إقفال وجرد نهاية اليوم"
        description="تِجرا يعرض الكمية النظرية بعد المبيعات والهدر. أدخل الموجود فعليًا ليظهر الفرق وتتم مزامنة المخزون."
      />
      <DayClosingForm products={products.map((item) => ({ id: item.id, name: item.name, unit: item.unit, theoretical: Number(item.quantity) }))} />

      <section className="panel tablePanel recipeTablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>آخر الإقفالات</h2></div></div>
        <div className="tableScroll"><table className="dataTable"><thead><tr><th>التاريخ</th><th>الموظف</th><th>الأصناف المعدودة</th><th>أصناف بفروقات</th><th>مجموع الفرق</th><th>ملاحظة</th></tr></thead><tbody>
          {closes.map((close) => <tr key={close.id}><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(close.occurredAt)}</td><td>{close.actorName}</td><td>{Number(close.previousQuantity ?? 0).toLocaleString("ar-SA")}</td><td>{Number(close.newQuantity ?? 0).toLocaleString("ar-SA")}</td><td>{Number(close.quantity ?? 0).toLocaleString("ar-SA")}</td><td>{close.note || "—"}</td></tr>)}
          {!closes.length && <tr><td colSpan={6}><div className="infoNote">لم يتم إقفال يوم بعد.</div></td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
