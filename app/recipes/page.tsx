import { redirect } from "next/navigation";
import { ChefHat, Scale, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RecipeManager } from "@/components/recipe-manager";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadRecipesForBusiness } from "@/lib/recipes";

export const metadata = { title: "الوصفات والمكونات" };
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const products = await db.product.findMany({
    where: { businessId: context.business.id, active: true },
    select: { id: true, name: true, unit: true },
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
    extraPrice: row.extraPrice,
    yieldPercent: row.yieldPercent,
  }));

  return (
    <>
      <PageHeader
        eyebrow="الكاشير الذكي"
        title="الوصفات والمكونات"
        description="عرّف ما يستهلكه كل منتج مباع. تِجرا يخصم المكونات تلقائيًا ويحسب الفاقد والتكلفة النظرية."
      />

      <section className="recipeExplainerGrid">
        <article className="panel recipeExplainer"><ChefHat size={22} /><div><strong>وصفة لكل منتج</strong><span>شاورما دجاج = دجاج + خبز + صوص + جبن.</span></div></article>
        <article className="panel recipeExplainer"><Scale size={22} /><div><strong>جرام وكيلو ومل ولتر</strong><span>الوحدات تتحول تلقائيًا إلى وحدة المخزون.</span></div></article>
        <article className="panel recipeExplainer"><Sparkles size={22} /><div><strong>فاقد التحضير</strong><span>إذا الناتج 80%، يحسب النظام الخام المطلوب للوصفة بدقة.</span></div></article>
      </section>

      <RecipeManager products={products} rows={rows} />
    </>
  );
}
