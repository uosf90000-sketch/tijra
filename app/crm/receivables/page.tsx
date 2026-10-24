import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceivablesWorkspace } from "@/components/receivables-workspace";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { halalasToDecimal, outstandingHalalas } from "@/lib/tijra-360";

export const metadata = { title: "المستحقات والتحصيل | تِجرا" };
export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    redirect("/no-access");
  const [customers, quotes, rows] = await Promise.all([
    db.customer.findMany({
      where: { businessId: context.business.id },
      select: { id: true, name: true, paymentTermsDays: true },
      orderBy: { name: "asc" }, take: 300,
    }),
    db.salesQuote.findMany({
      where: { businessId: context.business.id, status: "ACCEPTED" },
      select: { id: true, quoteNumber: true, customerId: true, total: true },
      orderBy: { createdAt: "desc" }, take: 200,
    }),
    db.receivable.findMany({
      where: { businessId: context.business.id },
      include: { customer: { select: { name: true } },
        receipts: { select: { amount: true } } },
      orderBy: { dueAt: "asc" }, take: 300,
    }),
  ]);
  return <>
    <PageHeader eyebrow="تِجرا 360" title="المستحقات والتحصيل"
      description="حدود ائتمانية، مواعيد استحقاق، رصيد متبقٍ، وإثباتات تحصيل بقرارات مسجلة."
      actions={<Link href="/crm" className="button secondary">العودة للعملاء</Link>} />
    <ReceivablesWorkspace
      customers={customers}
      quotes={quotes.map((q) => ({ ...q, total: q.total.toFixed(2) }))}
      receivables={rows.map((r) => ({
        id: r.id, invoiceRef: r.invoiceRef, amount: r.amount.toFixed(2),
        outstanding: halalasToDecimal(outstandingHalalas(r.amount.toFixed(2),
          r.receipts.map((receipt) => receipt.amount.toFixed(2)))),
        dueAt: r.dueAt.toISOString(), customer: r.customer, status: r.status,
      }))}
      canEdit={["OWNER","ACCOUNTANT"].includes(context.membership.role)}
    />
  </>;
}
