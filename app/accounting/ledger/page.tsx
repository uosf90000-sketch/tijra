import Link from "next/link";
import { redirect } from "next/navigation";
import { LedgerWorkspace } from "@/components/ledger-workspace";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "دفتر القيود المحاسبية" };

export default async function LedgerPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["OWNER", "ACCOUNTANT"].includes(context.membership.role)) redirect("/");

  const [accounts, periods, entries] = await Promise.all([
    db.financialAccount.findMany({
      where: { businessId: context.business.id, active: true },
      orderBy: { code: "asc" }, take: 2000,
    }),
    db.fiscalPeriod.findMany({
      where: { businessId: context.business.id },
      orderBy: { periodStart: "desc" }, take: 100,
    }),
    db.journalEntry.findMany({
      where: { businessId: context.business.id },
      include: { period: { select: { title: true, status: true } },
        lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);
  return <>
    <PageHeader eyebrow="الحوكمة المالية" title="دفتر القيود المحاسبية"
      description="قيود محاسبية مزدوجة تُرحّل بعد المراجعة داخل فترات مالية محددة، مع الفصل بين المنشئ والمعتمد عند تفعيل السياسة."
      actions={<Link className="button secondary" href="/accounting">الملخص المالي</Link>} />
    <div className="infoNote" style={{ marginBottom: 16 }}>
      هذا دفتر قيود يدوي مستقل قيد التطوير؛ لا يتم بعد إنشاء القيود تلقائيًا من المبيعات أو الرواتب أو فواتير الموردين، ولا يُعد القيد إثباتًا لتحويل بنكي أو فحصًا للامتثال الضريبي.
    </div>
    <LedgerWorkspace
      accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, kind: a.kind }))}
      periods={periods.map((p) => ({
        id: p.id, title: p.title, status: p.status,
        periodStart: p.periodStart.toISOString(), periodEnd: p.periodEnd.toISOString(),
      }))}
      journals={entries.map((entry) => ({
        id: entry.id, description: entry.description, reference: entry.reference,
        status: entry.status, createdByUserId: entry.createdByUserId,
        entryDate: entry.entryDate.toISOString(), period: entry.period,
        lines: entry.lines.map((line) => ({
          id: line.id, side: line.side, amount: line.amount.toFixed(2), account: line.account,
        })),
      }))}
      actorId={context.user.id}
      dualApproval={context.business.journalDualApprovalEnabled}
      isOwner={context.membership.role === "OWNER"}
    />
  </>;
}
