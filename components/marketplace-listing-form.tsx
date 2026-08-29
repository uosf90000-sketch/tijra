"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";

const activities = [
  ["GROCERY", "بقالة وتموينات"],
  ["ELECTRONICS", "إلكترونيات"],
  ["PHARMACY", "صيدلية"],
  ["RESTAURANT", "مطاعم"],
  ["CAFE", "مقاهي"],
  ["FASHION", "ملابس"],
  ["BEAUTY", "عناية وتجميل"],
  ["HARDWARE", "أدوات ومواد"],
  ["OFFICE", "مستلزمات مكتبية"],
  ["OTHER", "أخرى"],
] as const;

export function MarketplaceListingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: form.get("name"),
      sku: form.get("sku") || undefined,
      barcode: form.get("barcode") || undefined,
      category: form.get("category") || undefined,
      activity: form.get("activity"),
      unit: form.get("unit") || "piece",
      price: Number(form.get("price")),
      quantity: Number(form.get("quantity")),
      minOrderQty: Number(form.get("minOrderQty")),
    };

    try {
      const response = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error === "SUPPLIER_ACCOUNT_REQUIRED" ? "هذه الصفحة لحساب المورد." : "راجع بيانات المنتج وحاول مرة أخرى.");
        return;
      }
      setMessage(data.duplicate ? "المنتج منشور بالفعل؛ لم يتم إنشاء نسخة مكررة. ✅" : "تم نشر المنتج في السوق ✅");
      formElement.reset();
      router.refresh();
    } catch {
      // قد ينقطع الاتصال بعد أن تعتمد قاعدة البيانات عملية النشر. تحقق من
      // النتيجة الفعلية قبل عرض رسالة فشل حتى لا يدفع ذلك المستخدم لإعادة النشر.
      try {
        const params = new URLSearchParams();
        if (payload.barcode) params.set("barcode", String(payload.barcode));
        else if (payload.sku) params.set("sku", String(payload.sku));
        else params.set("name", String(payload.name));
        const verify = await fetch(`/api/marketplace/listings?${params.toString()}`, { cache: "no-store" });
        const verified = await verify.json().catch(() => ({}));
        if (verify.ok && verified.exists) {
          setMessage("تم نشر المنتج في السوق ✅");
          formElement.reset();
          router.refresh();
          return;
        }
      } catch {
        // verification also unavailable; keep the result explicitly uncertain.
      }
      setMessage("تعذر الاتصال بالخادم ولم نتمكن من تأكيد النشر. حدّث الصفحة قبل إعادة المحاولة.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="marketForm" onSubmit={submit}>
      <div className="marketFormGrid">
        <label>اسم المنتج الكامل<input name="name" required minLength={2} placeholder="مثال: بيبسي 330 مل × 24" /></label>
        <label>قسم السوق<select name="activity" defaultValue="GROCERY" required>{activities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>التصنيف الفرعي<input name="category" placeholder="مثال: مشروبات غازية" /></label>
        <BarcodeInput />
        <label>SKU<input name="sku" dir="ltr" placeholder="اختياري - كودك الداخلي" /></label>
        <label>سعر البيع للتاجر<input name="price" type="number" step="0.01" min="0.01" required /></label>
        <label>الكمية المتوفرة<input name="quantity" type="number" step="0.001" min="0" required /></label>
        <label>الحد الأدنى للطلب<input name="minOrderQty" type="number" step="0.001" min="0.001" defaultValue="1" required /></label>
        <label>الوحدة<select name="unit" defaultValue="piece" required><option value="piece">حبة / قطعة</option><option value="pack">عبوة / باك</option><option value="carton">كرتون</option><option value="bag">كيس</option><option value="box">صندوق</option><option value="kg">كيلو</option><option value="liter">لتر</option></select></label>
      </div>
      <div className="infoNote">اسم المنتج هو أساس البحث والمقارنة. اكتب العلامة + الحجم + العبوة بوضوح. الباركود اختياري ويستخدم للتأكد من التطابق.</div>
      <button className="button primary" disabled={loading}>{loading ? "جاري النشر..." : "نشر المنتج في السوق"}</button>
      {message && <div className="infoNote">{message}</div>}
    </form>
  );
}
