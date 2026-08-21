import { ArrowDownLeft, ArrowUpRight, Banknote, CircleDollarSign, Plus, ReceiptText, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { accountingEntries } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المحاسبة" };

const pnl = [
  { label: "المبيعات", value: 124680, positive: true },
  { label: "تكلفة البضاعة المباعة", value: 87120, positive: false },
  { label: "مجمل الربح", value: 37560, positive: true, strong: true },
  { label: "المصاريف التشغيلية", value: 12940, positive: false },
  { label: "الرواتب", value: 17955, positive: false },
  { label: "صافي الربح التقديري", value: 6665, positive: true, strong: true },
];

export default function AccountingPage() {
  return (
    <>
      <PageHeader
        eyebrow="الإدارة المالية"
        title="المحاسبة"
        description="ملخص مفهوم لصاحب المنشأة: كم بعت، كم كلفتك البضاعة، كم صرفت، وكم بقي ربحًا."
        actions={<button className="button primary"><Plus size={17} /> تسجيل مصروف</button>}
      />

      <section className="metricsGrid four">
        <MetricCard label="مبيعات الشهر" value="124,680 ر.س" note="+6.2% عن الشهر الماضي" trend="up" icon={CircleDollarSign} />
        <MetricCard label="مجمل الربح" value="37,560 ر.س" note="هامش 30.1%" icon={Banknote} tone="blue" />
        <MetricCard label="المصاريف" value="12,940 ر.س" note="بدون تكلفة البضاعة" trend="down" icon={ReceiptText} tone="amber" />
        <MetricCard label="صافي الربح التقديري" value="6,665 ر.س" note="بعد الرواتب والمصاريف" icon={WalletCards} tone="violet" />
      </section>

      <section className="accountingGrid">
        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow">هذا الشهر</span><h2>قائمة دخل مبسطة</h2></div>
          </div>
          <div className="pnlList">
            {pnl.map((item) => (
              <div className={`pnlRow ${item.strong ? "strong" : ""}`} key={item.label}>
                <span>{item.label}</span>
                <strong className={item.positive ? "positive" : ""}>
                  {item.positive ? "" : "-"}{formatSar(item.value)}
                </strong>
              </div>
            ))}
          </div>
          <div className="infoNote">الأرقام هنا نموذج MVP. عند ربط المبيعات والمشتريات الفعلية تُحدّث تلقائيًا من القيود التشغيلية.</div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow">التدفق النقدي</span><h2>داخل / خارج</h2></div>
          </div>
          <div className="cashflowCards">
            <div className="cashflowCard in">
              <ArrowDownLeft size={20} />
              <span>إجمالي الداخل</span>
              <strong>129,140 ر.س</strong>
            </div>
            <div className="cashflowCard out">
              <ArrowUpRight size={20} />
              <span>إجمالي الخارج</span>
              <strong>122,475 ر.س</strong>
            </div>
          </div>
          <div className="balanceHero">
            <span>صافي الحركة</span>
            <strong>+6,665 ر.س</strong>
            <small>تقديري للفترة الحالية</small>
          </div>
        </article>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">الحركة</span><h2>آخر القيود التشغيلية</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>الاتجاه</th><th>المبلغ</th></tr></thead>
            <tbody>
              {accountingEntries.map((entry, index) => (
                <tr key={`${entry.date}-${index}`}>
                  <td>{entry.date}</td>
                  <td><strong>{entry.type}</strong></td>
                  <td>{entry.description}</td>
                  <td><StatusPill status={entry.direction} /></td>
                  <td className={entry.direction === "in" ? "positive" : ""}>
                    {entry.direction === "out" ? "-" : "+"}{formatSar(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
