import Link from "next/link";
import { Boxes, Download, PackagePlus, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusPill } from "@/components/status-pill";
import { inventoryProducts } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المخزون" };

export default function InventoryPage() {
  const value = inventoryProducts.reduce((sum, item) => sum + item.quantity * item.averageCost, 0);
  const low = inventoryProducts.filter((item) => item.status !== "healthy").length;
  const potentialProfit = inventoryProducts.reduce(
    (sum, item) => sum + item.quantity * Math.max(0, item.salePrice - item.averageCost),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="التشغيل"
        title="المخزون"
        description="راقب الكميات والتكلفة وسرعة الحركة واعرف ما يحتاج طلبًا قبل أن ينفد."
        actions={
          <>
            <button className="button secondary"><Download size={17} /> استيراد</button>
            <button className="button primary"><PackagePlus size={17} /> إضافة صنف</button>
          </>
        }
      />

      <section className="metricsGrid three">
        <MetricCard label="قيمة المخزون" value={formatSar(value)} note="بسعر التكلفة" icon={Boxes} />
        <MetricCard label="أصناف تحتاج انتباه" value={`${low}`} note="منخفضة أو حرجة" trend="down" icon={TriangleAlert} tone="amber" />
        <MetricCard label="ربح محتمل بالمخزون" value={formatSar(potentialProfit)} note="فرق البيع عن التكلفة" icon={Boxes} tone="blue" />
      </section>

      <section className="panel tablePanel">
        <div className="tableToolbar">
          <div className="searchField">
            <Search size={18} />
            <input aria-label="بحث في المخزون" placeholder="ابحث بالاسم أو الباركود أو SKU" />
          </div>
          <button className="button secondary compact"><SlidersHorizontal size={16} /> تصفية</button>
        </div>

        <div className="tableScroll">
          <table className="dataTable">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>المخزون</th>
                <th>الحالة</th>
                <th>التغطية</th>
                <th>متوسط التكلفة</th>
                <th>سعر البيع</th>
                <th>هامش الوحدة</th>
              </tr>
            </thead>
            <tbody>
              {inventoryProducts.map((item) => {
                const days = item.avgDailySales > 0 ? item.quantity / item.avgDailySales : 99;
                const margin = item.salePrice - item.averageCost;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="tablePrimary">
                        <div className="productThumb">{item.name.slice(0, 1)}</div>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.sku} · {item.category}</span>
                        </div>
                      </div>
                    </td>
                    <td><strong>{item.quantity}</strong> <span className="mutedText">{item.unit}</span></td>
                    <td><StatusPill status={item.status} /></td>
                    <td className="coverageCell">
                      <span>{Math.max(1, Math.round(days))} يوم</span>
                      <ProgressBar
                        value={item.quantity}
                        max={Math.max(item.reorderPoint * 2, item.quantity)}
                        tone={item.status === "critical" ? "red" : item.status === "low" ? "amber" : "brand"}
                      />
                    </td>
                    <td>{formatSar(item.averageCost)}</td>
                    <td>{formatSar(item.salePrice)}</td>
                    <td className="positive">{formatSar(margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="tableFooter">
          <span>عرض {inventoryProducts.length} أصناف تجريبية</span>
          <Link className="textLink" href="/purchases">إنشاء طلبية للنواقص</Link>
        </div>
      </section>
    </>
  );
}
