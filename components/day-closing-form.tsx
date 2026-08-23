"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type ProductRow = { id: string; name: string; unit: string; theoretical: number };

export function DayClosingForm({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(products.map((item) => [item.id, String(item.theoretical)])));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const variance = useMemo(() => products.reduce((sum, item) => {
    const actual = Number(values[item.id] ?? item.theoretical);
    return sum + Math.abs(actual - item.theoretical);
  }, 0), [products, values]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/inventory/closing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: products.map((item) => ({ productId: item.id, actualQuantity: Number(values[item.id] ?? item.theoretical) })),
        note: form.get("note") || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage("تعذر اعتماد إقفال اليوم.");
      return;
    }
    setMessage(`تم الإقفال ✅ ${result.varianceLines} صنف لديه فرق، وتمت مزامنة المخزون مع العد الفعلي.`);
    router.refresh();
  }

  return (
    <form className="panel dayCloseForm" onSubmit={submit}>
      <div className="panelHeader"><div><span className="eyebrow">المتوقع مقابل الفعلي</span><h2>عدّ مكونات نهاية اليوم</h2></div><strong className="varianceBadge">مجموع الفروقات {variance.toLocaleString("ar-SA")}</strong></div>
      <div className="closingRows">
        {products.map((item) => {
          const actual = Number(values[item.id] ?? item.theoretical);
          const delta = actual - item.theoretical;
          return <div className={`closingRow ${Math.abs(delta) > 0.000001 ? "hasVariance" : ""}`} key={item.id}>
            <div><strong>{item.name}</strong><span>المفروض {item.theoretical.toLocaleString("ar-SA")} {item.unit}</span></div>
            <label><span>الموجود فعليًا</span><input type="number" min="0" step="0.001" inputMode="decimal" value={values[item.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
            <div className="closingDelta"><span>الفرق</span><strong>{delta > 0 ? "+" : ""}{delta.toLocaleString("ar-SA")}</strong></div>
          </div>;
        })}
      </div>
      <label className="field full"><span>ملاحظة الإقفال</span><input name="note" placeholder="مثال: إقفال وردية المساء" /></label>
      {message && <div className="infoNote">{message}</div>}
      <button className="button primary" disabled={loading || !products.length}><ClipboardCheck size={17} /> {loading ? "جاري الإقفال..." : "اعتماد إقفال اليوم"}</button>
    </form>
  );
}
