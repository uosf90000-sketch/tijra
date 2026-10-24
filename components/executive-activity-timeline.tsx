import Link from "next/link";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

type Activity = {
  id: string;
  when: Date;
  title: string;
  detail: string;
  href: string;
};

const labels: Record<string, string> = {
  SALE_PRICE_OVERRIDE: "تغيير سعر أثناء البيع",
  PURCHASE_APPROVED: "اعتماد طلب شراء",
  PURCHASE_REJECTED: "رفض طلب شراء",
  JOURNAL_POSTED: "ترحيل قيد مالي",
  FISCAL_PERIOD_CLOSED: "إقفال فترة مالية",
  CRM_CUSTOMER_CREATED: "إضافة عميل",
  CRM_QUOTE_DRAFT_CREATED: "إنشاء مسودة عرض",
  CRM_RECEIPT_RECORDED: "توثيق تحصيل",
  SOURCING_BID_AWARDED: "ترسية عرض مورد",
  FLOW_SIGNAL_REVIEW_EXECUTED: "مراجعة تنبيهات تشغيل",
  COMPLIANCE_DOCUMENT_RECORDED: "تسجيل مستند",
};

/** Current tenant only, owner authorized by parent / home route. */
export async function ExecutiveActivityTimeline({ businessId }: { businessId: string }) {
  const [sales, purchases, receipts, audit, tasks] = await Promise.all([
    db.sale.findMany({
      where: { businessId }, orderBy: { soldAt: "desc" }, take: 6,
      select: { id: true, invoiceNumber: true, total: true, soldAt: true,
        customer: { select: { name: true } } },
    }),
    db.purchaseOrder.findMany({
      where: { businessId }, orderBy: { createdAt: "desc" }, take: 6,
      select: { id: true, orderNumber: true, status: true, createdAt: true,
        supplier: { select: { name: true } } },
    }),
    db.customerReceipt.findMany({
      where: { businessId }, orderBy: { receivedAt: "desc" }, take: 6,
      select: { id: true, reference: true, amount: true, receivedAt: true,
        customer: { select: { name: true } } },
    }),
    db.inventoryAuditEvent.findMany({
      where: { businessId, action: { in: Object.keys(labels) } },
      orderBy: { occurredAt: "desc" }, take: 8,
      select: { id: true, action: true, occurredAt: true, actorName: true },
    }),
    db.operatingTask.findMany({
      where: { businessId }, orderBy: { createdAt: "desc" }, take: 6,
      select: { id: true, title: true, createdAt: true, status: true },
    }),
  ]);

  const activities: Activity[] = [
    ...sales.map((row) => ({
      id: "sale-" + row.id, when: row.soldAt, title: "فاتورة بيع مسجلة",
      detail: (row.customer?.name || "عميل مباشر") + " · " +
        (row.invoiceNumber || "دون رقم") + " · " + formatSar(Number(row.total)),
      href: "/sales/analytics",
    })),
    ...purchases.map((row) => ({
      id: "purchase-" + row.id, when: row.createdAt, title: "طلب شراء " + row.status,
      detail: row.supplier.name + " · " + (row.orderNumber || row.id.slice(-8)),
      href: "/purchases",
    })),
    ...receipts.map((row) => ({
      id: "receipt-" + row.id, when: row.receivedAt, title: "إثبات تحصيل داخلي",
      detail: row.customer.name + " · " + row.reference + " · " + formatSar(Number(row.amount)),
      href: "/crm/receivables",
    })),
    ...audit.map((row) => ({
      id: "audit-" + row.id, when: row.occurredAt, title: labels[row.action] || "حدث تشغيلي",
      detail: "المسؤول: " + row.actorName, href: "/activity",
    })),
    ...tasks.map((row) => ({
      id: "task-" + row.id, when: row.createdAt, title: row.title,
      detail: row.status === "OPEN" ? "مهمة تنتظر إجراء" : "تم اتخاذ قرار", href: "/flow",
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 14);

  return <section className="panel" style={{ marginBottom: 22 }}>
    <div className="panelHeader">
      <div><span className="eyebrow">نشاطات تِجرا الموحدة</span><h2>آخر ما حدث في منشأتك</h2></div>
      <Link href="/activity" className="button secondary">مركز النشاط والتدقيق</Link>
    </div>
    <div style={{ display: "grid", gap: 9 }}>
      {activities.map((activity) => <Link className="alertRow" key={activity.id} href={activity.href}>
        <div className="grow"><strong>{activity.title}</strong><span>{activity.detail}</span></div>
        <span className="mutedText">{new Intl.DateTimeFormat("ar-SA", {
          dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh",
        }).format(activity.when)}</span>
      </Link>)}
      {!activities.length && <div className="infoNote">لا توجد عمليات محفوظة حتى الآن.</div>}
    </div>
    <p className="policyNote">الجدول يعرض عينة من أحدث الأحداث وليس تصديرًا كاملاً أو تقرير مراجعة قانوني.</p>
  </section>;
}
