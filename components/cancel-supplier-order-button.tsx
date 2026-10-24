"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelSupplierOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function cancel() {
    if (loading) return;
    const reason = window.prompt("سبب إلغاء طلب التوريد (8 أحرف على الأقل):");
    if (reason === null) return;
    if (reason.trim().length < 8) {
      setMessage("اذكر سببًا واضحًا لا يقل عن 8 أحرف.");
      return;
    }
    if (!window.confirm("تأكيد إلغاء طلب التوريد؟ سيتم تحرير الكميات التي كانت محسوبة قيد الوصول.")) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/purchase-orders/" + encodeURIComponent(orderId) + "/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error === "PARTIALLY_RECEIVED_ORDER"
          ? "استُلم جزء من الطلب؛ لا يمكن إلغاؤه هنا. راجع المستلم قبل إغلاق المتبقي."
          : result.error === "OWNER_REQUIRED"
            ? "الإلغاء متاح للمالك فقط."
            : "تعذر الإلغاء أو تغيّر الطلب. حدث الصفحة وراجع حالته.");
        return;
      }
      setMessage("تم إلغاء الطلب وتحديث الكميات المنتظرة.");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال، راجع حالة الطلب قبل المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  return <div style={{ display: "grid", gap: 4 }}>
    <button type="button" className="button secondary" disabled={loading} onClick={cancel}>
      <Ban size={15} /> {loading ? "جاري الإلغاء..." : "إلغاء غير المستلم"}
    </button>
    {message && <span className="mutedText">{message}</span>}
  </div>;
}
