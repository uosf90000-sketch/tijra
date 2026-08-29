"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { unitLabel } from "@/lib/unit-label";

type ProductOption = { id: string; name: string; unit: string; quantity: number };

export function WasteForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    const productId = String(form.get("productId") || "").trim();
    const quantity = Number(form.get("quantity") || 0);
    const reason = String(form.get("reason") || "").trim();

    if (!productId) {
      setMessage("اختر الصنف الذي تريد تسجيل الهدر عليه.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage("أدخل كمية هدر صحيحة أكبر من صفر.");
      return;
    }
    if (reason.length < 2) {
      setMessage("اكتب سبب الهدر بوضوح.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/inventory/waste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, quantity, reason }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error === "INSUFFICIENT_STOCK" ? "كمية الهدر أكبر من الرصيد المسجل." : result.error === "INVALID_INPUT" ? "راجع الصنف والكمية وسبب الهدر." : "تعذر تسجيل الهدر.");
      return;
    }
    setMessage("تم تسجيل الهدر وخصمه من المخزون باسم الموظف المنفذ ✅");
    event.currentTarget.reset();
    router.replace("/inventory/waste");
    router.refresh();
  }

  return (
    <form className="panel recipeForm" onSubmit={submit} noValidate>
      <div className="formGrid">
        <label className="field full"><span>المكوّن / الصنف</span><select name="productId" defaultValue=""><option value="" disabled>اختر الصنف</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} — متوفر {item.quantity.toLocaleString("ar-SA")} {unitLabel(item.unit)}</option>)}</select></label>
        <label className="field"><span>كمية الهدر</span><input name="quantity" type="number" min="0.001" step="0.001" inputMode="decimal" /></label>
        <label className="field"><span>السبب</span><input name="reason" minLength={2} placeholder="مثال: فاقد قص الشاورما / انسكاب صوص" /></label>
      </div>
      {message && <div className="infoNote">{message}</div>}
      <button className="button primary" disabled={loading}><Trash2 size={17} /> {loading ? "جاري التسجيل..." : "تسجيل الهدر"}</button>
    </form>
  );
}
