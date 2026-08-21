"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "ACCEPT" | "CANCEL" | "RECEIVE";

const labels: Record<Action, string> = {
  ACCEPT: "قبول الطلب",
  CANCEL: "إلغاء الطلب",
  RECEIVE: "تأكيد الاستلام",
};

export function MarketplaceOrderActions({ orderId, actions }: { orderId: string; actions: Action[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<Action | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: Action) {
    setLoading(action);
    setMessage("");
    try {
      const response = await fetch(`/api/marketplace/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error === "INVALID_STATUS" ? "حالة الطلب لا تسمح بهذه العملية." : "تعذر تحديث الطلب.");
        return;
      }
      setMessage(action === "RECEIVE" ? "تم الاستلام وتحديث المخزون ✅" : action === "ACCEPT" ? "تم قبول الطلب ✅" : "تم إلغاء الطلب وإرجاع الكمية ✅");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="panelActions">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className={`button ${action === "CANCEL" ? "secondary" : "primary"}`}
          disabled={Boolean(loading)}
          onClick={() => run(action)}
        >
          {loading === action ? "جاري التنفيذ..." : labels[action]}
        </button>
      ))}
      {message && <span className="marketNotice">{message}</span>}
    </div>
  );
}
