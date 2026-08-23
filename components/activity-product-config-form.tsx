"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { isFoodActivity } from "@/lib/business-experience";

type ProductOption = { id: string; name: string; barcode: string | null; unit: string; quantity: number };

export function ActivityProductConfigForm({ products, businessActivity }: { products: ProductOption[]; businessActivity: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const foodBusiness = isFoodActivity(businessActivity);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage(""); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/inventory/product-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: form.get("productId"),
        saleMode: form.get("saleMode"),
        size: form.get("size") || undefined,
        color: form.get("color") || undefined,
        variantGroup: form.get("variantGroup") || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(result.error === "RECIPES_NOT_AVAILABLE_FOR_ACTIVITY" ? "الوصفات متاحة للمطاعم والمقاهي فقط." : "تعذر حفظ إعداد المنتج.");
      return;
    }
    setMessage("تم حفظ طريقة البيع وسيستخدمها الكاشير.");
    router.refresh();
  }

  return <form className="panel marketForm" onSubmit={submit}>
    <div className="panelHeader"><div><span className="eyebrow">تخصيص النشاط</span><h2>طريقة بيع المنتج</h2></div><Save size={20} /></div>
    <div className="marketFormGrid">
      <label>المنتج<select name="productId" required defaultValue=""><option value="" disabled>اختر المنتج</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>طريقة البيع<select name="saleMode" defaultValue={foodBusiness ? "RECIPE" : "STANDARD"}>
        <option value="STANDARD">قطعة / كمية عادية</option>
        <option value="WEIGHT">وزن وكسور</option>
        <option value="SERIAL">قطعة برقم Serial / IMEI</option>
        {foodBusiness ? <option value="RECIPE">منتج مطعم / مقهى بمكونات</option> : null}
        <option value="SERVICE">خدمة بدون مخزون</option>
      </select></label>
      <label>المقاس<input name="size" placeholder="اختياري — مثل L أو 42" /></label>
      <label>اللون<input name="color" placeholder="اختياري" /></label>
      <label className="full">مجموعة المتغيرات<input name="variantGroup" placeholder="اختياري — مثال: تيشيرت موديل 2026" /></label>
    </div>
    {message ? <div className="infoNote" style={{ color: "#176b3a", background: "#edf8f1" }}>{message}</div> : null}
    {error ? <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div> : null}
    <button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ إعداد المنتج"}</button>
  </form>;
}
