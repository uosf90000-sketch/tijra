import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { currentBusinessSignals } from "@/lib/business-signals";
import { buildMarginAlerts } from "@/lib/operating-intelligence";
import { halalasToDecimal, outstandingHalalas } from "@/lib/tijra-360";

export const metadata = { title: "نبض الأعمال | تِجرا 360" };
export const dynamic = "force-dynamic";

const money = (n: number | string) => new Intl.NumberFormat("ar-SA", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(n)) + " ر.س";

export default async function IntelligencePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!(await hasBusinessWideRead(context))) redirect("/no-access");
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    redirect("/no-access");
  const businessId = context.business.id;
  const now = new Date(), since = new Date(now.getTime() - 30 * 86_400_000);
  const [sales, products, receivables, rfqs, openTasks, pending, signals] = await Promise.all([
    db.sale.aggregate({
      where: { businessId, soldAt: { gte: since, lte: now } },
      _sum: { total: true, costTotal: true }, _count: { _all: true },
    }),
    db.product.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, salePrice: true, averageCost: true, quantity: true },
      take: 1000,
    }),
    db.receivable.findMany({
      where: { businessId, status: { in: ["OPEN", "PARTIALLY_PAID"] },
        dueAt: { lt: now } },
      select: { amount: true, receipts: { select: { amount: true } } }, take: 1000,
    }),
    db.sourcingRequest.count({ where: { businessId, status: "OPEN" } }),
    db.operatingTask.count({ where: { businessId, status: "OPEN" } }),
    db.purchaseOrder.count({ where: { businessId, status: "PENDING_APPROVAL" } }),
    currentBusinessSignals(businessId, now),
  ]);
  const revenue = Number(sales._sum.total || 0);
  const recordedCost = Number(sales._sum.costTotal || 0);
  const grossProfit = revenue - recordedCost;
  const overdueCents = receivables.reduce((sum, r) => sum + outstandingHalalas(
    r.amount.toFixed(2), r.receipts.map((receipt) => receipt.amount.toFixed(2))), 0n);
  const marginAlerts = buildMarginAlerts(products.map((p) => ({
    id: p.id, name: p.name, salePrice: Number(p.salePrice),
    averageCost: Number(p.averageCost), quantity: Number(p.quantity),
  })));
  const indicators = [
    { label: "مبيعات آخر 30 يومًا", value: money(revenue), hint: "إجمالي فواتير الكاشير المسجلة" },
    { label: "الربح الإجمالي المسجل", value: money(grossProfit), hint: "المبيعات ناقص التكلفة المسجلة، قبل المصروفات والضرائب" },
    { label: "مستحقات متأخرة", value: money(halalasToDecimal(overdueCents)), hint: "أرصدة الذمم المفتوحة المتجاوزة لتاريخ الاستحقاق" },
    { label: "أصناف بهامش ربح منخفض", value: String(marginAlerts.length), hint: "من الأصناف ذات تكلفة شراء معروفة ضمن أول 1000 صنف" },
    { label: "مشتريات تنتظر الاعتماد", value: String(pending), hint: "لا تُرسل تلقائيًا قبل الموافقة" },
    { label: "طلبات عروض أسعار مفتوحة", value: String(rfqs), hint: "منافسة داخلية بين الموردين" },
    { label: "مهام تشغيل مفتوحة", value: String(openTasks), hint: "مهام أنشئت من قواعد Flow المفعلة" },
    { label: "عدد فواتير البيع", value: String(sales._count._all), hint: "خلال آخر 30 يومًا" },
  ];
  return <>
    <PageHeader eyebrow="نبض المنشأة — تِجرا 360" title="مركز القرار المالي والتشغيلي"
      description="بيانات مشتركة من الكاشير والمخزون والمشتريات والعملاء؛ أرقام فعلية لا تقديرات ذكاء اصطناعي غير موثقة."
      actions={<Link className="button secondary" href="/flow">تنبيهات تِجرا Flow</Link>} />
    <section className="metricsGrid four">
      {indicators.map((item) => <article key={item.label} className="panel">
        <span className="eyebrow">{item.label}</span>
        <h2>{item.value}</h2>
        <p className="policyNote">{item.hint}</p>
      </article>)}
    </section>
    <section className="panel" style={{ marginTop: 20 }}>
      <div className="panelHeader"><div>
        <span className="eyebrow">ماذا يحتاج قرارًا اليوم؟</span>
        <h2>إشارات التشغيل المتصلة</h2>
      </div></div>
      <div className="infoNote">
        لا ينفذ النظام أي دفع أو شراء من هذا التقرير.
        الإشارات تفحص حدًا أقصى يبلغ 1000 سجل من كل مصدر؛ قد تتطلب الشركات الكبيرة تقريرًا كاملًا مجزأً قبل اتخاذ قرارات جوهرية.
      </div>
      {signals.slice(0, 30).map((signal) => <div className="alertRow" key={signal.type + signal.sourceId}>
        <div className="grow"><strong>{signal.title}</strong><span>{signal.description}</span></div>
        <Link href={signal.href} className="textLink">التفاصيل</Link>
      </div>)}
      {!signals.length && <p className="policyNote">لم يُكشف تنبيه ضمن البيانات المفحوصة.</p>}
    </section>
  </>;
}
