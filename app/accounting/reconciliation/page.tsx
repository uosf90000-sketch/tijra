import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Banknote, CircleCheckBig, Landmark, ReceiptText } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SettlementImportForm } from "@/components/settlement-import-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "مطابقة الأموال" };
export const dynamic = "force-dynamic";

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const methodLabel = {
  CARD: "بطاقة",
  TRANSFER: "تحويل",
  OTHER: "أخرى",
  CASH: "نقد",
} as const;

export default async function ReconciliationPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const businessId = context.business.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [sales, settlements] = await Promise.all([
    db.sale.findMany({
      where: {
        businessId,
        soldAt: { gte: monthStart },
        paymentMethod: { in: ["CARD", "TRANSFER", "OTHER"] },
      },
      select: { total: true, paymentMethod: true, soldAt: true },
      orderBy: { soldAt: "desc" },
    }),
    db.paymentSettlement.findMany({
      where: { businessId, salesDate: { gte: monthStart } },
      orderBy: [{ salesDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  type Row = {
    key: string;
    date: string;
    paymentMethod: keyof typeof methodLabel;
    expected: number;
    gross: number;
    fees: number;
    net: number;
    providers: Set<string>;
    references: string[];
  };

  const rows = new Map<string, Row>();
  function ensureRow(date: string, paymentMethod: keyof typeof methodLabel) {
    const key = `${date}|${paymentMethod}`;
    const current = rows.get(key);
    if (current) return current;
    const created: Row = { key, date, paymentMethod, expected: 0, gross: 0, fees: 0, net: 0, providers: new Set(), references: [] };
    rows.set(key, created);
    return created;
  }

  for (const sale of sales) {
    const row = ensureRow(dateKey(sale.soldAt), sale.paymentMethod);
    row.expected += Number(sale.total);
  }

  for (const settlement of settlements) {
    const row = ensureRow(dateKey(settlement.salesDate), settlement.paymentMethod);
    row.gross += Number(settlement.grossAmount);
    row.fees += Number(settlement.fees);
    row.net += Number(settlement.netAmount);
    row.providers.add(settlement.provider);
    if (settlement.reference) row.references.push(settlement.reference);
  }

  const grouped = Array.from(rows.values()).sort((a, b) => b.date.localeCompare(a.date) || a.paymentMethod.localeCompare(b.paymentMethod));
  const expectedTotal = grouped.reduce((sum, row) => sum + row.expected, 0);
  const grossTotal = grouped.reduce((sum, row) => sum + row.gross, 0);
  const feesTotal = grouped.reduce((sum, row) => sum + row.fees, 0);
  const netTotal = grouped.reduce((sum, row) => sum + row.net, 0);
  const shortageTotal = grouped.reduce((sum, row) => sum + Math.max(0, row.expected - row.gross), 0);
  const issueCount = grouped.filter((row) => Math.abs(row.expected - row.gross) > 0.01).length;

  return (
    <>
      <PageHeader
        eyebrow="الإدارة المالية"
        title="مطابقة الأموال"
        description="قارن مبيعات البطاقة والتحويلات مع تسويات مزود الدفع والبنك واكتشف أي مبلغ ناقص."
        actions={<Link className="button secondary" href="/accounting"><ArrowRight size={17} /> الملخص المالي</Link>}
      />

      <section className="metricsGrid four">
        <MetricCard label="المتوقع تسويته" value={formatSar(expectedTotal)} note="من مبيعات البطاقة والتحويل وغيرها" icon={ReceiptText} />
        <MetricCard label="التسويات المسجلة" value={formatSar(grossTotal)} note={issueCount ? `${issueCount} صف يحتاج مراجعة` : "كل الصفوف مطابقة"} icon={Landmark} tone="blue" />
        <MetricCard label="الرسوم" value={formatSar(feesTotal)} note={`الصافي المودع ${formatSar(netTotal)}`} icon={Banknote} tone="amber" />
        <MetricCard label="المبلغ الناقص" value={formatSar(shortageTotal)} note={shortageTotal > 0 ? "يحتاج مراجعة أو تسوية لم تُسجل بعد" : "لا يوجد نقص مسجل"} icon={shortageTotal > 0 ? AlertTriangle : CircleCheckBig} tone="violet" />
      </section>

      <SettlementImportForm />

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">المطابقة اليومية</span><h2>المبيعات مقابل التسويات</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>تاريخ المبيعات</th><th>الطريقة</th><th>المتوقع</th><th>التسوية قبل الرسوم</th><th>الرسوم</th><th>الصافي</th><th>الفرق</th><th>الحالة</th><th>المزود</th></tr></thead>
            <tbody>
              {grouped.map((row) => {
                const difference = row.expected - row.gross;
                const matched = Math.abs(difference) <= 0.01;
                const status = matched ? "مطابق" : row.gross === 0 && row.expected > 0 ? "لم تُسجل تسوية" : difference > 0 ? "ناقص" : "زيادة";
                return (
                  <tr key={row.key}>
                    <td>{row.date}</td>
                    <td><strong>{methodLabel[row.paymentMethod]}</strong></td>
                    <td>{formatSar(row.expected)}</td>
                    <td>{formatSar(row.gross)}</td>
                    <td>{formatSar(row.fees)}</td>
                    <td>{formatSar(row.net)}</td>
                    <td className={matched ? "positive" : ""}>{difference > 0 ? "-" : difference < 0 ? "+" : ""}{formatSar(Math.abs(difference))}</td>
                    <td><strong className={matched ? "positive" : ""}>{status}</strong></td>
                    <td>{Array.from(row.providers).join("، ") || "—"}</td>
                  </tr>
                );
              })}
              {!grouped.length ? <tr><td colSpan={9}><div className="infoNote">لا توجد مبيعات غير نقدية أو تسويات مسجلة هذا الشهر بعد.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
