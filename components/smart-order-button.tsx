"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SmartOrderButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function createOrders() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/purchase-orders/smart", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error === "CONCURRENT_PURCHASE_CHANGE"
          ? "تغيرت المشتريات أثناء العملية. حدّث الصفحة وراجع الطلبات قبل المحاولة."
          : "تعذر إنشاء الطلبات الآن.");
        return;
      }
      if (!result.orders?.length) {
        setMessage("الاحتياج مغطى بالمخزون أو بطلبات شراء مفتوحة، أو لا يوجد سعر مورد مسجل.");
        router.refresh();
        return;
      }
      setMessage(`تم إنشاء ${result.orders.length} طلب شراء حسب المورد. الطلبات فوق سقف الموافقة تنتظر اعتماد الإدارة قبل إرسالها.`);
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال. راجع سجل الطلبات قبل المحاولة لتجنب التكرار.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button className="button primary" onClick={createOrders} disabled={loading}><Send size={17} /> {loading ? "جاري الإنشاء..." : "إنشاء الطلبات"}</button>
      {message && <span className="mutedText">{message}</span>}
    </div>
  );
}
