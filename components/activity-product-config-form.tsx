"use client";

import { Save } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFoodActivity } from "@/lib/business-experience";

type ProductOption = { id: string; name: string; barcode: string | null; unit: string; quantity: number };
type SaleMode = "STANDARD" | "WEIGHT" | "SERIAL" | "RECIPE" | "SERVICE";

const modeLabels: Record<SaleMode, string> = {
  STANDARD: "قطعة / كمية عادية",
  WEIGHT: "بيع بالوزن والكسور",
  SERIAL: "قطعة برقم Serial / IMEI",
  RECIPE: "منتج بمكونات",
  SERVICE: "خدمة بدون مخزون",
};

function allowedModes(activity: string): SaleMode[] {
  if (isFoodActivity(activity)) return ["STANDARD", "RECIPE", "SERVICE"];
  if (activity === "ELECTRONICS") return ["STANDARD", "SERIAL", "SERVICE"];
  if (activity === "BEAUTY") return ["STANDARD", "SERVICE"];
  if (activity === "GROCERY") return ["STANDARD", "WEIGHT"];
  if (activity === "HARDWARE") return ["STANDARD", "SERIAL"];
  if (activity === "FASHION" || activity === "PHARMACY" || activity === "OFFICE") return ["STANDARD"];
  return ["STANDARD", "WEIGHT", "SERIAL", "SERVICE"];
}

export function ActivityProductConfigForm({ products, businessActivity }: { products: ProductOption[]; businessActivity: string }) {
  const router = useRouter();
  const modes = useMemo(() => allowedModes(businessActivity), [businessActivity]);
  const fashion = businessActivity === "FASHION";
  const foodBusiness = isFoodActivity(businessActivity);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/inventory/product-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: form.get("productId"),
        saleMode: form.get("saleMode"),
        size: fashion ? form.get("size") || undefined : undefined,
        color: fashion ? form.get("color") || undefined : undefined,
        variantGroup: fashion ? form.get("variantGroup") || undefined : undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      if (result.error === "RECIPE_MODE_NOT_ALLOWED" || result.error === "RECIPES_NOT_AVAILABLE_FOR_ACTIVITY") setError("المكونات متاحة للمطاعم والمقاهي فقط.");
      else if (result.error === "OWNER_REQUIRED") setError("هذا الإعداد متاح لمالك المنشأة فقط.");
      else setError("تعذر حفظ إعداد المنتج.");
      return;
    }
    setMessage("تم حفظ طريقة البيع وسيطبقها الكاشير تلقائيًا ✅");
    router.refresh();
  }

  return (
    <form className="panel marketForm" onSubmit={submit}>
      <div className="panelHeader"><div><span className="eyebrow">تخصيص بسيط</span><h2>كيف يباع هذا المنتج؟</h2></div><Save size={20} /></div>
      <div className="marketFormGrid">
        <label>المنتج<select name="productId" required defaultValue=""><option value="" disabled>اختر المنتج</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>طريقة البيع<select name="saleMode" defaultValue="STANDARD">{modes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
        {fashion ? <>
          <label>المقاس<input name="size" placeholder="مثال: L أو 42" /></label>
          <label>اللون<input name="color" placeholder="مثال: أسود" /></label>
          <label className="full">الموديل / مجموعة المنتج<input name="variantGroup" placeholder="مثال: تيشيرت موديل 2026" /></label>
        </> : null}
      </div>
      {foodBusiness ? <div className="infoNote">المكونات والإضافات تُضبط من صفحة «المكونات والإضافات». الكاشير لا يرى كميات الوصفة.</div> : null}
      {businessActivity === "ELECTRONICS" ? <div className="infoNote">فعّل Serial / IMEI فقط للأجهزة التي تحتاج رقمًا فريدًا عند البيع.</div> : null}
      {error ? <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div> : null}
      {message ? <div className="infoNote">{message}</div> : null}
      <button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ"}</button>
    </form>
  );
}
