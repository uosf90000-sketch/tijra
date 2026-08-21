import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Banknote, CircleDollarSign, Plus, ReceiptText, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المحاسبة" };
export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const businessId = context.business.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [sales, expenses, payrollRuns, recentSales, recentExpenses] = await Promise.all([
    db.sale.aggregate({ where: { businessId, soldAt: { gte: monthStart } }, _sum: { total: true, costTotal: true } }),
    db.expense.aggregate({ where: { businessId, expenseDate: { gte: monthStart } }, _sum: { amount: true } }),
    db.payrollRun.findMany({
      where: { businessId, periodStart: { gte: monthStart }, status: { in: ["APPROVED", "PAID"] } },
      include: { items: true },
    }),
    db.sale.findMany({ where: { businessId }, orderBy: { soldAt: "desc" }, take: 8 }),
    db.expense.findMany({ where: { businessId }, orderBy: { expenseDate: "desc" }, take: 8 }),
  ]);

  const salesTotal = Number(sales._sum.total ?? 0);
  const cogs = Number(sales._sum.costTotal ?? 0);
  const grossProfit = salesTotal - cogs;
  const expenseTotal = Number(expenses._sum.amount ?? 0);
  const payrollTotal = payrollRuns.reduce((sum, run) => sum + run.items.reduce((inner, item) => inner + Number(item.netSalary), 0), 0);
  const netProfit = grossProfit - expenseTotal - payrollTotal;
  const outgoing = cogs + expenseTotal + payrollTotal;

  const pnl = [
    { label: "المبيعات", value: salesTotal, positive: true },
    { label: "تكلفة البضاعة المباعة", value: cogs, positive: false },
    { label: "مجمل الربح", value: grossProfit, positive: true, strong: true },
    { label: "المصاريف التشغيلية", value: expenseTotal, positive: false },
    { label: "الرواتب المعتمدة", value: payrollTotal, positive: false },
    { label: "صافي الربح التقديري", value: netProfit, positive: netProfit >= 0, strong: true },
  ];

  const entries = [
    ...recentSales.map((sale) => ({ id: `sale-${sale.id}`, date: sale.soldAt, type: "بيع", description: sale.invoiceNumber || "فاتورة بيع", direction: "in" as const, amount: Number(sale.total) })),
    ...recentExpenses.map((expense) => ({ id: `expense-${expense.id}`, date: expense.expenseDate, type: "مصروف", description: expense.description || expense.category, direction: "out" as const, amount: Number(expense.amount) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 12);

  return (
    <>
      <PageHeader
        eyebrow="الإدارة المالية"
        title="المحاسبة"
        description="ملخص تلقائي من المبيعات وتكلفة البضاعة والمصاريف ومسيرات الرواتب المعتمدة."
        actions={<Link className="button primary" href="/accounting/expenses/new"><Plus size={17} /> تسجيل مصروف</Link>}
      />

      <section className="metricsGrid four">
        <MetricCard label="مبيعات الشهر" value={formatSar(salesTotal)} note="من الفواتير المسجلة" icon={CircleDollarSign} />
        <MetricCard label="مجمل الربح" value={formatSar(grossProfit)} note={salesTotal ? `هامش ${Math.round((grossProfit / salesTotal) * 100)}%` : "لا توجد مبيعات"} icon={Banknote} tone="blue" />
        <MetricCard label="المصاريف" value={formatSar(expenseTotal)} note="بدون تكلفة البضاعة" icon={ReceiptText} tone="amber" />
        <MetricCard label="صافي الربح التقديري" value={formatSar(netProfit)} note="بعد المصروفات والرواتب المعتمدة" icon={WalletCards} tone="violet" />
      </section>

      <section className="accountingGrid">
        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">هذا الشهر</span><h2>قائمة دخل مبسطة</h2></div></div>
          <div className="pnlList">
            {pnl.map((item) => (
              <div className={`pnlRow ${item.strong ? "strong" : ""}`} key={item.label}>
                <span>{item.label}</span>
                <strong className={item.positive ? "positive" : ""}>{item.positive ? "" : "-"}{formatSar(Math.abs(item.value))}</strong>
              </div>
            ))}
          </div>
          <div className="infoNote">هذا ملخص إداري مبسط وليس بديلًا عن الإقرارات أو المعالجة المحاسبية النظامية المتخصصة.</div>
        </article>

        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">الحركة التشغيلية</span><h2>داخل / تكلفة وخارج</h2></div></div>
          <div className="cashflowCards">
            <div className="cashflowCard in"><ArrowDownLeft size={20} /><span>المبيعات</span><strong>{formatSar(salesTotal)}</strong></div>
            <div className="cashflowCard out"><ArrowUpRight size={20} /><span>التكلفة + المصروفات + الرواتب</span><strong>{formatSar(outgoing)}</strong></div>
          </div>
          <div className="balanceHero"><span>النتيجة التشغيلية</span><strong>{netProfit >= 0 ? "+" : "-"}{formatSar(Math.abs(netProfit))}</strong><small>تقديري للفترة الحالية</small></div>
        </article>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">الحركة</span><h2>آخر المبيعات والمصاريف</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>الاتجاه</th><th>المبلغ</th></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(entry.date)}</td>
                  <td><strong>{entry.type}</strong></td>
                  <td>{entry.description}</td>
                  <td><StatusPill status={entry.direction} /></td>
                  <td className={entry.direction === "in" ? "positive" : ""}>{entry.direction === "out" ? "-" : "+"}{formatSar(entry.amount)}</td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={5}><div className="infoNote">لا توجد حركات مسجلة بعد.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
