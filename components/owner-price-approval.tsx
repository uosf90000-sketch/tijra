"use client";

import { CheckCircle2, Save, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatSar } from "@/lib/format";

type PriceCase = {
  id: string;
  name: string;
  salePrice: number;
  averageCost: number;
  marginPercent: number;
  suggestedPrice: number;
  minimumPrice: number;
};

export function OwnerPriceApproval({ product }: { product: PriceCase }) {
  const router = useRouter();
  const [newPrice, setNewPrice] = useState(String(product.suggestedPrice));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/products/pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          newSalePrice: Number(newPrice),
          expectedSalePrice: product.salePrice,
          expectedAverageCost: product.averageCost,
          reason: reason.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error === "STALE_PRICE_OR_COST"
          ? "تغير السعر أو التكلفة منذ فتح الصفحة. حدّث الصفحة وراجع الأرقام قبل الاعتماد."
          : result.error === "UNCHANGED_PRICE"
            ? "السعر المختار يساوي السعر الحالي."
            : result.error === "OWNER_REQUIRED"
              ? "تعديل سعر البيع متاح لمالك المنشأة فقط."
              : "تعذر اعتماد السعر. راجع القيمة والسبب.");
        return;
      }
      setMessage("تم اعتماد سعر البيع الجديد وحفظ السبب في سجل الرقابة.");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال. لا تفترض نجاح التعديل قبل التحقق من سجل المنتج.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="panel" id={"product-" + product.id}>
      <div className="panelHeader"><div>
        <span className="eyebrow"><ShieldAlert size={16} /> تنبيه هامش الربح</span>
        <h2>{product.name}</h2>
      </div></div>
      <div className="infoNote">
        تكلفة الوحدة {formatSar(product.averageCost)} · سعر البيع الحالي {formatSar(product.salePrice)} ·
        هامش إجمالي تقريبي {product.marginPercent.toFixed(1)}%.
        السعر المقترح لهامش 25% هو {formatSar(product.suggestedPrice)}.
        <p>هذه معادلة هامش إجمالي مبسطة؛ قد تختلف النتيجة بعد الضريبة أو الخصومات أو تكاليف التشغيل.</p>
      </div>
      <form onSubmit={save} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div className="formGrid">
          <label className="field"><span>سعر البيع الجديد (ر.س)</span>
            <input type="number" min="0.01" step="0.01" required value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </label>
          <label className="field full"><span>سبب قرار التسعير</span>
            <textarea required minLength={8} maxLength={600} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تعديل السعر بعد ارتفاع تكلفة التوريد ومراجعة السوق" />
          </label>
        </div>
        {message && <div className="infoNote">{message}</div>}
        <div className="formActions">
          <button className="button primary" disabled={saving || reason.trim().length < 8 || !(Number(newPrice) > 0)}>
            {saving ? <Save size={16} /> : <CheckCircle2 size={16} />}
            {saving ? "جاري الاعتماد..." : "اعتماد سعر البيع"}
          </button>
        </div>
      </form>
    </article>
  );
}
