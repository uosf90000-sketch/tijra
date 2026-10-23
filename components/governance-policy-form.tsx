"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type GovernancePolicyValue = {
  purchaseApprovalEnabled: boolean;
  purchaseApprovalThreshold: number;
  payrollDualApprovalEnabled: boolean;
  stockReasonRequired: boolean;
  stockValueReviewThreshold: number;
  expenseOwnerThreshold: number;
};

export function GovernancePolicyForm({ initial }: { initial: GovernancePolicyValue }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function set<K extends keyof GovernancePolicyValue>(key: K, value: GovernancePolicyValue[K]) {
    setPolicy((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (loading) return;
    if (!window.confirm("تأكيد تعديل سياسات الحوكمة؟ سيُحفظ سجل بالتغييرات واسم المالك.")) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await fetch("/api/governance/policy", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!result.ok) throw new Error("POLICY_UPDATE_FAILED");
      setMessage("حُفظت سياسات المنشأة وسُجلت التغييرات في سجل التدقيق.");
      router.refresh();
    } catch {
      setMessage("تعذر حفظ السياسة. راجع الحدود وصلاحية الحساب.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="panel" style={{ display: "grid", gap: 16 }}>
    <div className="panelHeader"><div><span className="eyebrow">السياسات الإلزامية</span><h2>التحكم في الموافقات والعمليات الحساسة</h2></div></div>
    <div className="formGrid">
      <label className="field"><span>سقف مشتريات يحتاج موافقة (ر.س)</span>
        <input type="number" min="0" max="999999999" step="0.01"
          value={policy.purchaseApprovalThreshold}
          onChange={(event) => set("purchaseApprovalThreshold", Number(event.target.value))} /></label>
      <label className="field"><span>حد حركة مخزون تتطلب مشرفًا (ر.س بحسب متوسط التكلفة)</span>
        <input type="number" min="0" max="999999999" step="0.01"
          value={policy.stockValueReviewThreshold}
          onChange={(event) => set("stockValueReviewThreshold", Number(event.target.value))} /></label>
      <label className="field"><span>حد المصروف الذي يسجله المالك فقط (ر.س)</span>
        <input type="number" min="0" max="999999999" step="0.01"
          value={policy.expenseOwnerThreshold}
          onChange={(event) => set("expenseOwnerThreshold", Number(event.target.value))} /></label>
    </div>
    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <input type="checkbox" checked={policy.purchaseApprovalEnabled}
        onChange={(event) => set("purchaseApprovalEnabled", event.target.checked)}/>
      <span>لا يُرسل طلب شراء فوق الحد للمورد إلا بعد موافقة مدير/مالك آخر</span>
    </label>
    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <input type="checkbox" checked={policy.payrollDualApprovalEnabled}
        onChange={(event) => set("payrollDualApprovalEnabled", event.target.checked)}/>
      <span>فصل منشئ مسير الرواتب عن المعتمد، وفصل المعتمد عن مُثبت الدفع</span>
    </label>
    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <input type="checkbox" checked={policy.stockReasonRequired}
        onChange={(event) => set("stockReasonRequired", event.target.checked)}/>
      <span>سبب إلزامي لكل إدخال وإخراج سريع للمخزون</span>
    </label>
    <p className="policyNote">هذه سياسات لبعض نقاط الدخول الحساسة. ليست بديلًا عن صلاحيات الفروع التفصيلية أو المراجعة القانونية أو ضوابط البنك الفعلية. إيقاف السياسة يخضع لصلاحية المالك ويُسجل في التدقيق.</p>
    {message && <div className="infoNote">{message}</div>}
    <div className="formActions"><button className="button primary" type="button" disabled={loading} onClick={save}>
      {loading ? "جاري الحفظ..." : "حفظ سياسات الحوكمة"}
    </button></div>
  </section>;
}
