"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ListingOption = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
};

export function SupplierInventoryAuditForm({ listings }: { listings: ListingOption[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const form = new FormData(event.currentTarget);
    const listingId = String(form.get("listingId") || "");
    const countedQuantity = Number(form.get("countedQuantity") || 0);

    try {
      const response = await fetch("/api/marketplace/listings/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, countedQuantity }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error === "LISTING_NOT_FOUND" ? "المنتج غير موجود في مخزون المورد." : "تعذر حفظ نتيجة الجرد.");
        return;
      }

      const delta = Number(result.delta || 0);
      const deltaText = delta === 0 ? "الكمية مطابقة" : delta > 0 ? `زيادة ${delta.toLocaleString("ar-SA")}` : `نقص ${Math.abs(delta).toLocaleString("ar-SA")}`;
      setMessage(`تم حفظ الجرد باسم حسابك ✅ ${deltaText}.`);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="marketForm externalSaleForm" onSubmit={submit}>
      <div className="marketFormGrid">
        <label>
          المنتج
          <select name="listingId" defaultValue="" required>
            <option value="" disabled>اختر المنتج المراد جرده</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.name} — المسجل {listing.quantity.toLocaleString("ar-SA")} {listing.unit}
              </option>
            ))}
          </select>
        </label>
        <label>
          الكمية الفعلية بعد العد
          <input name="countedQuantity" type="number" min="0" step="0.001" required inputMode="decimal" placeholder="مثال: 48" />
        </label>
      </div>

      <div className="externalSaleActions">
        <button className="button primary" disabled={loading || !listings.length}>
          <ClipboardCheck size={17} /> {loading ? "جاري حفظ الجرد..." : "اعتماد نتيجة الجرد"}
        </button>
        <span>يسجل تِجرا تلقائيًا اسم الموظف الذي اعتمد الجرد ووقت التنفيذ والفرق.</span>
      </div>

      {message && <div className="infoNote" style={{ color: "#176b3a", background: "#edf8f1" }}>{message}</div>}
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
    </form>
  );
}
