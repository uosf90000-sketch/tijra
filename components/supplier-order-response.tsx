"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

export function SupplierOrderResponse({ token, closed }: { token: string; closed: boolean }) {
  const [loading, setLoading] = useState<"CONFIRM" | "DECLINE" | null>(null);
  const [message, setMessage] = useState(closed ? "هذا الطلب مغلق ولا يحتاج ردًا جديدًا." : "");

  async function respond(action: "CONFIRM" | "DECLINE") {
    if (closed || loading) return;
    setLoading(action);
    const response = await fetch("/api/public/supplier-order/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(null);
    if (!response.ok) {
      setMessage(result.error === "INVALID_OR_EXPIRED_LINK" ? "انتهت صلاحية الرابط. اطلب رابطًا جديدًا من التاجر." : "تعذر تسجيل الرد. جرّب مرة أخرى.");
      return;
    }
    setMessage(action === "CONFIRM" ? "تم تأكيد الطلب وإبلاغ التاجر داخل تِجرا." : "تم تسجيل الاعتذار عن تنفيذ الطلب.");
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
      {!closed && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button className="button primary" onClick={() => respond("CONFIRM")} disabled={Boolean(loading)}><CheckCircle2 size={18} /> {loading === "CONFIRM" ? "جاري التأكيد..." : "تأكيد الطلب"}</button>
          <button className="button secondary" onClick={() => respond("DECLINE")} disabled={Boolean(loading)}><XCircle size={18} /> {loading === "DECLINE" ? "جاري التسجيل..." : "تعذر التوريد"}</button>
        </div>
      )}
      {message && <div className="infoNote">{message}</div>}
    </div>
  );
}
