"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SmartOrderButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function createOrders() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/purchase-orders/smart", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage("تعذر إنشاء الطلبات الآن.");
      return;
    }
    if (!result.orders?.length) {
      setMessage("لا توجد أصناف تحتاج طلبًا ولها أسعار موردين حاليًا.");
      return;
    }
    setMessage(`تم إنشاء ${result.orders.length} طلب شراء حسب المورد.`);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button className="button primary" onClick={createOrders} disabled={loading}><Send size={17} /> {loading ? "جاري الإنشاء..." : "إنشاء الطلبات"}</button>
      {message && <span className="mutedText">{message}</span>}
    </div>
  );
}
