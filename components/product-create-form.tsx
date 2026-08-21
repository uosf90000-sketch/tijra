"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ProductCreateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setError(result.error === "SKU_ALREADY_EXISTS" ? "رمز SKU مستخدم لصنف آخر." : "تعذر إضافة الصنف. راجع البيانات.");
      setLoading(false);
      return;
    }

    router.replace("/inventory");
    router.refresh();
  }

  return (
    <form className="panel onboardingForm" onSubmit={submit}>
      <div className="formSection">
        <div><h2>بيانات الصنف</h2><p>الرصيد الافتتاحي يُسجل كحركة مخزون مستقلة للحفاظ على سجل صحيح.</p></div>
      </div>
      <div className="formGrid">
        <label className="field full"><span>اسم الصنف</span><input name="name" required minLength={2} placeholder="مثال: مياه 330 مل" /></label>
        <label className="field"><span>SKU</span><input name="sku" placeholder="اختياري" dir="ltr" /></label>
        <label className="field"><span>الباركود</span><input name="barcode" placeholder="اختياري" dir="ltr" inputMode="numeric" /></label>
        <label className="field"><span>التصنيف</span><input name="category" placeholder="مشروبات، ألبان..." /></label>
        <label className="field"><span>الوحدة</span><input name="unit" defaultValue="حبة" /></label>
        <label className="field"><span>سعر البيع</span><input name="salePrice" required type="number" min="0" step="0.01" inputMode="decimal" /></label>
        <label className="field"><span>متوسط التكلفة</span><input name="averageCost" type="number" min="0" step="0.01" defaultValue="0" inputMode="decimal" /></label>
        <label className="field"><span>الرصيد الحالي</span><input name="quantity" type="number" min="0" step="0.001" defaultValue="0" inputMode="decimal" /></label>
        <label className="field"><span>نقطة إعادة الطلب</span><input name="reorderPoint" type="number" min="0" step="0.001" defaultValue="0" inputMode="decimal" /></label>
        <label className="field"><span>التغطية المستهدفة بالأيام</span><input name="targetCoverageDays" type="number" min="1" max="60" defaultValue="7" inputMode="numeric" /></label>
      </div>
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ الصنف"}</button></div>
    </form>
  );
}
