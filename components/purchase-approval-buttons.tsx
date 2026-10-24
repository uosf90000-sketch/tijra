"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PurchaseApprovalButtons({ orderId, canApprove }: { orderId: string; canApprove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!canApprove || busy) return;
    const reason = window.prompt(decision === "APPROVE" ?
      "ملاحظة الموافقة (اختياري):" : "سبب الرفض (8 أحرف على الأقل):", "");
    if (reason === null) return;
    if (decision === "REJECT" && reason.trim().length < 8) {
      setMessage("اكتب سبب رفض واضحًا لا يقل عن 8 أحرف.");
      return;
    }
    if (!window.confirm(decision === "APPROVE" ?
      "هل تؤكد الموافقة وإتاحة إرسال طلب الشراء للمورد؟" :
      "هل تؤكد رفض الطلب وإلغائه؟")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/purchase-orders/" + encodeURIComponent(orderId) + "/approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error === "INELIGIBLE_REVIEWER" ?
          "لا يسمح باعتماد طلب أنشأته بنفسك؛ يحتاج مسؤولًا آخر مخولًا." :
          "لم يُحفظ القرار؛ ربما اعتمده شخص آخر. حدّث الصفحة.");
        return;
      }
      setMessage(decision === "APPROVE" ? "تمت الموافقة. يمكن إرسال الطلب للمورد." : "تم الرفض وإلغاء الطلب.");
      router.refresh();
    } catch {
      setMessage("فشل الاتصال. تحقق من حالة الطلب قبل إعادة المحاولة.");
    } finally {
      setBusy(false);
    }
  }
  return <div style={{ display: "grid", gap: 8 }}>
    {canApprove
      ? <div className="formActions">
          <button type="button" className="button primary" disabled={busy} onClick={() => decide("APPROVE")}>اعتماد</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => decide("REJECT")}>رفض</button>
        </div>
      : <span className="mutedText">بانتظار قرار مسؤول مختلف عن منشئ الطلب</span>}
    {message && <div className="infoNote">{message}</div>}
  </div>;
}
