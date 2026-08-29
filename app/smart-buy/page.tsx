import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, CircleDollarSign, PackageCheck, ShoppingBasket, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { buildPurchasePlan } from "@/lib/purchasing";
import { loadRecipesForBusiness } from "@/lib/recipes";

export const metadata = { title: "مشتريات الأسبوع" };
export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function namesMatch(productName: string, listingName: string) {
  const product = normalize(productName);
  const listing = normalize(listingName);
  if (!product || !listing) return false;
  if (product === listing) return true;
  const productTokens = product.split(/\s+/).filter(Boolean);
  const listingTokens = listing.split(/\s+/).filter(Boolean);
  const overlap = productTokens.filter((token) => listingTokens.includes(token));
  return overlap.length >= Math.max(1, Math.min(productTokens.length, listingTokens.length) - 1);
}

export default async function SmartBuyPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) redirect("/");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [products, listings, recipeMap] = await Promise.all([
    db.product.findMany({
      where: { businessId: context.business.id, active: true },
      include: {
        saleItems: { where: { sale: { soldAt: { gte: since } } }, select: { quantity: true } },
        stockMovements: { where: { occurredAt: { gte: since }, sourceType: "RecipeSale" }, select: { quantity: true } },
      },
      // Smart Buy is an exception queue: always load the lowest stock first so a
      // critical item cannot disappear merely because the catalog is larger than
      // the page cap. Alerts use a wider window, so keep both views aligned.
      orderBy: [{ quantity: "asc" }, { name: "asc" }],
      take: 2000,
    }),
    db.marketplaceListing.findMany({
      where: { active: true, quantity: { gt: 0 }, sellerBusinessId: { not: context.business.id } },
      include: { seller: true },
      orderBy: { price: "asc" },
      take: 5000,
    }),
    loadRecipesForBusiness(context.business.id),
  ]);

  const stockProducts = products.filter((product) => !recipeMap.has(product.id));
  const plan = buildPurchasePlan(stockProducts.map((product) => {
    const directSold = product.saleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
    const recipeConsumed = product.stockMovements.reduce((sum, movement) => sum + Math.abs(Math.min(0, Number(movement.quantity))), 0);
    const avgDailySales = (directSold + recipeConsumed) / 30;
    const matching = listings.filter((listing) => {
      if (product.barcode && listing.barcode) return listing.barcode === product.barcode;
      if (product.sku && listing.sku && product.sku === listing.sku) return true;
      return listing.unit === product.unit && namesMatch(product.name, listing.name);
    });

    return {
      productId: product.id,
      productName: product.name,
      onHand: Number(product.quantity),
      avgDailySales,
      reorderPoint: Number(product.reorderPoint),
      targetCoverageDays: product.targetCoverageDays,
      safetyStockDays: 1,
      offers: matching.map((listing) => ({
        supplierId: listing.sellerBusinessId,
        supplierName: listing.seller.name,
        unitPrice: Number(listing.price),
        minOrderQty: Number(listing.minOrderQty),
      })),
    };
  }));

  const suggestionsWithSupplier = plan.suggestions.filter((item) => item.selectedSupplier);
  const uncovered = plan.suggestions.filter((item) => !item.selectedSupplier);

  return (
    <>
      <PageHeader eyebrow="الشراء الذكي" title="وفّر لي مشتريات هذا الأسبوع" description="تِجرا يقرأ البيع المباشر واستهلاك مكونات الوصفات خلال 30 يومًا، يلتقط حالات النفاد حتى بدون سجل مبيعات، ثم يقترح الكمية ويختار أقل مورد تكلفة." actions={<Link className="button secondary" href="/catalog"><Sparkles size={17} /> الكتالوج الموحد</Link>} />
      <section className="metricsGrid four">
        <MetricCard label="أصناف مقترحة" value={`${plan.suggestions.length}`} note="مواد ومخزون تحتاج تغطية" icon={ShoppingBasket} />
        <MetricCard label="لها مورد مناسب" value={`${suggestionsWithSupplier.length}`} note="يمكن شراؤها من السوق" icon={PackageCheck} tone="blue" />
        <MetricCard label="ميزانية تقديرية" value={formatSar(plan.estimatedTotal)} note="بأفضل العروض الحالية" icon={CircleDollarSign} tone="amber" />
        <MetricCard label="تغطية مستهدفة" value="7 أيام" note="+ يوم مخزون أمان" icon={CalendarCheck} tone="violet" />
      </section>

      <section className="panel tablePanel workflowTable">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">الخطة</span><h2>مشتريات الأسبوع المقترحة</h2></div><strong>{formatSar(plan.estimatedTotal)}</strong></div>
        <div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>الكمية المقترحة</th><th>المورد الأفضل</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead><tbody>
          {plan.suggestions.map((item) => <tr key={item.productId}><td><strong>{item.productName}</strong><span className="mutedText" style={{ display: "block" }}>{item.reason}</span></td><td>{item.suggestedQty.toLocaleString("ar-SA")}</td><td>{item.selectedSupplier?.supplierName || "لا يوجد عرض مطابق"}</td><td>{item.selectedSupplier ? formatSar(item.selectedSupplier.unitPrice) : "—"}</td><td>{item.selectedSupplier ? formatSar(item.estimatedTotal) : "—"}</td><td><Link className="textLink" href={`/marketplace?q=${encodeURIComponent(item.productName)}`}>عرض السوق</Link></td></tr>)}
          {!plan.suggestions.length && <tr><td colSpan={6}><div className="infoNote">لا توجد أصناف تحتاج شراءً حاليًا. عند توقع النفاد أو الوصول إلى حد إعادة الطلب ستظهر هنا الكمية المقترحة بدل اعتبار المخزون المغطي تلقائيًا.</div></td></tr>}
        </tbody></table></div>
      </section>

      {uncovered.length ? <section className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow">فرص للموردين</span><h2>أصناف تحتاج موردًا مطابقًا</h2><p className="mutedText">التنبيه والكمية المقترحة موجودان، لكن لا يوجد عرض سوق مطابق حاليًا. ابحث عن الصنف أو أضف موردًا/عرضًا له.</p></div></div><div className="chipList">{uncovered.map((item) => <Link key={item.productId} href={`/marketplace?q=${encodeURIComponent(item.productName)}`}>{item.productName}</Link>)}</div></section> : null}
    </>
  );
}
