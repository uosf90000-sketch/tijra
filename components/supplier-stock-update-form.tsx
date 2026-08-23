"use client";

import { Minus, Plus, ScanBarcode } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";

type Listing = { id: string; name: string; barcode: string | null; quantity: number; unit: string };

export function SupplierStockUpdateForm({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get("quantity") || 0);
    const payload = {
      listingId: form.get("listingId") || undefined,
      barcode: form.get("stockBarcode") || undefined,
      delta: direction === "in" ? quantity : -quantity,
    };

    try {
      const response = await fetch("/api/marketplace/listings/stock-update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error === "INSUFFICIENT_STOCK" ? "الكمية المطلوب إخراجها أكبر من المخزون." : "تعذر تحديث المخزون.");
        return;
      }
      setMessage(`تم تحديث ${result.listing.name} · المتبقي ${Number(result.listing.quantity).toLocaleString("ar-SA")} ${result.listing.unit} ✅`);
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel workflowPanel" onSubmit={submit}>
      <div className="panelHeader"><div><span className="eyebrow"><ScanBarcode size={14} /> باركود سريع</span><h2>تحديث المخزون</h2></div></div>
      <div className="segmentedControl">
        <button type="button" className={direction === "in" ? "active" : ""} onClick={() => setDirection("in")}><Plus size={15} /> إدخال</button>
        <button type="button" className={direction === "out" ? "active" : ""} onClick={() => setDirection("out")}><Minus size={15} /> إخراج</button>
      </div>
      <div className="workflowFormGrid">
        <BarcodeInput name="stockBarcode" />
        <label>أو اختر المنتج<select name="listingId" defaultValue=""><option value="">اختيار بالباركود</option>{listings.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.quantity.toLocaleString("ar-SA")} {item.unit}</option>)}</select></label>
        <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required inputMode="decimal" /></label>
      </div>
      <button className="button primary" disabled={loading || !listings.length}>{loading ? "جاري التحديث..." : direction === "in" ? "إضافة للمخزون" : "إخراج من المخزون"}</button>
      {message ? <div className="infoNote">{message}</div> : null}
    </form>
  );
}
