import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, ChefHat, ClipboardCheck, PackagePlus, Search, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusPill } from "@/components/status-pill";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { loadRecipesForBusiness, recipeMaxServings, requiredStockQuantity } from "@/lib/recipes";

export const metadata = { title: "المخزون" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [products, recipeMap] = await Promise.all([
    db.product.findMany({
      where: { businessId: context.business.id, active: true },
      include: {
        saleItems: {
          where: { sale: { soldAt: { gte: since } } },
          select: { quantity: true },
        },
        stockMovements: {
          where: { occurredAt: { gte: since }, sourceType: "RecipeSale" },
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    loadRecipesForBusiness(context.business.id),
  ]);

  const rows = products.map((item) => {
    const recipe = recipeMap.get(item.id) ?? [];
    const isRecipe = recipe.length > 0;
    const rawQuantity = Number(item.quantity);
    const quantity = isRecipe ? Math.floor(recipeMaxServings(recipe)) : rawQuantity;
    const reorderPoint = Number(item.reorderPoint);
    const directSold30 = item.saleItems.reduce((sum, sale) => sum + Number(sale.quantity), 0);
    const recipeConsumed30 = item.stockMovements.reduce((sum, movement) => sum + Math.abs(Math.min(0, Number(movement.quantity))), 0);
    const demand30 = isRecipe ? directSold30 : directSold30 + recipeConsumed30;
    const avgDailySales = demand30 / 30;
    const days = avgDailySales > 0 ? quantity / avgDailySales : null;
    const recipeUnitCost = isRecipe ? recipe.reduce((sum, component) => sum + requiredStockQuantity(component) * component.ingredientAverageCost, 0) : 0;
    const averageCost = isRecipe ? recipeUnitCost : Number(item.averageCost);
    const salePrice = Number(item.salePrice);
    const lowThreshold = isRecipe ? 5 : reorderPoint;
    const status = quantity <= Math.max(1, lowThreshold * 0.5) ? "critical" : quantity <= lowThreshold ? "low" : "healthy";
    return { ...item, isRecipe, quantityNumber: quantity, rawQuantity, reorderPointNumber: reorderPoint, averageCostNumber: averageCost, salePriceNumber: salePrice, avgDailySales, days, status };
  });

  const stockRows = rows.filter((item) => !item.isRecipe);
  const value = stockRows.reduce((sum, item) => sum + item.rawQuantity * item.averageCostNumber, 0);
  const low = rows.filter((item) => item.status !== "healthy").length;
  const potentialProfit = stockRows.reduce((sum, item) => sum + item.rawQuantity * Math.max(0, item.salePriceNumber - item.averageCostNumber), 0);

  return (
    <>
      <PageHeader
        eyebrow="التشغيل"
        title="المخزون"
        description="الكميات والتكلفة والحركة مرتبطة بالكاشير والوصفات والجرد والشراء. المنتجات المركبة تُحسب من مكوناتها بدون تكرار قيمة المخزون."
        actions={<div className="pageActionGroup"><Link className="button secondary" href="/recipes"><ChefHat size={17} /> الوصفات</Link><Link className="button secondary" href="/inventory/waste"><Trash2 size={17} /> الهدر</Link><Link className="button secondary" href="/inventory/closing"><ClipboardCheck size={17} /> إقفال اليوم</Link><Link className="button secondary" href="/inventory/audit"><ClipboardCheck size={17} /> الجرد</Link><Link className="button primary" href="/inventory/new"><PackagePlus size={17} /> إضافة صنف</Link></div>}
      />

      <section className="metricsGrid three">
        <MetricCard label="قيمة المخزون" value={formatSar(value)} note="المواد الفعلية فقط، بدون تكرار الوصفات" icon={Boxes} />
        <MetricCard label="أصناف تحتاج انتباه" value={`${low}`} note="مواد أو وصفات منخفضة التغطية" trend={low ? "down" : undefined} icon={TriangleAlert} tone="amber" />
        <MetricCard label="ربح محتمل بالمخزون" value={formatSar(potentialProfit)} note="للأصناف المخزنة مباشرة" icon={Boxes} tone="blue" />
      </section>

      <section className="panel tablePanel">
        <div className="tableToolbar">
          <div className="searchField"><Search size={18} /><input aria-label="بحث في المخزون" placeholder="ابحث بالاسم أو الباركود أو SKU" /></div>
          <button className="button secondary compact"><SlidersHorizontal size={16} /> تصفية</button>
        </div>

        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الصنف</th><th>المتوفر</th><th>الحالة</th><th>التغطية</th><th>التكلفة</th><th>سعر البيع</th><th>هامش الوحدة</th></tr></thead>
            <tbody>
              {rows.map((item) => {
                const margin = item.salePriceNumber - item.averageCostNumber;
                return (
                  <tr key={item.id}>
                    <td><div className="tablePrimary"><div className={`productThumb ${item.imageUrl ? "hasImage" : ""}`}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.isRecipe ? <ChefHat size={16} /> : item.name.slice(0, 1)}</div><div><strong>{item.name}</strong><span>{item.isRecipe ? "وصفة مرتبطة بالمكونات" : `${item.sku || "بدون SKU"} · ${item.category || "غير مصنف"}`}</span></div></div></td>
                    <td><strong>{item.quantityNumber.toLocaleString("ar-SA")}</strong> <span className="mutedText">{item.isRecipe ? "طلب تقريبي" : item.unit}</span></td>
                    <td><StatusPill status={item.status} /></td>
                    <td className="coverageCell">
                      <span>{item.days == null ? "لا توجد حركة كافية" : `${Math.max(0, Math.round(item.days))} يوم`}</span>
                      <ProgressBar value={item.quantityNumber} max={Math.max(item.isRecipe ? 10 : item.reorderPointNumber * 2, item.quantityNumber, 1)} tone={item.status === "critical" ? "red" : item.status === "low" ? "amber" : "brand"} />
                    </td>
                    <td>{formatSar(item.averageCostNumber)}{item.isRecipe ? <span className="mutedText" style={{ display: "block" }}>تكلفة الوصفة</span> : null}</td>
                    <td>{formatSar(item.salePriceNumber)}</td>
                    <td className={margin >= 0 ? "positive" : "dangerText"}>{formatSar(margin)}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={7}><div className="infoNote">لا توجد أصناف بعد. أضف المكونات والمنتجات ليبدأ المخزون.</div></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="tableFooter"><span>عرض {rows.length} أصناف من قاعدة البيانات</span><Link className="textLink" href="/smart-buy">خطة مشتريات الأسبوع</Link></div>
      </section>
    </>
  );
}
