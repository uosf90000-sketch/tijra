import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PurchaseApprovalButtons } from "@/components/purchase-approval-buttons";
import { hasAppPermission, firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { canDecidePurchaseApproval } from "@/lib/purchase-approval";

export const metadata = { title: "موافقات المشتريات" };
export const dynamic = "force-dynamic";

export default async function PurchaseApprovalsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!hasAppPermission(context.membership, "PURCHASES")) redirect(firstPermissionHref(context.membership));

  const [waiting, recent] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { businessId: context.business.id, status: "PENDING_APPROVAL" },
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { createdAt: "asc" }, take: 100,
    }),
    db.purchaseOrderApproval.findMany({
      where: { businessId: context.business.id },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { decidedAt: "desc" }, take: 30,
    }),
  ]);
  const eligible = waiting.filter((order) => canDecidePurchaseApproval({
    requesterId: order.requestedByUserId,
    reviewerId: context.user.id,
    reviewerRole: context.membership.role,
    status: order.status,
  }));

  return <>
    <PageHeader eyebrow="الشراء والرقابة" title="موافقات المشتريات"
      description="مراجعة الطلبات التي تتجاوز سقف الموافقة قبل إرسالها للمورد، مع فصل منشئ الطلب عن المعتمد."
      actions={<Link className="button secondary" href="/purchases">العودة للمشتريات</Link>} />
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">طلبات بانتظار القرار</span><h2>{waiting.length}</h2></article>
      <article className="panel"><span className="eyebrow">يمكنك اعتمادها</span><h2>{eligible.length}</h2></article>
      <article className="panel"><span className="eyebrow">قيمة الطلبات المنتظرة</span><h2>{formatSar(waiting.reduce((sum, row) => sum + Number(row.expectedTotal), 0))}</h2></article>
    </section>
    <div className="infoNote">الطلب غير المعتمد لا يمكن إرساله للمورد أو استلامه. يبقى محتسبًا ضمن التخطيط حتى لا يتكرر اقتراح الشراء. يجب أن يكون المعتمد مديرًا أو مالكًا مختلفًا عن المنشئ.</div>
    <section style={{ display: "grid", gap: 14, marginTop: 18 }}>
      {waiting.map((order) => (
        <article className="panel" key={order.id}>
          <div className="panelHeader"><div><span className="eyebrow">{order.orderNumber || order.id.slice(-8)}</span>
            <h2>{order.supplier.name} — {formatSar(Number(order.expectedTotal))}</h2>
            </div></div>
          <p className="policyNote">تاريخ الطلب: {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(order.createdAt)} · {order.items.length} أصناف</p>
          <div className="tableScroll"><table className="dataTable">
            <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
            <tbody>{order.items.map((item) => <tr key={item.id}><td>{item.product.name}</td>
              <td>{Number(item.orderedQty)} {item.product.unit}</td><td>{formatSar(Number(item.unitCost))}</td>
              <td>{formatSar(Number(item.orderedQty) * Number(item.unitCost))}</td></tr>)}</tbody>
          </table></div>
          <PurchaseApprovalButtons orderId={order.id} canApprove={canDecidePurchaseApproval({
            requesterId: order.requestedByUserId,
            reviewerId: context.user.id,
            reviewerRole: context.membership.role,
            status: order.status,
          })} />
        </article>
      ))}
      {!waiting.length && <article className="panel"><div className="infoNote">لا توجد طلبات بانتظار موافقة.</div></article>}
    </section>
    <section className="panel tablePanel" style={{ marginTop: 20 }}>
      <div className="panelHeader"><div><span className="eyebrow">سجل القرارات</span><h2>أحدث الموافقات والرفض</h2></div></div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>الطلب</th><th>المورد</th><th>القرار</th><th>المدير</th><th>السبب</th><th>التاريخ</th></tr></thead>
        <tbody>{recent.map((item) => <tr key={item.id}>
          <td>{item.purchaseOrder.orderNumber || item.purchaseOrderId.slice(-8)}</td>
          <td>{item.purchaseOrder.supplier.name}</td>
          <td>{item.decision === "APPROVE" ? "موافقة" : "رفض"}</td>
          <td>{item.actorName}</td><td>{item.reason || "—"}</td>
          <td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(item.decidedAt)}</td>
        </tr>)}
        {!recent.length && <tr><td colSpan={6}>لا يوجد سجل قرارات حتى الآن.</td></tr>}
        </tbody>
      </table></div>
    </section>
  </>;
}
