"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";

type Product = { id: string; name: string; barcode: string | null; quantity: number; unit: string };

export function StoreStockCountForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      productId: form.get("productId") || undefined,
      barcode: form.get("countBarcode") || undefined,
      countedQuantity: Number(form.get("countedQuantity") || 0),
    };
    try {
      const response = await fetch("/api/inventory/count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error === "PRODUCT_NOT_FOUND" ? "ما لقينا الصنف." : "تعذر حفظ الجرد.");
        return;
      }
      const delta = Number(result.delta || 0);
      setMessage(delta === 0 ? "الجرد مطابق للمخزون ✅" : `تم حفظ الجرد · الفرق ${delta > 0 ? "+" : ""}${delta.toLocaleString("ar-SA")} ✅`);
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel workflowPanel" onSubmit={submit}>
      <div className="panelHeader"><div><span className="eyebrow"><ClipboardCheck size={14} /> جرد المتجر</span><h2>مسح وعدّ سريع</h2></div></div>
      <div className="workflowFormGrid">
        <BarcodeInput name="countBarcode" />
        <label>أو اختر الصنف<select name="productId" defaultValue=""><option value="">اختيار بالباركود</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} — مسجل {item.quantity.toLocaleString("ar-SA")} {item.unit}</option>)}</select></label>
        <label>الكمية الفعلية<input name="countedQuantity" type="number" min="0" step="0.001" required inputMode="decimal" /></label>
      </div>
      <button className="button primary" disabled={loading || !products.length}>{loading ? "جاري الحفظ..." : "تسجيل نتيجة الجرد"}</button>
      {message ? <div className="infoNote">{message}</div> : null}
    </form>
  );
}
