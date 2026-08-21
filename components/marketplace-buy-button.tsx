"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarketplaceBuyButton({ listingId, minOrderQty, available }: { listingId: string; minOrderQty: number; available: number }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(Math.max(1, minOrderQty));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function buy() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/marketplace/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, quantity }),
      });
      const data = await response.json();
      if (!response.ok) {
        const labels: Record<string, string> = {
          BELOW_MINIMUM: "الكمية أقل من الحد الأدنى للطلب.",
          INSUFFICIENT_STOCK: "الكمية المطلوبة أكبر من مخزون المورد.",
          SELF_ORDER_NOT_ALLOWED: "لا يمكنك الشراء من منشأتك نفسها.",
          RETAILER_ACCOUNT_REQUIRED: "هذه العملية متاحة لحساب التاجر.",
        };
        setMessage(labels[data.error] ?? "تعذر إنشاء الطلب.");
        return;
      }
      setMessage("تم إرسال الطلب للمورد ✅");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="marketBuy">
      <div className="marketBuyRow">
        <input
          aria-label="الكمية"
          type="number"
          min={minOrderQty}
          max={available}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
        />
        <button className="button primary" type="button" onClick={buy} disabled={loading || available < minOrderQty}>
          {loading ? "جاري الطلب..." : "شراء من المورد"}
        </button>
      </div>
      <div className="marketNotice">الحد الأدنى {minOrderQty.toLocaleString("ar-SA")} · المتوفر {available.toLocaleString("ar-SA")}{message ? ` · ${message}` : ""}</div>
    </div>
  );
}
