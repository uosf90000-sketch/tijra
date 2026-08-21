import { Banknote, Barcode, CreditCard, Plus, ReceiptText, ShoppingCart, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { recentSales } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المبيعات" };

const cart = [
  { name: "بيبسي 330 مل", qty: 2, price: 2.5 },
  { name: "شيبس ملح 160 جم", qty: 1, price: 8 },
  { name: "مياه صفا 330 مل", qty: 1, price: 18 },
];

export default function SalesPage() {
  const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  const salesTotal = recentSales.reduce((sum, item) => sum + item.total, 0);
  const grossProfit = recentSales.reduce((sum, item) => sum + item.total - item.cost, 0);

  return (
    <>
      <PageHeader
        eyebrow="نقطة البيع"
        title="المبيعات"
        description="سجّل البيع بسرعة؛ كل عملية تخصم الكمية من المخزون وتحدّث تكلفة وربح الصنف."
        actions={<button className="button primary"><Plus size={17} /> عملية بيع جديدة</button>}
      />

      <section className="metricsGrid three">
        <MetricCard label="مبيعات آخر العمليات" value={formatSar(salesTotal)} note={`${recentSales.length} فواتير`} icon={TrendingUp} />
        <MetricCard label="مجمل الربح" value={formatSar(grossProfit)} note="بحسب متوسط التكلفة" icon={Banknote} tone="blue" />
        <MetricCard label="متوسط الفاتورة" value={formatSar(salesTotal / recentSales.length)} note="في العينة الحالية" icon={ReceiptText} tone="violet" />
      </section>

      <section className="posGrid">
        <article className="panel posCatalog">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">بيع سريع</span>
              <h2>امسح الباركود أو ابحث</h2>
            </div>
          </div>
          <div className="barcodeField">
            <Barcode size={21} />
            <input aria-label="بحث أو باركود" placeholder="امسح الباركود أو اكتب اسم الصنف..." />
            <span>Enter</span>
          </div>

          <div className="quickProducts">
            {[
              ["مياه صفا 330 مل", "18.00"],
              ["بيبسي 330 مل", "2.50"],
              ["حليب 1 لتر", "7.50"],
              ["شيبس ملح", "8.00"],
              ["مناديل 200", "9.50"],
              ["سكر 2 كجم", "11.00"],
            ].map(([name, price]) => (
              <button className="quickProduct" key={name}>
                <div className="productThumb large">{name.slice(0, 1)}</div>
                <strong>{name}</strong>
                <span>{price} ر.س</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel cartPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">السلة الحالية</span>
              <h2>3 أصناف</h2>
            </div>
            <ShoppingCart size={21} />
          </div>

          <div className="cartList">
            {cart.map((item) => (
              <div className="cartRow" key={item.name}>
                <div className="grow">
                  <strong>{item.name}</strong>
                  <span>{formatSar(item.price)} للوحدة</span>
                </div>
                <div className="qtyControl">
                  <button>-</button><span>{item.qty}</span><button>+</button>
                </div>
                <strong>{formatSar(item.qty * item.price)}</strong>
              </div>
            ))}
          </div>

          <div className="cartTotals">
            <div><span>الإجمالي قبل الضريبة</span><strong>{formatSar(cartTotal)}</strong></div>
            <div><span>الضريبة</span><strong>تُحسب حسب إعداد المنشأة</strong></div>
            <div className="grandTotal"><span>الإجمالي</span><strong>{formatSar(cartTotal)}</strong></div>
          </div>

          <div className="paymentButtons">
            <button className="button secondary"><Banknote size={17} /> نقدي</button>
            <button className="button primary"><CreditCard size={17} /> مدى / بطاقة</button>
          </div>
        </article>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">اليوم</span><h2>آخر الفواتير</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الفاتورة</th><th>الوقت</th><th>عدد الأصناف</th><th>الإجمالي</th><th>التكلفة</th><th>الربح</th><th>الدفع</th></tr></thead>
            <tbody>
              {recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td><strong>{sale.id}</strong></td>
                  <td>{sale.time}</td>
                  <td>{sale.items}</td>
                  <td>{formatSar(sale.total)}</td>
                  <td>{formatSar(sale.cost)}</td>
                  <td className="positive">{formatSar(sale.total - sale.cost)}</td>
                  <td>{sale.payment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
