"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";
import { ProductImageInput } from "@/components/product-image-input";
import { isFoodActivity } from "@/lib/business-experience";

export function ProductCreateForm({ businessActivity }: { businessActivity: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const foodBusiness = isFoodActivity(businessActivity);
  const partsBusiness = businessActivity === "HARDWARE" || businessActivity === "ELECTRONICS";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const number = (name: string) => Number(form.get(name) || 0);

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        sku: form.get("sku") || undefined,
        barcode: form.get("barcode") || undefined,
        imageUrl: form.get("imageUrl") || undefined,
        category: form.get("category") || undefined,
        unit: form.get("unit") || "حبة",
        salePrice: number("salePrice"),
        averageCost: number("averageCost"),
        quantity: number("quantity"),
        reorderPoint: number("reorderPoint"),
        targetCoverageDays: Math.max(1, Math.round(number("targetCoverageDays") || 7)),
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error === "SKU_ALREADY_EXISTS" ? "رقم القطعة / SKU مستخدم لصنف آخر." : "تعذر إضافة المنتج. راجع البيانات.");
      setLoading(false);
      return;
    }

    const productId = result.product?.id;
    router.replace(foodBusiness && productId ? `/recipes?product=${encodeURIComponent(productId)}` : "/products");
    router.refresh();
  }

  return (
    <form className="panel onboardingForm activityProductForm" onSubmit={submit}>
      <div className="formSection">
        <div>
          <h2>{foodBusiness ? "المنتج في قائمة الكاشير" : partsBusiness ? "بيانات القطعة" : "بيانات المنتج"}</h2>
          <p>{foodBusiness ? "الصورة والاسم والسعر تظهر للكاشير. بعد الحفظ تربط المكونات والإضافات." : partsBusiness ? "رقم القطعة هو أسرع طريقة للكاشير للعثور عليها ومعرفة المتوفر." : "أضف البيانات التي يحتاجها البيع والمخزون فقط."}</p>
        </div>
      </div>

      <ProductImageInput />

      <div className="formGrid">
        <label className="field full"><span>اسم المنتج</span><input name="name" required minLength={2} placeholder={foodBusiness ? "مثال: قهوة اليوم" : partsBusiness ? "مثال: فلتر زيت كامري" : "مثال: مياه 330 مل"} /></label>
        <label className={`field ${partsBusiness ? "full" : ""}`}><span>{partsBusiness ? "رقم القطعة" : "SKU"}</span><input name="sku" required={partsBusiness} placeholder={partsBusiness ? "مثال: 90915-YZZE1" : "اختياري"} dir="ltr" /></label>
        {!foodBusiness ? <div className="field"><BarcodeInput /></div> : null}
        <label className="field"><span>التصنيف</span><input name="category" placeholder={foodBusiness ? "قهوة، مشروبات، وجبات..." : partsBusiness ? "فلاتر، فرامل، كهرباء..." : "اختياري"} /></label>
        <label className="field"><span>وحدة البيع</span><select name="unit" defaultValue="حبة"><option value="حبة">حبة / قطعة</option><option value="غرام">غرام</option><option value="كيلو">كيلو</option><option value="مل">مل</option><option value="لتر">لتر</option><option value="شريحة">شريحة</option><option value="رغيف">رغيف</option><option value="باك">باك</option><option value="كرتون">كرتون</option><option value="كيس">كيس</option><option value="صندوق">صندوق</option></select></label>
        <label className="field"><span>سعر البيع</span><input name="salePrice" required type="number" min="0" step="0.01" inputMode="decimal" /></label>
        {!foodBusiness ? <label className="field"><span>متوسط التكلفة</span><input name="averageCost" type="number" min="0" step="0.0001" defaultValue="0" inputMode="decimal" /></label> : <input type="hidden" name="averageCost" value="0" />}
        {!foodBusiness ? <label className="field"><span>الرصيد الحالي</span><input name="quantity" type="number" min="0" step="0.001" defaultValue="0" inputMode="decimal" /></label> : <input type="hidden" name="quantity" value="0" />}
        {!foodBusiness ? <label className="field"><span>نقطة إعادة الطلب</span><input name="reorderPoint" type="number" min="0" step="0.001" defaultValue="0" inputMode="decimal" /></label> : <input type="hidden" name="reorderPoint" value="0" />}
        <input type="hidden" name="targetCoverageDays" value="7" />
      </div>
      {foodBusiness ? <div className="infoNote">بعد الحفظ نفتح لك المنتج مباشرة لإضافة مثل: 18 غرام بن، 220 مل حليب، أو إضافات مثل شوت إضافي.</div> : null}
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : foodBusiness ? "حفظ والانتقال للمكونات" : "حفظ المنتج"}</button></div>
    </form>
  );
}
