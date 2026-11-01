import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { CommitmentWorkspace } from "@/components/commitment-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "سجل الالتزامات | مدار" };

export default async function CommitmentsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!(await hasBusinessWideRead(context))) redirect("/no-access");
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role)) redirect("/no-access");
  const businessId = context.business.id;
  const [rows, orders, customers, total] = await Promise.all([
    db.businessCommitment.findMany({
      where: { businessId }, include: {
        supplier: { select: { name: true } }, customer: { select: { name: true } },
      }, orderBy: { expectedAt: "asc" }, take: 250,
    }),
    db.purchaseOrder.findMany({
      where: { businessId, status: { notIn: ["RECEIVED","CANCELLED"] } },
      select: { id: true, orderNumber: true, supplier: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 150,
    }),
    db.customer.findMany({ where: { businessId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 150 }),
    db.businessCommitment.count({ where: { businessId } }),
  ]);
  const existing = new Set(rows.filter(x => x.kind === "SUPPLIER_DELIVERY").map(x => x.sourceId));
  return <>
    <PageHeader eyebrow="مدار 360" title="سجل الالتزامات"
      description="وعد المورد بالتوريد، استحقاق العميل، أو مهمة الخدمة — في سجل واحد يميز بين الوعد والإنجاز الفعلي المسجل."
      actions={<><Link className="button secondary" href="/purchases">طلبات الشراء</Link><Link className="button secondary" href="/crm/receivables">المستحقات</Link></>} />
    <CommitmentWorkspace
      entries={rows.map(x => ({
        id: x.id, kind: x.kind, status: x.status, title: x.title,
        expectedAt: x.expectedAt.toISOString(), fulfilledAt: x.fulfilledAt?.toISOString() || null,
        expectedAmount: x.expectedAmount?.toFixed(2) || null,
        evidenceNote: x.evidenceNote, sourceControlled: Boolean(x.sourceId),
        counterparty: x.supplier?.name || x.customer?.name || "—",
      }))}
      orderOptions={orders.filter(x => !existing.has(x.id)).map(x => ({
        id: x.id, label: (x.orderNumber || x.id.slice(-8)) + " — " + x.supplier.name,
      }))}
      customerOptions={customers} totalCount={total}
      currency={context.business.currency}
      canEdit={["OWNER","MANAGER"].includes(context.membership.role)} />
  </>;
}
