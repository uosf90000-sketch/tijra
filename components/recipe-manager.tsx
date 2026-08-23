"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ProductOption = { id: string; name: string; unit: string };
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
  extraPrice: number;
  yieldPercent: number;
};

export function RecipeManager({ products, rows }: { products: ProductOption[]; rows: RecipeRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        saleProductId: form.get("saleProductId"),
        ingredientProductId: form.get("ingredientProductId"),
        quantity: Number(form.get("quantity") || 0),
        unit: form.get("unit"),
        canRemove: form.get("canRemove") === "on",
        canExtra: form.get("canExtra") === "on",
        extraPrice: Number(form.get("extraPrice") || 0),
        yieldPercent: Number(form.get("yieldPercent") || 100),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error === "SAME_PRODUCT_NOT_ALLOWED" ? "المنتج المباع والمكوّن لا يمكن أن يكونا نفس الصنف." : "تعذر حفظ المكوّن. راجع الوحدات والكميات.");
      return;
    }
    setMessage("تم حفظ المكوّن وربطه بالكاشير ✅");
    event.currentTarget.reset();
    router.refresh();
  }

  async function remove(row: RecipeRow) {
    if (!confirm(`حذف ${row.ingredientName} من الوصفة؟`)) return;
    const params = new URLSearchParams({ saleProductId: row.saleProductId, ingredientProductId: row.ingredientProductId });
    const response = await fetch(`/api/recipes?${params.toString()}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  return (
    <>
      <form className="panel recipeForm" onSubmit={submit}>
        <div className="panelHeader"><div><span className="eyebrow">تعريف الوصفة</span><h2>اربط المنتج المباع بمكوناته</h2></div></div>
        <div className="formGrid recipeFormGrid">
          <label className="field"><span>المنتج في الكاشير</span><select name="saleProductId" required defaultValue=""><option value="" disabled>مثال: شاورما دجاج</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>المكوّن من المخزون</span><select name="ingredientProductId" required defaultValue=""><option value="" disabled>مثال: دجاج الشاورما</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
          <label className="field"><span>كمية المكوّن لكل وحدة مباعة</span><input name="quantity" type="number" min="0.001" step="0.001" required inputMode="decimal" placeholder="مثال: 10" /></label>
          <label className="field"><span>وحدة الوصفة</span><select name="unit" defaultValue="غرام"><option>غرام</option><option>كيلو</option><option>مل</option><option>لتر</option><option>حبة</option><option>قطعة</option><option>شريحة</option><option>رغيف</option></select></label>
          <label className="field"><span>نسبة الناتج بعد التحضير</span><input name="yieldPercent" type="number" min="1" max="100" step="0.1" defaultValue="100" inputMode="decimal" /><small>100% بدون فاقد. مثال 80% يعني 100 كجم خام تعطي 80 كجم جاهز.</small></label>
          <label className="field"><span>سعر الإضافة</span><input name="extraPrice" type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal" /><small>يُضاف للسعر عند اختيار «إضافي».</small></label>
          <label className="checkField"><input name="canRemove" type="checkbox" /><span>يسمح «بدون هذا المكوّن»</span></label>
          <label className="checkField"><input name="canExtra" type="checkbox" /><span>يسمح «إضافي» ويخصم كمية إضافية</span></label>
        </div>
        {message && <div className="infoNote">{message}</div>}
        <button className="button primary" disabled={loading}><Plus size={17} /> {loading ? "جاري الحفظ..." : "إضافة / تحديث المكوّن"}</button>
      </form>

      <section className="panel tablePanel recipeTablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">الوصفات الحالية</span><h2>ما الذي سيُخصم عند كل بيع؟</h2></div></div>
        <div className="tableScroll"><table className="dataTable"><thead><tr><th>المنتج المباع</th><th>المكوّن</th><th>الكمية</th><th>الناتج</th><th>تخصيص الطلب</th><th></th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td><strong>{row.saleProductName}</strong></td><td>{row.ingredientName}</td><td>{row.quantity.toLocaleString("ar-SA")} {row.unit}</td><td>{row.yieldPercent}%</td><td>{[row.canRemove ? "بدون" : "", row.canExtra ? `إضافي +${row.extraPrice.toLocaleString("ar-SA")} ر.س` : ""].filter(Boolean).join(" · ") || "ثابت"}</td><td><button className="iconButton" type="button" onClick={() => remove(row)} aria-label="حذف"><Trash2 size={16} /></button></td></tr>)}
          {!rows.length && <tr><td colSpan={6}><div className="infoNote">ابدأ بوصفة منتج مثل شاورما دجاج، ثم أضف الدجاج والخبز والصوص والجبن كمكونات.</div></td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
