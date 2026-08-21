import Link from "next/link";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { InvoiceOcrUploader } from "@/components/invoice-ocr-uploader";
import { PageHeader } from "@/components/page-header";
import { formatSar } from "@/lib/format";

export const metadata = { title: "مطابقة فاتورة المورد" };

const matches = [
  { item: "مياه صفا 330 مل", ordered: 40, invoiced: 40, received: 40, unit: "كرتون", expected: 13.2, invoice: 13.2, status: "ok" },
  { item: "بيبسي 330 مل", ordered: 60, invoiced: 60, received: 58, unit: "حبة", expected: 1.78, invoice: 1.78, status: "qty" },
  { item: "حليب كامل الدسم 1 لتر", ordered: 30, invoiced: 30, received: 30, unit: "حبة", expected: 5.62, invoice: 5.9, status: "price" },
];

export default function PurchaseInvoicePage() {
  const variance = matches.reduce((sum, item) => {
    const quantityDifference = (item.invoiced - item.received) * item.invoice;
    const priceDifference = item.received * Math.max(0, item.invoice - item.expected);
    return sum + quantityDifference + priceDifference;
  }, 0);

  return (
    <>
      <PageHeader
        eyebrow="الاستلام"
        title="مطابقة فاتورة المورد"
        description="ارفع صورة الفاتورة، ثم قارن ما طلبته وما فُوتر وما استلمته قبل تحديث المخزون."
        actions={<Link className="button secondary" href="/purchases"><ArrowRight size={17} /> رجوع للمشتريات</Link>}
      />

      <section className="invoiceMatchGrid">
        <InvoiceOcrUploader />

        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow">مثال المطابقة بعد القراءة</span><h2>وجدنا اختلافين</h2></div>
            <span className="varianceBadge">{formatSar(variance)}</span>
          </div>
          <div className="matchSummary">
            <div className="matchOk"><CheckCircle2 size={18} /><span>1 مطابق تمامًا</span></div>
            <div className="matchWarn"><TriangleAlert size={18} /><span>2 تحتاج مراجعة</span></div>
          </div>
          <p className="policyNote">لا يتم تحديث المخزون إلا بعد اعتماد الكميات المستلمة فعليًا.</p>
        </article>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">PO-1042 · مثال توضيحي</span><h2>مقارنة سطر بسطر</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead>
              <tr><th>الصنف</th><th>المطلوب</th><th>في الفاتورة</th><th>المستلم</th><th>السعر المتفق</th><th>سعر الفاتورة</th><th>الملاحظة</th></tr>
            </thead>
            <tbody>
              {matches.map((item) => (
                <tr key={item.item}>
                  <td><strong>{item.item}</strong></td>
                  <td>{item.ordered} {item.unit}</td>
                  <td>{item.invoiced}</td>
                  <td className={item.status === "qty" ? "dangerText" : ""}>{item.received}</td>
                  <td>{formatSar(item.expected)}</td>
                  <td className={item.status === "price" ? "dangerText" : ""}>{formatSar(item.invoice)}</td>
                  <td>
                    {item.status === "ok" ? <span className="savingText">مطابق</span> : null}
                    {item.status === "qty" ? <span className="dangerText">ناقص 2 من المستلم</span> : null}
                    {item.status === "price" ? <span className="dangerText">السعر أعلى بـ {formatSar(item.invoice - item.expected)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="orderSummaryBar">
          <span>بعد الاعتماد: تُضاف الكميات المستلمة فقط ويُحدّث متوسط التكلفة.</span>
          <button className="button primary"><CheckCircle2 size={17} /> اعتماد الاستلام</button>
        </div>
      </section>
    </>
  );
}
