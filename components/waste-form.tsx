"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ProductOption = { id: string; name: string; unit: string; quantity: number };

export function WasteForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/inventory/waste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: form.get("productId"),
        quantity: Number(form.get("quantity") || 0),
        reason: form.get("reason"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error === "INSUFFICIENT_STOCK" ? "كمية الهدر أكبر من الرصيد المسجل." : "تعذر تسجيل الهدر.");
      return;
    }
    setMessage("تم تسجيل الهدر وخصمه من المخزون باسم الموظف المنفذ ✅");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="panel recipeForm" onSubmit={submit}>
      <div className="formGrid">
        <label className="field full"><span>المكوّن / الصنف</span><select name="productId" required defaultValue=""><option value="" disabled>اختر الصنف</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} — متوفر {item.quantity.toLocaleString("ar-SA")} {item.unit}</option>)}</select></label>
        <label className="field"><span>كمية الهدر</span><input name="quantity" type="number" min="0.001" step="0.001" required inputMode="decimal" /></label>
        <label className="field"><span>السبب</span><input name="reason" required minLength={2} placeholder="مثال: فاقد قص الشاورما / انسكاب صوص" /></label>
      </div>
      {message && <div className="infoNote">{message}</div>}
      <button className="button primary" disabled={loading}><Trash2 size={17} /> {loading ? "جاري التسجيل..." : "تسجيل الهدر"}</button>
    </form>
  );
}
