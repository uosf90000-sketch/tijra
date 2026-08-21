import Link from "next/link";
import { Camera, Check, CirclePlus, FileSearch, Send, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { purchaseOrders, purchaseSuggestions } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المشتريات" };

export default function PurchasesPage() {
  const suggestionTotal = purchaseSuggestions.reduce((sum, item) => sum + item.suggested * item.unitPrice, 0);
  const saving = purchaseSuggestions.reduce((sum, item) => sum + item.saving, 0);

  return (
    <>
      <PageHeader
        eyebrow="المشتريات الذكية"
        title="المشتريات"
        description="تِجرا يقترح الكمية المطلوبة ويختار أفضل سعر مسجل، وأنت تعتمد الطلب وترسله لموردك."
        actions={
          <>
            <Link className="button secondary" href="/purchases/invoice"><Camera size={17} /> مطابقة فاتورة</Link>
            <button className="button primary"><CirclePlus size={17} /> طلب شراء جديد</button>
          </>
        }
      />

      <section className="metricsGrid three">
        <MetricCard label="الطلبية المقترحة" value={formatSar(suggestionTotal)} note={`${purchaseSuggestions.length} أصناف`} icon={Sparkles} />
        <MetricCard label="التوفير المتوقع" value={formatSar(saving)} note="مقابل آخر أسعار شراء" icon={Check} tone="blue" />
        <MetricCard label="طلبات قيد التنفيذ" value={`${purchaseOrders.filter((item) => !["received"].includes(item.status)).length}`} note="بدون إدارة التوصيل" icon={Send} tone="amber" />
      </section>

      <section className="panel smartOrderPanel">
        <div className="panelHeader">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> خطة اليوم</span>
            <h2>ماذا نطلب الآن؟</h2>
          </div>
          <span className="aiBadge">AI suggestion</span>
        </div>

        <div className="smartOrderList">
          {purchaseSuggestions.map((item) => (
            <div className="smartOrderRow" key={item.product}>
              <label className="checkControl">
                <input defaultChecked type="checkbox" aria-label={`تحديد ${item.product}`} />
                <span />
              </label>
              <div className="grow">
                <strong>{item.product}</strong>
                <span>الموجود {item.current} · الطلب المتوقع {item.demand} · {item.supplier}</span>
              </div>
              <div className="qtyBadge">{item.suggested} {item.unit}</div>
              <div className="priceStack">
                <strong>{formatSar(item.suggested * item.unitPrice)}</strong>
                <span>توفير {formatSar(item.saving)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="orderSummaryBar">
          <div>
            <span>الإجمالي التقديري</span>
            <strong>{formatSar(suggestionTotal)}</strong>
          </div>
          <div className="orderSummaryActions">
            <button className="button secondary"><FileSearch size={17} /> مراجعة التقسيم</button>
            <button className="button primary"><Send size={17} /> إنشاء الطلبات</button>
          </div>
        </div>
        <p className="policyNote">تِجرا ينشئ الطلب ويرسله للمورد فقط. ترتيبات التوصيل وموعده تبقى بين التاجر والمورد مباشرة.</p>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">السجل</span><h2>طلبات الشراء</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>رقم الطلب</th><th>المورد</th><th>الأصناف</th><th>القيمة</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.id}</strong></td>
                  <td>{order.supplier}</td>
                  <td>{order.items}</td>
                  <td>{formatSar(order.total)}</td>
                  <td><StatusPill status={order.status} /></td>
                  <td>{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
