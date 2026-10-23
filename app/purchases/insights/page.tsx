import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, BadgePercent, FileCheck2, History, ReceiptText } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { calculatePriceTrends } from "@/lib/purchase-guardian";
import {
  buildMarginAlerts, describePurchaseActions, getIncomingPurchaseQuantities, summarizeSuppliers,
} from "@/lib/operating-intelligence";

export const metadata = { title: "مراقب المشتريات والأسعار" };
export const dynamic = "force-dynamic";

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(value);
}

export default async function PurchaseInsightsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const businessId = context.business.id;
  const [invoices, history, products, pendingOrders] = await Promise.all([
    db.purchaseInvoice.findMany({
      where: { businessId, status: "APPROVED" },
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { approvedAt: "desc" },
      take: 800,
    }),
    db.supplierPriceHistory.findMany({
      where: { businessId },
      include: { supplier: true, product: true },
      orderBy: { recordedAt: "desc" },
      take: 1000,
    }),
    db.product.findMany({
      where: { businessId, active: true, averageCost: { gt: 0 } },
      select: { id: true, name: true, salePrice: true, averageCost: true, quantity: true },
      take: 2500,
    }),
    db.purchaseOrder.findMany({
      where: { businessId, status: { in: ["PENDING_APPROVAL", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } },
      select: {
        supplierId: true, status: true, orderedAt: true, receivedAt: true,
        items: { select: { productId: true, orderedQty: true, receivedQty: true } },
      },
    }),
  ]);

  const entries = invoices.flatMap((invoice) => invoice.items.map((item) => ({
    supplierId: invoice.supplierId,
    supplierName: invoice.supplier.name,
    productId: item.productId,
    productName: item.product.name,
    unit: item.product.unit,
    unitCost: Number(item.unitCost),
    quantity: Number(item.invoicedQty),
    date: invoice.approvedAt ?? invoice.createdAt,
  })));
  const trends = calculatePriceTrends(entries);
  const quoteRecords = history.filter((item) => item.source === "QUOTE");
  const changes = quoteRecords.map((record, index) => {
    const earlier = quoteRecords.slice(index + 1).find((other) =>
      other.supplierId === record.supplierId && other.productId === record.productId,
    );
    if (!earlier) return null;
    const previous = Number(earlier.price);
    const current = Number(record.price);
    return {
      id: record.id, supplier: record.supplier.name, product: record.product.name,
      unit: record.product.unit, previous, current, difference: current - previous,
      date: record.recordedAt,
      minQty: record.minOrderQty == null ? null : Number(record.minOrderQty),
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const priceRises = changes.filter((item) => item.difference > 0);
  const reviewed = invoices.filter((invoice) => invoice.reviewNote).length;
  const positiveRows = trends.rows.filter((row) => row.extraPaid > 0);
  const marginRisks = buildMarginAlerts(products.map((product) => ({
    id: product.id,
    name: product.name,
    salePrice: Number(product.salePrice),
    averageCost: Number(product.averageCost),
    quantity: Number(product.quantity),
  })));
  const incoming = getIncomingPurchaseQuantities(pendingOrders.map((order) => ({
    status: order.status,
    items: order.items.map((item) => ({
      productId: item.productId, orderedQty: Number(item.orderedQty),
      receivedQty: Number(item.receivedQty),
    })),
  })));
  const performance = summarizeSuppliers(pendingOrders.map((order) => ({
    supplierId: order.supplierId, status: order.status,
    orderedAt: order.orderedAt, receivedAt: order.receivedAt,
    items: order.items.map((item) => ({
      orderedQty: Number(item.orderedQty), receivedQty: Number(item.receivedQty),
    })),
  })), new Date());
  const waiting = [...performance.values()].reduce((sum, item) => sum + item.openBeyond7Days, 0);
  const actionItems = describePurchaseActions(incoming.size, marginRisks.length, waiting);
  const isOwner = context.membership.role === "OWNER";

  return (
    <>
      <PageHeader
        eyebrow="المشتريات / مراقب الأسعار"
        title="مراقب المشتريات"
        description="سجل عروض الموردين وتغيّر سعر الشراء، ومراجعة فواتير الاستلام وحساب أثر الزيادات."
        actions={<><Link className="button secondary" href="/purchases"><ArrowRight size={17} /> المشتريات</Link>{isOwner && <Link className="button primary" href="/products/pricing">مراجعة أسعار البيع</Link>}</>}
      />
      <section className="metricsGrid four">
        <MetricCard label="أثر زيادات أسعار الشراء" value={formatSar(trends.cumulativeIncrease)} note="إضافي مقارنة بسعر آخر فاتورة لنفس المورد والصنف" icon={BadgePercent} tone="amber" />
        <MetricCard label="أسطر مشتريات ارتفع سعرها" value={String(trends.increasedInvoiceLines)} note="في الفواتير المشمولة" icon={AlertTriangle} />
        <MetricCard label="ارتفاعات عروض الموردين" value={String(priceRises.length)} note="تغير أسعار عروض مسجلة" icon={History} tone="blue" />
        <MetricCard label="فواتير تم اعتماد فروقاتها" value={String(reviewed)} note="مع سبب مراجعة محفوظ" icon={FileCheck2} tone="violet" />
      </section>
      <section className="panel" style={{ marginTop: 16, marginBottom: 20 }}>
        <div className="panelHeader"><div><span className="eyebrow">من المشكلة إلى الإجراء</span><h2>مركز قرارات المشتريات</h2></div></div>
        <div className="alertList">
          {actionItems.map((item) => (
            <div className="alertRow" key={item.key}>
              <div className="grow"><strong>{item.title}: {item.count}</strong><span>{item.note}</span></div>
              {item.key === "margin" && !isOwner
                ? <span className="mutedText">يحتاج مراجعة المالك</span>
                : <Link href={item.href} className="textLink">مراجعة</Link>}
            </div>
          ))}
        </div>
      </section>
      <section id="margin-risk" className="panel tablePanel" style={{ marginBottom: 20 }}>
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">تكلفة الاستلام ← سعر البيع</span><h2>الأصناف التي انخفض هامشها</h2></div>
          {isOwner && <Link className="textLink" href="/products/pricing">اعتماد تعديل السعر</Link>}
        </div>
        <div className="infoNote">هذا تقدير هامش إجمالي من متوسط التكلفة وسعر البيع، لا يشمل الضريبة أو الخصم أو مصاريف التشغيل. الاقتراح يستهدف هامش 25%، وليس قرار تعديل آلي.</div>
        <div className="tableScroll"><table className="dataTable">
          <thead><tr><th>المنتج</th><th>متوسط التكلفة</th><th>سعر البيع</th><th>الهامش</th><th>سعر مقترح</th><th>الإجراء</th></tr></thead>
          <tbody>
            {marginRisks.slice(0, 50).map((risk) => (
              <tr key={risk.id}>
                <td><strong>{risk.name}</strong></td><td>{formatSar(risk.averageCost)}</td>
                <td>{formatSar(risk.salePrice)}</td><td className="dangerText">{risk.marginPercent.toFixed(1)}%</td>
                <td>{formatSar(risk.suggestedPrice)}</td>
                <td>{isOwner ? <Link href={`/products/pricing#product-${risk.id}`}>راجع السعر</Link> : "المالك فقط"}</td>
              </tr>
            ))}
            {!marginRisks.length && <tr><td colSpan={6}>لا توجد منتجات بهامش أقل من 15% بين الأصناف ذات التكلفة المسجلة.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="panel" style={{ marginTop: 16, marginBottom: 20 }}>
        <p className="policyNote">
          الأرقام مؤشرات تشغيلية وليست خسائر محاسبية مؤكدة أو أسعار سوق. تتم مقارنة كل سعر فاتورة بالسعر السابق لنفس المورد والصنف، وتُجمع الزيادات الإيجابية فقط؛
          ولا نطرح منها التخفيضات. تشمل البيانات بحد أقصى آخر 800 فاتورة معتمدة و1,000 حركة سعر.
          الأسعار قابلة للاختلاف بحسب الوحدة والكمية والضريبة والشحن، وتحتاج مراجعة التاجر.
        </p>
      </section>
      <section className="panel tablePanel" style={{ marginBottom: 20 }}>
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">فاتورة مقابل فاتورة</span><h2>أكبر زيادات تكلفة الشراء المسجلة</h2></div>
        </div>
        <div className="tableScroll"><table className="dataTable">
          <thead><tr><th>المنتج</th><th>المورد</th><th>السعر قبل آخر شراء</th><th>آخر سعر</th><th>زيادات مدفوعة تراكمية</th><th>آخر تاريخ</th></tr></thead>
          <tbody>
            {positiveRows.slice(0, 60).map((row, index) => (
              <tr key={row.supplierName + row.productName + index}>
                <td><strong>{row.productName}</strong> ({row.unit})</td>
                <td>{row.supplierName}</td>
                <td>{formatSar(row.oldPrice)}</td>
                <td>{formatSar(row.latestPrice)}</td>
                <td className="dangerText">{formatSar(row.extraPaid)}</td>
                <td>{dateLabel(row.date)}</td>
              </tr>
            ))}
            {!positiveRows.length && <tr><td colSpan={6}>لا توجد زيادات مثبتة بين فواتير متتابعة حتى الآن.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="panel tablePanel" style={{ marginBottom: 20 }}>
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">سجل غير قابل للاستبدال</span><h2>تاريخ تغيّر عروض الموردين</h2></div>
          <Link className="textLink" href="/suppliers/prices/new">إضافة عرض</Link>
        </div>
        <div className="tableScroll"><table className="dataTable">
          <thead><tr><th>المنتج</th><th>المورد</th><th>السعر السابق</th><th>السعر الجديد</th><th>التغيّر</th><th>آخر تحديث</th></tr></thead>
          <tbody>
            {changes.slice(0, 100).map((row) => (
              <tr key={row.id}>
                <td><strong>{row.product}</strong> ({row.unit})</td>
                <td>{row.supplier}</td>
                <td>{formatSar(row.previous)}</td>
                <td>{formatSar(row.current)}</td>
                <td className={row.difference > 0 ? "dangerText" : "positive"}>
                  {row.difference > 0 ? "+" : ""}{formatSar(row.difference)}
                </td>
                <td>{dateLabel(row.date)}</td>
              </tr>
            ))}
            {!changes.length && <tr><td colSpan={6}>سجّل سعرين مختلفين للصنف نفسه لدى المورد لتظهر المقارنة التاريخية.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow"><ReceiptText size={16} /> سجل المراجعة</span><h2>الفواتير التي تم قبول فروقاتها</h2></div>
          <Link className="textLink" href="/purchases/invoice">مطابقة فاتورة</Link>
        </div>
        <div className="tableScroll"><table className="dataTable">
          <thead><tr><th>الفاتورة</th><th>المورد</th><th>القيمة</th><th>سبب القبول</th><th>التاريخ</th></tr></thead>
          <tbody>
            {invoices.filter((invoice) => invoice.reviewNote).slice(0, 40).map((invoice) => (
              <tr key={invoice.id}>
                <td><strong>{invoice.invoiceNumber || invoice.id.slice(-8)}</strong></td>
                <td>{invoice.supplier.name}</td>
                <td>{formatSar(Number(invoice.invoiceTotal))}</td>
                <td>{invoice.reviewNote}</td>
                <td>{dateLabel(invoice.approvedAt ?? invoice.createdAt)}</td>
              </tr>
            ))}
            {!reviewed && <tr><td colSpan={5}>لا توجد فواتير بها فروقات معتمدة حتى الآن.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
