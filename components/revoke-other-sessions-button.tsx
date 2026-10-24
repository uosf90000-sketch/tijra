"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeOtherSessionsButton({ activeCount }: { activeCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function revoke() {
    if (busy) return;
    if (!window.confirm("هل تريد إنهاء جلسات دخول حسابك على بقية الأجهزة؟ ستبقى جلستك الحالية فقط.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/governance/sessions/revoke-others", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("FAILED");
      setMessage("أُنهيت " + data.revokedSessions + " جلسة أخرى.");
      router.refresh();
    } catch {
      setMessage("تعذر تنفيذ الطلب. لم نتأكد من إنهاء الجلسات.");
    } finally { setBusy(false); }
  }
  return <div className="panel" style={{ display: "grid", gap: 12 }}>
    <div className="panelHeader"><div><span className="eyebrow">أمان الحساب</span><h2>جلسات تسجيل الدخول</h2></div></div>
    <div className="infoNote">الجلسات الحالية لحسابك: {activeCount}. يمكنك إنهاء بقية جلسات الحساب فورًا عند الاشتباه في دخول غير معروف.</div>
    <div className="formActions"><button className="button secondary" type="button" onClick={revoke} disabled={busy}>
      {busy ? "جاري إنهاء الجلسات..." : "إنهاء الجلسات الأخرى"}
    </button></div>
    {message && <div className="infoNote">{message}</div>}
  </div>;
}
