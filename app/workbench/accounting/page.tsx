import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEnterFinanceWorkbench } from "@/lib/role-workspaces";
import { formatSar } from "@/lib/format";
import { loadVisibleRoleWidgets } from "@/lib/role-dashboard-config";

export const metadata = { title: "مساحة المحاسب | تِجرا" };
export const dynamic = "force-dynamic";

const financialLinks = [
  { href: "/accounting", name: "تقرير الإيرادات والتكاليف", desc: "الأرقام المالية المسجلة" },
  { href: "/accounting/ledger", name: "دفتر القيود والفترات", desc: "مسودات القيود والإقفال" },
  { href: "/accounting/reconciliation", name: "مطابقة المدفوعات", desc: "بطاقات وتحويلات وتسويات" },
  { href: "/crm/receivables", name: "الذمم والتحصيل", desc: "الديون ومتابعة التحصيل" },
];

export default async function AccountingWorkbenchPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!canEnterFinanceWorkbench(context.membership)) redirect("/no-access");
  const businessId = context.business.id;
  const visible = await loadVisibleRoleWidgets(businessId, context.membership);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const now = new Date();

  const [sale, expenses, unsettled, invoices, journals, receivables, recentReceipts] = await Promise.all([
    db.sale.aggregate({
      where: { businessId, soldAt: { gte: monthStart } }, _sum: { total: true, costTotal: true },
    }),
    db.expense.aggregate({
      where: { businessId, expenseDate: { gte: monthStart } }, _sum: { amount: true },
    }),
    db.paymentSettlement.aggregate({
      where: { businessId, salesDate: { gte: monthStart } }, _sum: { grossAmount: true, netAmount: true },
    }),
    db.purchaseInvoice.count({ where: { businessId, status: "REVIEW" } }),
    db.journalEntry.count({ where: { businessId, status: "DRAFT" } }),
    db.receivable.count({
      where: { businessId, status: { in: ["OPEN","PARTIALLY_PAID"] }, dueAt: { lt: now } },
    }),
    db.customerReceipt.findMany({
      where: { businessId }, orderBy: { receivedAt: "desc" }, take: 5,
      include: { customer: { select: { name: true } }, receivable: { select: { invoiceRef: true } } },
    }),
  ]);

  const revenue = Number(sale._sum.total ?? 0);
  const costOfGoods = Number(sale._sum.costTotal ?? 0);
  const operationExpenses = Number(expenses._sum.amount ?? 0);
  const settlementGross = Number(unsettled._sum.grossAmount ?? 0);
  const cards = [
    { label: "إيرادات الشهر المسجلة", value: formatSar(revenue), note: "فواتير البيع في الشهر الجاري" },
    { label: "مجمل الربح", value: formatSar(revenue - costOfGoods), note: "قبل المصروفات والرواتب والضرائب" },
    { label: "مصروفات الشهر", value: formatSar(operationExpenses), note: "المصروفات التشغيلية المدخلة" },
    { label: "مبالغ التسويات المسجلة", value: formatSar(settlementGross), note: "مستندات تسوية، ليست رصيدًا بنكيًا مؤكدًا" },
    { label: "فواتير موردين للمراجعة", value: String(invoices), note: "بانتظار فحص الفاتورة" },
    { label: "قيود تنتظر الترحيل", value: String(journals), note: "دفتر القيود اليدوي المستقل" },
    { label: "مستحقات عملاء متأخرة", value: String(receivables), note: "تحصيلات أو فواتير مفتوحة" },
  ];
  const visibleFinancialLinks = context.membership.role === "OWNER" || context.membership.role === "ACCOUNTANT"
    ? financialLinks : financialLinks.filter((link) => link.href !== "/accounting/ledger");
  const cardCategory = (name: string) =>
    name.includes("مستحقات") ? "RECEIVABLES" :
    name.includes("قيود") ? "JOURNALS" : "FINANCE";
  return <>
    <PageHeader eyebrow="المحاسبة والمالية" title={"مكتب المحاسب · " + context.business.name}
      description="إيرادات ومصروفات وتحويلات ومستحقات المنشأة، مع مهام مالية واضحة دون تشتيت الموظف ببقية الأقسام." />
    <section className="metricsGrid four">
      {cards.filter((c) => visible.has(cardCategory(c.label))).map((c) => <article className="panel" key={c.label}>
        <span className="eyebrow">{c.label}</span><h2>{c.value}</h2>
        <p className="policyNote">{c.note}</p>
      </article>)}
    </section>
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panelHeader"><div><span className="eyebrow">الأعمال اليومية</span><h2>شاشات المحاسب</h2></div></div>
      <div className="ownerHubGrid">
        {visibleFinancialLinks.filter((link) => visible.has(link.href.includes("receivables") ? "RECEIVABLES" : link.href.includes("ledger") ? "JOURNALS" : "FINANCE")).map((link) => <Link key={link.href} href={link.href} className="ownerHubCard">
          <div><strong>{link.name}</strong><span>{link.desc}</span></div>
        </Link>)}
      </div>
    </section>
    {visible.has("RECEIVABLES") &&     <section className="panel tablePanel" style={{ marginTop: 18 }}>
      <div className="panelHeader"><div><span className="eyebrow">مراجعة المستندات</span><h2>آخر التحصيلات المدخلة</h2></div></div>
      <div className="infoNote">التحصيل المدخل يدويًا ليس إثباتًا للتحقق من البنك. طابقه مع التسويات قبل إقفاله محاسبيًا.</div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>العميل</th><th>المرجع</th><th>المبلغ</th><th>التاريخ</th></tr></thead>
        <tbody>{recentReceipts.map((row) => <tr key={row.id}>
          <td>{row.customer.name}</td><td>{row.receivable.invoiceRef}</td>
          <td>{formatSar(Number(row.amount))}</td><td>{row.receivedAt.toISOString().slice(0, 10)}</td>
        </tr>)}
        {!recentReceipts.length && <tr><td colSpan={4}>لا توجد إثباتات تحصيل مسجلة.</td></tr>}
        </tbody>
      </table></div>
    </section>}
  </>;
}
