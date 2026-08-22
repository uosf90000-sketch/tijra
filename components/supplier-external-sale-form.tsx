"use client";

import { MinusCircle, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";

type ListingOption = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
};

export function SupplierExternalSaleForm({ listings }: { listings: ListingOption[] }) {
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
    const payload = {
      listingId: form.get("listingId") || undefined,
      barcode: form.get("externalSaleBarcode") || undefined,
      quantity: Number(form.get("quantity") || 0),
    };

    try {
      const response = await fetch("/api/marketplace/listings/external-sale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.error === "LISTING_NOT_FOUND") setError("ما لقينا منتجًا مطابقًا لهذا الباركود. اختر المنتج من القائمة أو تأكد من الكود.");
        else if (result.error === "INSUFFICIENT_STOCK") setError(`الكمية المتوفرة فقط ${Number(result.available || 0).toLocaleString("ar-SA")}.`);
        else setError("تعذر تحديث المخزون. راجع المنتج والكمية وحاول مرة أخرى.");
        return;
      }

      setMessage(`تم خصم ${Number(result.deducted).toLocaleString("ar-SA")} من ${result.listing?.name || "المخزون"} ✅ المتبقي ${Number(result.listing?.quantity || 0).toLocaleString("ar-SA")}.`);
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
        <BarcodeInput name="externalSaleBarcode" />
        <label>
          أو اختر المنتج
          <select name="listingId" defaultValue="">
            <option value="">اختيار تلقائي من الباركود</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.name} — متوفر {listing.quantity.toLocaleString("ar-SA")} {listing.unit}
              </option>
            ))}
          </select>
        </label>
        <label>
          الكمية المباعة خارج تِجرا
          <input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required inputMode="decimal" />
        </label>
      </div>

      <div className="externalSaleActions">
        <button className="button primary" disabled={loading || !listings.length}>
          <MinusCircle size={17} /> {loading ? "جاري الخصم..." : "خصم من المخزون"}
        </button>
        <span><ScanLine size={15} /> امسح الباركود بعد أي بيع خارج التطبيق حتى يبقى المخزون دقيقًا للتجار.</span>
      </div>

      {message && <div className="infoNote" style={{ color: "#176b3a", background: "#edf8f1" }}>{message}</div>}
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
    </form>
  );
}
