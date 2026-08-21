import { CirclePlus, ExternalLink, Phone, Search, Store, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { suppliers } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الموردون" };

const comparison = [
  { product: "مياه صفا 330 مل", supplier: "شركة المورد الأول", price: 13.2, min: "10 كرتون", diff: "-4.3%" },
  { product: "مياه صفا 330 مل", supplier: "مؤسسة الإمداد السريع", price: 13.45, min: "5 كراتين", diff: "-2.5%" },
  { product: "بيبسي 330 مل", supplier: "موزع المشروبات المتحدة", price: 1.78, min: "24 حبة", diff: "-6.8%" },
  { product: "حليب كامل الدسم 1 لتر", supplier: "مؤسسة الإمداد السريع", price: 5.62, min: "12 حبة", diff: "-4.7%" },
];

export default function SuppliersPage() {
  const balance = suppliers.reduce((sum, item) => sum + item.balance, 0);
  const openOrders = suppliers.reduce((sum, item) => sum + item.openOrders, 0);

  return (
    <>
      <PageHeader
        eyebrow="شبكة التوريد"
        title="الموردون"
        description="احتفظ بمورديك الحاليين، سجّل أسعارهم وقارن بينهم. التوصيل والاتفاقات اللوجستية تبقى مباشرة بينكما."
        actions={<button className="button primary"><CirclePlus size={17} /> إضافة مورد</button>}
      />

      <section className="metricsGrid three">
        <MetricCard label="الموردون النشطون" value={`${suppliers.length}`} note="داخل هذه المنشأة" icon={Store} />
        <MetricCard label="طلبات مفتوحة" value={`${openOrders}`} note="بانتظار الإكمال" icon={ExternalLink} tone="blue" />
        <MetricCard label="مستحقات موردين" value={formatSar(balance)} note="حسب السجلات الحالية" icon={Tags} tone="amber" />
      </section>

      <section className="supplierGrid">
        {suppliers.map((supplier) => (
          <article className="panel supplierCard" key={supplier.id}>
            <div className="supplierTop">
              <div className="supplierLogo">{supplier.name.slice(0, 1)}</div>
              <div className="grow">
                <strong>{supplier.name}</strong>
                <span>{supplier.products} صنفًا مسجلًا</span>
              </div>
              <button className="iconButton" aria-label={`فتح ${supplier.name}`}><ExternalLink size={17} /></button>
            </div>
            <div className="supplierStats">
              <div><span>طلبات مفتوحة</span><strong>{supplier.openOrders}</strong></div>
              <div><span>المستحق</span><strong>{formatSar(supplier.balance)}</strong></div>
            </div>
            <div className="supplierContact"><Phone size={15} /> {supplier.phone}</div>
            <div className="logisticsNote">{supplier.note}</div>
          </article>
        ))}
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div>
            <span className="eyebrow">مقارنة الأسعار</span>
            <h2>أفضل العروض المسجلة</h2>
          </div>
          <div className="searchField small">
            <Search size={17} />
            <input aria-label="بحث بعروض الموردين" placeholder="ابحث عن صنف" />
          </div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الصنف</th><th>المورد</th><th>السعر</th><th>الحد الأدنى</th><th>مقابل آخر شراء</th></tr></thead>
            <tbody>
              {comparison.map((item, index) => (
                <tr key={`${item.product}-${index}`}>
                  <td><strong>{item.product}</strong></td>
                  <td>{item.supplier}</td>
                  <td><strong>{formatSar(item.price)}</strong></td>
                  <td>{item.min}</td>
                  <td><span className="savingText">{item.diff}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
