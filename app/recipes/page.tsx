import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RecipeManager } from "@/components/recipe-manager";
import { getSessionContext } from "@/lib/auth";
import { isFoodActivity } from "@/lib/business-experience";
import { db } from "@/lib/db";
import { loadRecipesForBusiness } from "@/lib/recipes";

export const metadata = { title: "المكونات والإضافات" };
export const dynamic = "force-dynamic";

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect("/");
  if (!isFoodActivity(context.business.businessActivity)) redirect("/products");

  const params = await searchParams;
  const products = await db.product.findMany({
    where: { businessId: context.business.id, active: true },
    select: { id: true, name: true, unit: true, imageUrl: true, salePrice: true },
    orderBy: { name: "asc" },
  });
  const recipeMap = await loadRecipesForBusiness(context.business.id);
  const nameMap = new Map(products.map((item) => [item.id, item.name]));
  const rows = [...recipeMap.values()].flat().map((row) => ({
    id: row.id,
    saleProductId: row.saleProductId,
    saleProductName: nameMap.get(row.saleProductId) || "منتج غير متاح",
    ingredientProductId: row.ingredientProductId,
    ingredientName: row.ingredientName,
    quantity: row.quantity,
    unit: row.unit,
    canRemove: row.canRemove,
    canExtra: row.canExtra,
    extraOnly: Boolean(row.extraOnly),
    replacesComponentId: row.replacesComponentId || null,
    extraPrice: row.extraPrice,
  }));
  const initialProductId = products.some((item) => item.id === params.product) ? params.product : undefined;

  return (
    <>
      <PageHeader
        eyebrow="إعدادات المالك"
        title="المكونات والإضافات"
        description="اختر المنتج بصورته، أضف مكوناته مرة واحدة، وحدد الإضافات والبدائل. الكاشير يرى خيارات الطلب فقط ولا يرى كميات الوصفة."
      />
      <RecipeManager
        products={products.map((item) => ({ ...item, salePrice: Number(item.salePrice) }))}
        rows={rows}
        initialProductId={initialProductId}
      />
    </>
  );
}
