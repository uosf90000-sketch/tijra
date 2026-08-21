"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
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
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error === "SUPPLIER_ACCOUNT_REQUIRED" ? "هذه الصفحة لحساب المورد." : "راجع بيانات المنتج وحاول مرة أخرى.");
        return;
      }
      setMessage("تم نشر المنتج في السوق ✅");
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="marketForm" onSubmit={submit}>
      <div className="marketFormGrid">
        <label>اسم المنتج<input name="name" required minLength={2} /></label>
        <label>قسم السوق<select name="activity" defaultValue="GROCERY" required>{activities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>التصنيف الفرعي<input name="category" placeholder="مثال: مشروبات غازية" /></label>
        <label>الباركود<input name="barcode" inputMode="numeric" /></label>
        <label>SKU<input name="sku" dir="ltr" /></label>
        <label>سعر البيع للتاجر<input name="price" type="number" step="0.01" min="0.01" required /></label>
        <label>الكمية المتوفرة<input name="quantity" type="number" step="0.001" min="0" required /></label>
        <label>الحد الأدنى للطلب<input name="minOrderQty" type="number" step="0.001" min="0.001" defaultValue="1" required /></label>
        <label>الوحدة<input name="unit" defaultValue="piece" required /></label>
      </div>
      <button className="button primary" disabled={loading}>{loading ? "جاري النشر..." : "نشر المنتج في السوق"}</button>
      {message && <div className="infoNote">{message}</div>}
    </form>
  );
}
