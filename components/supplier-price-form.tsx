"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Option = { id: string; name: string };

export function SupplierPriceForm({ suppliers, products }: { suppliers: Option[]; products: Option[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/supplier-offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplierId: form.get("supplierId"),
        productId: form.get("productId"),
        supplierSku: form.get("supplierSku") || undefined,
        price: Number(form.get("price") || 0),
        minOrderQty: form.get("minOrderQty") ? Number(form.get("minOrderQty")) : undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error === "SUPPLIER_OR_PRODUCT_NOT_FOUND" ? "المورد أو الصنف غير موجود في منشأتك." : "تعذر حفظ السعر.");
      setLoading(false);
      return;
    }
    router.replace("/suppliers");
    router.refresh();
  }

  if (!suppliers.length || !products.length) {
    return <div className="panel"><div className="infoNote">أضف موردًا وصنفًا واحدًا على الأقل قبل تسجيل الأسعار.</div></div>;
  }

  return (
    <form className="panel onboardingForm" onSubmit={submit}>
      <div className="formSection"><div><h2>تسجيل سعر</h2><p>يستخدم تِجرا هذه الأسعار عند المقارنة واقتراح الطلبية.</p></div></div>
      <div className="formGrid">
        <label className="field"><span>المورد</span><select name="supplierId" required>{suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>الصنف</span><select name="productId" required>{products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>السعر</span><input name="price" required type="number" min="0" step="0.01" /></label>
        <label className="field"><span>الحد الأدنى للطلب</span><input name="minOrderQty" type="number" min="0" step="0.001" /></label>
        <label className="field full"><span>رمز الصنف لدى المورد (اختياري)</span><input name="supplierSku" dir="ltr" /></label>
      </div>
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}>{loading ? "جاري الحفظ..." : "حفظ السعر"}</button></div>
    </form>
  );
}
