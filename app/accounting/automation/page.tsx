import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SaleAccountingAutomation } from "@/components/sale-accounting-automation";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";

export const metadata = { title: "ربط البيع بدفتر الحسابات | تِجرا" };
export const dynamic = "force-dynamic";

export default async function SaleAccountingAutomationPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!(await hasBusinessWideRead(context))) redirect("/no-access");
  if (!["OWNER", "ACCOUNTANT"].includes(context.membership.role)) redirect("/no-access");
  const businessId = context.business.id;
  const [accounts, mapping, events] = await Promise.all([
    db.financialAccount.findMany({ where: { businessId, active: true },
      select: { id: true, name: true, code: true, kind: true }, orderBy: { code: "asc" } }),
    db.salesAccountingMap.findUnique({ where: { businessId } }),
    db.accountingSourceEvent.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 150 }),
  ]);
  const selected = mapping ? {
    cashAccountId: mapping.cashAccountId, cardAccountId: mapping.cardAccountId,
    transferAccountId: mapping.transferAccountId, otherAccountId: mapping.otherAccountId,
    revenueAccountId: mapping.revenueAccountId, cogsAccountId: mapping.cogsAccountId,
    inventoryAccountId: mapping.inventoryAccountId, enabled: mapping.enabled,
  } : null;
  return <>
    <PageHeader eyebrow="التكامل المحاسبي التدريجي" title="ربط الكاشير بقيود محاسبية قابلة للمراجعة"
      description="معاملة البيع تحفظ مصدرها المحاسبي، وتُنشأ مسودة متوازنة دون ترحيل نهائي أو ادعاء التحقق من البنك."
      actions={<Link className="button secondary" href="/accounting/ledger">دفتر القيود</Link>} />
    <SaleAccountingAutomation owner={context.membership.role === "OWNER"}
      vatRegistered={Boolean(context.business.taxNumber)}
      accounts={accounts} initial={selected}
      events={events.map((event) => ({
        id: event.id, sourceId: event.sourceId, draftEntryId: event.draftEntryId,
        status: event.status, errorCode: event.errorCode, createdAt: event.createdAt.toISOString(),
      }))}/>
  </>;
}
