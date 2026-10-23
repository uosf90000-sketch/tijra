"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PayrollRun = {
  id: string;
  status: string;
  createdByUserId: string | null;
  approvedByUserId: string | null;
};

export function PayrollGovernanceActions({
  run, actorId, role, dualApproval,
}: {
  run: PayrollRun; actorId: string; role: string; dualApproval: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canApprove = run.status === "DRAFT" &&
    ["OWNER", "ACCOUNTANT"].includes(role) &&
    (!dualApproval || Boolean(run.createdByUserId && run.createdByUserId !== actorId));
  const canMarkPaid = run.status === "APPROVED" &&
    ["OWNER", "ACCOUNTANT"].includes(role) &&
    (!dualApproval || (role === "OWNER" && run.approvedByUserId !== actorId));

  async function update(action: "APPROVE" | "MARK_PAID") {
    if (busy) return;
    const reference = action === "MARK_PAID"
      ? window.prompt("أدخل رقم مرجع التحويل البنكي أو المستند المحاسبي (4 أحرف على الأقل):")
      : null;
    if (action === "MARK_PAID" && (!reference || reference.trim().length < 4)) {
      setMessage("مرجع الإثبات مطلوب. هذه الخطوة لا تحول أموالًا بالفعل.");
      return;
    }
    if (!window.confirm(action === "APPROVE"
      ? "تأكيد مراجعة مسير الرواتب واعتماده؟"
      : "تأكيد تسجيل المسير كمدفوع بناءً على إثبات دفع تمت مراجعته خارج تِجرا؟")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/payroll/runs/" + encodeURIComponent(run.id) + "/status", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reference: reference?.trim() || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error === "SECOND_REVIEWER_REQUIRED"
          ? "المسير يحتاج مسؤولًا آخر غير منشئه لاعتماده."
          : result.error === "SECOND_PAYMENT_CHECKER_REQUIRED"
            ? "إثبات الدفع يجب أن يسجله مسؤول غير معتمد المسير."
            : "تعذر تسجيل القرار. راجع حالة المسير والصلاحيات.");
        return;
      }
      setMessage(action === "APPROVE" ? "تم اعتماد المسير." : "تم تسجيل إثبات الدفع؛ لم يُجر أي تحويل بنكي من تِجرا.");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال. تحقق من حالة المسير قبل إعادة المحاولة.");
    } finally { setBusy(false); }
  }

  if (!canApprove && !canMarkPaid) return <span className="mutedText">{run.status === "PAID" ? "مغلق" : "ينتظر مسؤولًا مخولًا"}</span>;
  return <div style={{ display: "grid", gap: 5 }}>
    {canApprove && <button type="button" className="button secondary" disabled={busy}
      onClick={() => update("APPROVE")}>اعتماد المسير</button>}
    {canMarkPaid && <button type="button" className="button secondary" disabled={busy}
      onClick={() => update("MARK_PAID")}>تسجيل إثبات الدفع</button>}
    {message && <span className="mutedText">{message}</span>}
  </div>;
}
