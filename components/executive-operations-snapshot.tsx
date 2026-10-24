import Link from "next/link";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

/**
 * Business-wide snapshot for the owner ONLY.
 * This component must never be rendered without owner authorization at the
 * server route. Numbers all come from the currently selected business.
 */
export async function ExecutiveOperationsSnapshot({ businessId }: { businessId: string }) {
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const now = new Date();
  const endNextMonth = new Date(now.getTime() + 30 * 86_400_000);
  const [sales, customerCount, overdueCount, purchaseCount, rfqCount, workflowCount,
    employeeCount, expiryCount, draftJournalCount, supplierCount] = await Promise.all([
    db.sale.aggregate({ where: { businessId, soldAt: { gte: start } },
      _sum: { total: true, costTotal: true }, _count: { _all: true } }),
    db.customer.count({ where: { businessId } }),
    db.receivable.count({ where: {
      businessId, status: { in: ["OPEN", "PARTIALLY_PAID"] }, dueAt: { lt: now },
    } }),
    db.purchaseOrder.count({ where: { businessId, status: "PENDING_APPROVAL" } }),
    db.sourcingRequest.count({ where: { businessId, status: "OPEN" } }),
    db.operatingTask.count({ where: { businessId, status: "OPEN" } }),
    db.employee.count({ where: { businessId, active: true } }),
    db.complianceDocument.count({ where: { businessId, expiresAt: { lte: endNextMonth } } }),
    db.journalEntry.count({ where: { businessId, status: "DRAFT" } }),
    db.supplier.count({ where: { businessId } }),
  ]);
  const revenue = Number(sales._sum.total ?? 0);
  const grossProfit = revenue - Number(sales._sum.costTotal ?? 0);
  const summary = [
    { name: "مبيعات الشهر", value: formatSar(revenue), note: sales._count._all + " فاتورة", href: "/sales/analytics" },
    { name: "مجمل الربح", value: formatSar(grossProfit), note: "قبل المصروفات والرواتب والضرائب", href: "/intelligence" },
    { name: "العملاء", value: String(customerCount), note: overdueCount + " لديهم مستحقات متأخرة", href: "/crm" },
    { name: "الموردون", value: String(supplierCount), note: rfqCount + " طلب عروض مفتوح", href: "/sourcing" },
    { name: "مشتريات تنتظر موافقة", value: String(purchaseCount), note: "غير مُرسلة للمورد", href: "/purchases/approvals" },
    { name: "الموظفون النشطون", value: String(employeeCount), note: "داخل المنشأة المختارة", href: "/employees" },
    { name: "مهام معلقة", value: String(workflowCount), note: "عبر أقسام التشغيل", href: "/flow" },
    { name: "تصاريح قريبة أو منتهية", value: String(expiryCount), note: "حتى 30 يومًا من الآن", href: "/compliance" },
    { name: "قيود مالية بانتظار ترحيل", value: String(draftJournalCount), note: "دفتر القيود اليدوي", href: "/accounting/ledger" },
  ];
  return <section className="panel" style={{ marginBlock: 20 }}>
    <div className="panelHeader">
      <div><span className="eyebrow">تِجرا 360 · لوحة الرئيس</span>
        <h2>جميع أنشطة المنشأة في مكان واحد</h2>
        <p className="policyNote">الأرقام من المنشأة النشطة فقط؛ يمكن الانتقال للملف المسؤول عن كل مؤشر.</p>
      </div>
      <Link className="button secondary" href="/management/workspace">الشركات والفروع</Link>
    </div>
    <div className="metricsGrid four">
      {summary.map((item) => <Link className="panel" key={item.name} href={item.href}
        style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">{item.name}</span>
        <h2>{item.value}</h2>
        <p className="policyNote">{item.note}</p>
      </Link>)}
    </div>
  </section>;
}
