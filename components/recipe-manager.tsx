"use client";

import { ArrowLeftRight, ImageIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { formatSar } from "@/lib/format";

type ProductOption = { id: string; name: string; unit: string; imageUrl: string | null; salePrice: number };
type RecipeRow = {
  id: string;
  saleProductId: string;
  saleProductName: string;
  ingredientProductId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  canRemove: boolean;
  canExtra: boolean;
  extraOnly: boolean;
  replacesComponentId: string | null;
  extraPrice: number;
};

type SetupMode = "ingredients" | "extras" | "alternatives";

export function RecipeManager({ products, rows, initialProductId }: { products: ProductOption[]; rows: RecipeRow[]; initialProductId?: string }) {
  const router = useRouter();
  const saleProducts = useMemo(() => products.filter((item) => item.salePrice > 0), [products]);
  const firstSaleProduct = saleProducts[0] ?? products[0];
  const initialProduct = products.find((item) => item.id === initialProductId) ?? firstSaleProduct;
  const [selectedProductId, setSelectedProductId] = useState(initialProduct?.id ?? "");
  const [mode, setMode] = useState<SetupMode>("ingredients");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedProduct = products.find((item) => item.id === selectedProductId) ?? firstSaleProduct;
  const currentRows = rows.filter((row) => row.saleProductId === selectedProductId);
  const baseRows = currentRows.filter((row) => !row.extraOnly);
  const extraRows = currentRows.filter((row) => row.extraOnly && !row.replacesComponentId);
  const alternativeRows = currentRows.filter((row) => row.extraOnly && row.replacesComponentId);
  const shownRows = mode === "ingredients" ? baseRows : mode === "extras" ? extraRows : alternativeRows;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ingredientName = String(form.get("ingredientName") || "").trim();
    if (!ingredientName) return;

    setLoading(true);
    setMessage("");
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        saleProductId: selectedProductId,
        ingredientName,
        quantity: Number(form.get("quantity") || 0),
        unit: form.get("unit"),
        canRemove: false,
        canExtra: mode !== "ingredients",
        replacesComponentId: mode === "alternatives" ? form.get("replacesComponentId") : undefined,
        extraPrice: mode === "ingredients" ? 0 : Number(form.get("extraPrice") || 0),
        yieldPercent: 100,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      if (result.error === "SAME_PRODUCT_NOT_ALLOWED") setMessage("لا يمكن استخدام المنتج نفسه كمكوّن داخل وصفته.");
      else if (result.error === "INCOMPATIBLE_RECIPE_UNITS") setMessage("وحدة المكوّن لا تتوافق مع وحدة المخزون. اختر غرام/كيلو أو مل/لتر بشكل متوافق.");
      else if (result.error === "REPLACEMENT_TARGET_NOT_FOUND") setMessage("اختر المكوّن الأساسي الذي سيستبدله هذا البديل.");
      else setMessage("تعذر الحفظ. راجع الاسم والكمية والوحدة.");
      return;
    }
    setMessage(mode === "ingredients" ? "تمت إضافة المكوّن ✅" : mode === "extras" ? "تم حفظ الإضافة ✅" : "تم حفظ البديل ✅");
    formElement.reset();
    router.refresh();
  }

  async function remove(row: RecipeRow) {
    if (!confirm(`حذف ${row.ingredientName}؟`)) return;
    const params = new URLSearchParams({ saleProductId: row.saleProductId, ingredientProductId: row.ingredientProductId });
    const response = await fetch(`/api/recipes?${params.toString()}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  if (!products.length) {
    return <section className="panel recipeEmptyState"><strong>أضف منتجاتك أولًا</strong><span>أضف مثلًا «قهوة اليوم» أو «شاورما دجاج» مع الصورة والسعر، وبعدها ارجع لربط المكونات.</span></section>;
  }

  return (
    <section className="recipeWorkspace">
      <div className="panel recipeProductPicker">
        <div className="panelHeader"><div><span className="eyebrow">1 · المنتج</span><h2>اختر المنتج الذي يظهر للكاشير</h2></div></div>
        <div className="recipeProductGrid">
          {(saleProducts.length ? saleProducts : products).map((product) => (
            <button type="button" key={product.id} className={`recipeProductChoice ${selectedProductId === product.id ? "active" : ""}`} onClick={() => { setSelectedProductId(product.id); setMessage(""); }}>
              <span className="recipeProductImage">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <ImageIcon size={24} />}</span>
              <span className="recipeProductChoiceText"><strong>{product.name}</strong><small>{formatSar(product.salePrice)}</small></span>
            </button>
          ))}
        </div>
      </div>

      {selectedProduct ? <div className="panel recipeBuilderCard">
        <div className="recipeBuilderTitle">
          <div className="recipeSelectedProduct">
            <span className="recipeProductImage large">{selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt="" /> : <ImageIcon size={27} />}</span>
            <div><span className="eyebrow">2 · الإعداد</span><h2>{selectedProduct.name}</h2><small>الكاشير يرى الاسم والصورة والسعر وخيارات الطلب فقط. كميات المكونات تبقى عند المالك.</small></div>
          </div>
          <div className="recipeModeSwitch" role="tablist" aria-label="إعداد المنتج">
            <button type="button" className={mode === "ingredients" ? "active" : ""} onClick={() => setMode("ingredients")}>المكونات</button>
            <button type="button" className={mode === "extras" ? "active" : ""} onClick={() => setMode("extras")}><Sparkles size={15} /> الإضافات</button>
            <button type="button" className={mode === "alternatives" ? "active" : ""} onClick={() => setMode("alternatives")}><ArrowLeftRight size={15} /> البدائل</button>
          </div>
        </div>

        <div className="recipeCurrentList">
          {shownRows.map((row) => {
            const replaced = row.replacesComponentId ? baseRows.find((base) => base.id === row.replacesComponentId) : null;
            return <div className="recipeCurrentRow" key={row.id}>
              <div><strong>{row.ingredientName}</strong><span>{row.quantity.toLocaleString("ar-SA")} {row.unit}{row.extraOnly ? ` · +${formatSar(row.extraPrice)}` : ""}{replaced ? ` · بدل ${replaced.ingredientName}` : ""}</span></div>
              <button className="iconButton" type="button" onClick={() => remove(row)} aria-label={`حذف ${row.ingredientName}`}><Trash2 size={16} /></button>
            </div>;
          })}
          {!shownRows.length ? <div className="recipeListEmpty">{mode === "ingredients" ? "لا توجد مكونات بعد. أضف مثلًا البن أو الدجاج أو الصوص." : mode === "extras" ? "لا توجد إضافات بعد. أضف مثلًا شوت إضافي أو جبنة أو صوص." : "لا توجد بدائل بعد. مثال: حليب شوفان بدل الحليب العادي +1 ر.س."}</div> : null}
        </div>

        <form className="recipeQuickForm" onSubmit={submit}>
          {mode === "alternatives" ? <label className="field"><span>بديل عن</span><select name="replacesComponentId" required defaultValue=""><option value="" disabled>اختر المكوّن الأساسي</option>{baseRows.map((row) => <option value={row.id} key={row.id}>{row.ingredientName}</option>)}</select></label> : null}
          <label className="field recipeIngredientName"><span>{mode === "ingredients" ? "اسم المكوّن" : mode === "extras" ? "اسم الإضافة" : "اسم البديل"}</span><input name="ingredientName" list="recipe-ingredients" required minLength={2} placeholder={mode === "ingredients" ? "مثال: بن القهوة" : mode === "extras" ? "مثال: شوت إضافي" : "مثال: حليب شوفان"} /></label>
          <datalist id="recipe-ingredients">{products.filter((item) => item.id !== selectedProductId).map((item) => <option key={item.id} value={item.name} />)}</datalist>
          <label className="field"><span>الكمية</span><input name="quantity" type="number" min="0.001" step="0.001" required inputMode="decimal" placeholder={mode === "ingredients" ? "18" : "10"} /></label>
          <label className="field"><span>الوحدة</span><select name="unit" defaultValue="غرام"><option>غرام</option><option>كيلو</option><option>مل</option><option>لتر</option><option>حبة</option><option>قطعة</option><option>شريحة</option><option>رغيف</option></select></label>
          {mode !== "ingredients" ? <label className="field"><span>{mode === "alternatives" ? "فرق السعر" : "سعر الإضافة"}</span><input name="extraPrice" type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal" /></label> : null}
          <button className="button primary recipeAddButton" disabled={loading || (mode === "alternatives" && !baseRows.length)}><Plus size={17} /> {loading ? "جاري الحفظ..." : mode === "ingredients" ? "إضافة مكوّن" : mode === "extras" ? "حفظ الإضافة" : "حفظ البديل"}</button>
        </form>
        {mode === "alternatives" && !baseRows.length ? <div className="infoNote">أضف المكوّن الأساسي أولًا، وبعدها تقدر تضيف بديلًا له.</div> : null}
        {message ? <div className="infoNote recipeMessage">{message}</div> : null}
      </div> : null}
    </section>
  );
}
