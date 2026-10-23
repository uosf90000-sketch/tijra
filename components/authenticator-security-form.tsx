"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthenticatorSecurityForm({ enabled, available }: { enabled: boolean; available: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    if (busy || !password) return;
    setBusy(true); setMessage("");
    try {
      const result = await fetch("/api/auth/mfa", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(data.error);
      setSecret(data.secret);
      setUri(data.provisioningUri);
      setMessage("أضف المفتاح إلى تطبيق المصادقة ثم أدخل الرمز الذي يظهر فيه.");
    } catch {
      setMessage("لم يبدأ إعداد المصادقة. تأكد من كلمة المرور وتجهيز مفتاح تشفير الخادم.");
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      setSecret(""); setUri(""); setCode(""); setPassword("");
      setMessage("تم تفعيل المصادقة الثنائية. من تسجيل الدخول القادم ستحتاج كلمة المرور والرمز.");
      router.refresh();
    } catch {
      setMessage("الرمز لم يُقبل أو انتهت صلاحيته. تأكد أن وقت جهازك صحيح.");
    } finally { setBusy(false); }
  }

  async function disable() {
    if (busy || !window.confirm("تعطيل حماية المصادقة الثنائية؟ ستنتهي جلسات حسابك على الأجهزة الأخرى.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, code }),
      });
      if (!response.ok) throw new Error("INVALID_AUTH");
      setPassword(""); setCode("");
      setMessage("تم تعطيل المصادقة الثنائية للحساب. راجع سياسة الأمان في منشأتك.");
      router.refresh();
    } catch {
      setMessage("تعذر التعطيل؛ يلزم كلمة المرور والرمز الحالي.");
    } finally { setBusy(false); }
  }

  return <section className="panel" style={{ display: "grid", gap: 13 }}>
    <div className="panelHeader"><div>
      <span className="eyebrow">حماية الحساب</span>
      <h2>المصادقة الثنائية بتطبيق Authenticator</h2>
    </div></div>
    <div className="infoNote">
      الحالة: {enabled ? "مفعلة" : "غير مفعلة"}.
      {available ? " يمكنك استخدام أي تطبيق يدعم رمز TOTP ذي الستة أرقام." :
        " يلزم مسؤول استضافة تِجرا إعداد مفتاح MFA_ENCRYPTION_KEY آمن في بيئة الخادم أولًا."}
    </div>
    {!enabled && available && !secret && <div style={{ display: "grid", gap: 10 }}>
      <label className="field"><span>أعد إدخال كلمة المرور للبدء</span>
        <input type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}/></label>
      <div className="formActions"><button type="button" className="button primary" onClick={start} disabled={busy || !password}>بدء تفعيل المصادقة</button></div>
    </div>}
    {secret && !enabled && <>
      <div className="infoNote">المفتاح السري — أدخله يدويًا في تطبيق المصادقة، ولا تشاركه مع أي شخص:</div>
      <input value={secret} readOnly dir="ltr" aria-label="مفتاح المصادقة السري" />
      <details><summary>رابط الإضافة اليدوي للتطبيق</summary>
        <code style={{ overflowWrap: "anywhere" }}>{uri}</code>
      </details>
    </>}
    {(secret || enabled) && <div style={{ display: "grid", gap: 10 }}>
      {enabled && <label className="field"><span>كلمة المرور للتعطيل فقط</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      <label className="field"><span>رمز التطبيق المكوّن من 6 أرقام</span>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} dir="ltr"/></label>
      <div className="formActions">
        {!enabled
          ? <button type="button" className="button primary" disabled={busy || code.length !== 6} onClick={confirm}>تأكيد التفعيل</button>
          : <button type="button" className="button secondary" disabled={busy || !password || code.length !== 6} onClick={disable}>تعطيل المصادقة الثنائية</button>}
      </div>
    </div>}
    {message && <div className="infoNote">{message}</div>}
    <p className="policyNote">قبل التفعيل احفظ وسيلة استعادة حساب آمنة مع مسؤول المنشأة. هذه النسخة لا تتضمن بعد أكواد استرداد للطوارئ أو تسجيل دخول مؤسسي موحد.</p>
  </section>;
}
