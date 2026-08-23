import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Banknote, ChefHat, Clock3, ReceiptText, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PosTerminal } from "@/components/pos-terminal";
import { ensureDefaultLocation, listUnitConversions, safeJson } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { loadRecipesForBusiness, recipeMaxServings } from "@/lib/recipes";

export const metadata = { title: "المبيعات" };
export const dynamic = "force-dynamic";

const paymentLabels: Record<string, string> = { CASH: "نقدي", CARD: "بطاقة", TRANSFER: "تحويل", OTHER: "أخرى" };

export default async function SalesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const businessId = context.business.id;
  const isOwner = context.membership.role === "OWNER";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultLocation = await ensureDefaultLocation(businessId);

  const [products, recentSales, todayAggregate, recipeMap] = await Promise.all([
    db.product.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, barcode: true, salePrice: true, quantity: true, unit: true },
      orderBy: { name: "asc" },
    }),
    db.sale.findMany({
      where: { businessId },
      include: { items: true },
      orderBy: { soldAt: "desc" },
      take: 30,
    }),
    db.sale.aggregate({
      where: { businessId, soldAt: { gte: today } },
      _sum: { total: true, costTotal: true },
      _count: { _all: true },
    }),
    loadRecipesForBusiness(businessId),
  ]);

  const productIds = products.map((item) => item.id);
  const [conversions, configRows, serialRows] = await Promise.all([
    listUnitConversions(businessId, productIds),
    db.inventoryAuditEvent.findMany({ where: { businessId, action: "PRODUCT_CONFIG", listingId: { in: productIds } } }),
    db.inventoryAuditEvent.findMany({ where: { businessId, action: "PRODUCT_SERIAL", listingId: { in: productIds }, quantity: { gt: 0 } }, orderBy: { itemName: "asc" } }),
  ]);

  const conversionMap = new Map<string, typeof conversions>();
  for (const conversion of conversions) {
    const current = conversionMap.get(conversion.productId) ?? [];
    current.push(conversion);
    conversionMap.set(conversion.productId, current);
  }
  const configMap = new Map(configRows.map((row) => [row.listingId, safeJson<{ saleMode?: "STANDARD" | "WEIGHT" | "SERIAL" | "RECIPE" | "SERVICE"; size?: string | null; color?: string | null; variantGroup?: string | null }>(row.note, {})]));
  const serialMap = new Map<string, string[]>();
  for (const row of serialRows) {
    if (!row.listingId || !row.itemName) continue;
    const current = serialMap.get(row.listingId) ?? [];
    current.push(row.itemName);
    serialMap.set(row.listingId, current);
  }

  const salesTotal = Number(todayAggregate._sum.total ?? 0);
  const costTotal = Number(todayAggregate._sum.costTotal ?? 0);
  const grossProfit = salesTotal - costTotal;
  const count = todayAggregate._count._all;

  const posProducts = products.map((item) => {
    const recipe = recipeMap.get(item.id) ?? [];
    const config = configMap.get(item.id) ?? {};
    const saleMode = config.saleMode || (recipe.length ? "RECIPE" : "STANDARD");
    const serials = serialMap.get(item.id) ?? [];
    const availableQuantity = saleMode === "SERVICE" ? 100000000
      : recipe.length ? Math.floor(recipeMaxServings(recipe))
      : saleMode === "SERIAL" && serials.length ? Math.min(Number(item.quantity), serials.length)
      : Number(item.quantity);
    return {
      id: item.id,
      name: item.name,
      barcode: item.barcode,
      salePrice: Number(item.salePrice),
      quantity: Number(item.quantity),
      availableQuantity,
      unit: item.unit,
      saleMode,
      size: config.size || null,
      color: config.color || null,
      variantGroup: config.variantGroup || null,
      serials,
      conversions: (conversionMap.get(item.id) ?? []).map((conversion) => ({
        id: conversion.id,
        name: conversion.name,
        factor: conversion.factor,
        barcode: conversion.barcode,
        salePrice: conversion.salePrice,
      })),
      recipe: recipe.map((component) => ({
        id: component.id,
        ingredientName: component.ingredientName,
        quantity: component.quantity,
        unit: component.unit,
        canRemove: component.canRemove,
        canExtra: component.canExtra,
        extraPrice: component.extraPrice,
        yieldPercent: component.yieldPercent,
      })),
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="نقطة البيع"
        title="الكاشير"
        description="قطعة، وزن، كرتون، وصفة، خدمة أو جهاز برقم Serial/IMEI — وكل بيع ينعكس فورًا على المخزون والحركة."
        actions={<div className="pageActionGroup">
          <Link className="button secondary" href="/sales/shifts"><Clock3 size={17} /> الورديات</Link>
          {isOwner ? <Link className="button secondary" href="/recipes"><ChefHat size={17} /> إعداد الوصفات</Link> : null}
          {isOwner ? <Link className="button secondary" href="/sales/analytics"><BarChart3 size={17} /> التحليلات</Link> : null}
        </div>}
      />

      {isOwner ? <section className="metricsGrid three ownerOnlyMetrics">
        <MetricCard label="مبيعات اليوم" value={formatSar(salesTotal)} note={`${count} فواتير`} icon={TrendingUp} />
        <MetricCard label="مجمل الربح اليوم" value={formatSar(grossProfit)} note="يشمل تكلفة مكونات الوصفات" icon={Banknote} tone="blue" />
        <MetricCard label="متوسط الفاتورة" value={formatSar(count ? salesTotal / count : 0)} note="لعمليات اليوم" icon={ReceiptText} tone="violet" />
      </section> : null}

      <PosTerminal products={posProducts} locationId={defaultLocation.id} businessActivity={context.business.businessActivity} />

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>آخر الفواتير</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الفاتورة</th><th>الوقت</th><th>عدد الأصناف</th><th>الإجمالي</th><th>التكلفة</th><th>الربح</th><th>الدفع</th></tr></thead>
            <tbody>
              {recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td><strong>{sale.invoiceNumber || sale.id.slice(-8).toUpperCase()}</strong></td>
                  <td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(sale.soldAt)}</td>
                  <td>{sale.items.length}</td>
                  <td>{formatSar(Number(sale.total))}</td>
                  <td>{isOwner ? formatSar(Number(sale.costTotal)) : "—"}</td>
                  <td className="positive">{isOwner ? formatSar(Number(sale.total) - Number(sale.costTotal)) : "—"}</td>
                  <td>{paymentLabels[sale.paymentMethod] ?? sale.paymentMethod}</td>
                </tr>
              ))}
              {!recentSales.length && <tr><td colSpan={7}><div className="infoNote">لا توجد مبيعات مسجلة بعد.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
