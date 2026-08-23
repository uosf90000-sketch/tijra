"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RepeatOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function repeat() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/marketplace/orders/${orderId}/repeat`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        if (String(data.error || "").includes("INSUFFICIENT_STOCK")) setMessage("الكمية السابقة غير متوفرة الآن.");
        else if (String(data.error || "").includes("BELOW_MINIMUM")) setMessage("الحد الأدنى للمورد تغيّر.");
        else setMessage("تعذر إعادة الطلب بنفس الكميات الحالية.");
        return;
      }
      setMessage("تم إنشاء الطلب الجديد وحجز الكمية ✅");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inlineActionStack">
      <button type="button" className="button primary compact" onClick={repeat} disabled={loading}>
        <RotateCcw size={15} /> {loading ? "جاري الإعادة..." : "إعادة الطلب"}
      </button>
      {message ? <small className="mutedText">{message}</small> : null}
    </div>
  );
}
