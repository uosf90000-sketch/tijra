import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, ClipboardCheck, PackagePlus, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusPill } from "@/components/status-pill";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المخزون" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const products = await db.product.findMany({
    where: { businessId: context.business.id, active: true },
    include: {
      saleItems: {
        where: { sale: { soldAt: { gte: since } } },
        select: { quantity: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = products.map((item) => {
    const quantity = Number(item.quantity);
    const reorderPoint = Number(item.reorderPoint);
    const averageCost = Number(item.averageCost);
    const salePrice = Number(item.salePrice);
    const sold30 = item.saleItems.reduce((sum, sale) => sum + Number(sale.quantity), 0);
    const avgDailySales = sold30 / 30;
    const days = avgDailySales > 0 ? quantity / avgDailySales : null;
    const status = quantity <= Math.max(1, reorderPoint * 0.5) ? "critical" : quantity <= reorderPoint ? "low" : "healthy";
    return { ...item, quantityNumber: quantity, reorderPointNumber: reorderPoint, averageCostNumber: averageCost, salePriceNumber: salePrice, avgDailySales, days, status };
  });

  const value = rows.reduce((sum, item) => sum + item.quantityNumber * item.averageCostNumber, 0);
  const low = rows.filter((item) => item.status !== "healthy").length;
  const potentialProfit = rows.reduce((sum, item) => sum + item.quantityNumber * Math.max(0, item.salePriceNumber - item.averageCostNumber), 0);

  return (
    <>
      <PageHeader
        eyebrow="التشغيل"
        title="المخزون"
        description="الكميات والتكلفة والحركة مرتبطة مباشرة بالكاشير والجرد والشراء."
        actions={<><Link className="button secondary" href="/inventory/audit"><ClipboardCheck size={17} /> الجرد</Link><Link className="button primary" href="/inventory/new"><PackagePlus size={17} /> إضافة صنف</Link></>}
      />

      <section className="metricsGrid three">
        <MetricCard label="قيمة المخزون" value={formatSar(value)} note="بسعر التكلفة" icon={Boxes} />
        <MetricCard label="أصناف تحتاج انتباه" value={`${low}`} note="منخفضة أو حرجة" trend={low ? "down" : undefined} icon={TriangleAlert} tone="amber" />
        <MetricCard label="ربح محتمل بالمخزون" value={formatSar(potentialProfit)} note="فرق البيع عن التكلفة" icon={Boxes} tone="blue" />
      </section>

      <section className="panel tablePanel">
        <div className="tableToolbar">
          <div className="searchField"><Search size={18} /><input aria-label="بحث في المخزون" placeholder="ابحث بالاسم أو الباركود أو SKU" /></div>
          <button className="button secondary compact"><SlidersHorizontal size={16} /> تصفية</button>
        </div>

        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الصنف</th><th>المخزون</th><th>الحالة</th><th>التغطية</th><th>متوسط التكلفة</th><th>سعر البيع</th><th>هامش الوحدة</th></tr></thead>
            <tbody>
              {rows.map((item) => {
                const margin = item.salePriceNumber - item.averageCostNumber;
                return (
                  <tr key={item.id}>
                    <td><div className="tablePrimary"><div className={`productThumb ${item.imageUrl ? "hasImage" : ""}`}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.name.slice(0, 1)}</div><div><strong>{item.name}</strong><span>{item.sku || "بدون SKU"} · {item.category || "غير مصنف"}</span></div></div></td>
                    <td><strong>{item.quantityNumber.toLocaleString("ar-SA")}</strong> <span className="mutedText">{item.unit}</span></td>
                    <td><StatusPill status={item.status} /></td>
                    <td className="coverageCell">
                      <span>{item.days == null ? "لا توجد مبيعات كافية" : `${Math.max(0, Math.round(item.days))} يوم`}</span>
                      <ProgressBar value={item.quantityNumber} max={Math.max(item.reorderPointNumber * 2, item.quantityNumber, 1)} tone={item.status === "critical" ? "red" : item.status === "low" ? "amber" : "brand"} />
                    </td>
                    <td>{formatSar(item.averageCostNumber)}</td>
                    <td>{formatSar(item.salePriceNumber)}</td>
                    <td className={margin >= 0 ? "positive" : "dangerText"}>{formatSar(margin)}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={7}><div className="infoNote">لا توجد أصناف بعد. أضف أول صنف ليبدأ المخزون.</div></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="tableFooter"><span>عرض {rows.length} أصناف من قاعدة البيانات</span><Link className="textLink" href="/smart-buy">خطة مشتريات الأسبوع</Link></div>
      </section>
    </>
  );
}
