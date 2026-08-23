import { redirect } from "next/navigation";
import { PosTerminal } from "@/components/pos-terminal";
import { getSessionContext } from "@/lib/auth";
import { isFoodActivity, posExperienceFor } from "@/lib/business-experience";
import { ensureDefaultLocation, listUnitConversions, safeJson } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { loadRecipesForBusiness, recipeMaxServings } from "@/lib/recipes";

export const metadata = { title: "الكاشير" };
export const dynamic = "force-dynamic";

function cashierCopy(activity: string) {
  const experience = posExperienceFor(activity);
  if (experience === "MENU") return { title: "الكاشير", note: "اختر المنتج من الصور ثم أكمل الطلب." };
  if (experience === "PART_LOOKUP") return { title: "الكاشير", note: "اكتب رقم القطعة واعرف المتوفر فورًا." };
  if (experience === "BARCODE") return { title: "الكاشير", note: "امسح الباركود وأكمل البيع." };
  return { title: "الكاشير", note: "ابحث عن المنتج وأكمل البيع." };
}

export default async function SalesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const businessId = context.business.id;
  const activity = context.business.businessActivity;
  const foodBusiness = isFoodActivity(activity);
  const defaultLocation = await ensureDefaultLocation(businessId);

  const products = await db.product.findMany({
    where: { businessId, active: true },
    select: { id: true, name: true, sku: true, barcode: true, imageUrl: true, salePrice: true, quantity: true, unit: true },
    orderBy: { name: "asc" },
  });
  const recipeMap = foodBusiness ? await loadRecipesForBusiness(businessId) : new Map<string, never[]>();

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

  const cashierProducts = foodBusiness ? products.filter((item) => Number(item.salePrice) > 0) : products;
  const posProducts = cashierProducts.map((item) => {
    const recipe = recipeMap.get(item.id) ?? [];
    const config = configMap.get(item.id) ?? {};
    const saleMode = config.saleMode || (recipe.length ? "RECIPE" : "STANDARD");
    const serials = serialMap.get(item.id) ?? [];
    const maxServings = recipe.length ? recipeMaxServings(recipe) : 0;
    const availableQuantity = saleMode === "SERVICE" ? 100000000
      : recipe.length ? (Number.isFinite(maxServings) ? Math.floor(maxServings) : 100000000)
      : saleMode === "SERIAL" && serials.length ? Math.min(Number(item.quantity), serials.length)
      : Number(item.quantity);

    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      imageUrl: item.imageUrl,
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
        extraOnly: Boolean(component.extraOnly),
        replacesComponentId: component.replacesComponentId || null,
        extraPrice: component.extraPrice,
        yieldPercent: component.yieldPercent,
      })),
    };
  });

  const copy = cashierCopy(activity);
  return (
    <main className="cashierWorkspace">
      <header className="cashierMinimalHead">
        <div><span>نقطة البيع</span><h1>{copy.title}</h1></div>
        <p>{copy.note}</p>
      </header>
      <PosTerminal products={posProducts} locationId={defaultLocation.id} businessActivity={activity} />
    </main>
  );
}
