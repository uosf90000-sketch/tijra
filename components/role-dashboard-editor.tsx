"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  dashboardWidgets, permittedDashboardWidgets, type DashboardRoleKey, type DashboardWidgetKey,
} from "@/lib/role-dashboard-policy";

const roles: Array<{ role: DashboardRoleKey; label: string }> = [
  { role: "OWNER", label: "المالك / الرئيس" },
  { role: "MANAGER", label: "مدير التشغيل" },
  { role: "CASHIER", label: "الكاشير" },
  { role: "ACCOUNTANT", label: "المحاسب" },
  { role: "SUPPLIER", label: "المورد" },
  { role: "STAFF", label: "الموظف متعدد المهام" },
];

export function RoleDashboardEditor({ initial }: {
  initial: Array<{ role: DashboardRoleKey; widgetKeys: string[] }>;
}) {
  const router = useRouter();
  const [role, setRole] = useState<DashboardRoleKey>("OWNER");
  const [selected, setSelected] = useState<Record<string, DashboardWidgetKey[]>>(
    Object.fromEntries(roles.map(({ role }) => [
      role, initial.find((p) => p.role === role)?.widgetKeys?.length
        ? initial.find((p) => p.role === role)!.widgetKeys as DashboardWidgetKey[]
        : permittedDashboardWidgets({ role, permissions: [] }),
    ])),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const available = permittedDashboardWidgets({ role, permissions: [] });
  const choice = selected[role] || [];
  const toggle = (key: DashboardWidgetKey) => setSelected((prev) => ({
    ...prev, [role]: prev[role].includes(key)
      ? prev[role].filter((value) => value !== key)
      : [...prev[role], key],
  }));
  async function save() {
    if (reason.trim().length < 8 || choice.length < 1 || busy) {
      setMessage("اختر مؤشرًا واحدًا على الأقل، واكتب سبب التغيير بثمانية أحرف.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/governance/dashboards", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, widgetKeys: choice, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "SAVE_FAILED");
      setMessage("حُفظت مساحة هذا الدور. الإعدادات تحدد ظهور المؤشرات ولا تمنح صلاحيات إضافية.");
      setReason(""); router.refresh();
    } catch (error) {
      setMessage("تعذر الحفظ: " + (error instanceof Error ? error.message : "خطأ غير معروف"));
    } finally { setBusy(false); }
  }
  return <section className="panel" style={{ display: "grid", gap: 14 }}>
    <div className="panelHeader"><div><span className="eyebrow">تخصيص لوحة كل وظيفة</span>
      <h2>من يرى أي مؤشرات بعد الدخول؟</h2></div></div>
    <div className="infoNote">اختيار المؤشرات لا يضيف صلاحيات جديدة. صلاحيات العمليات تُدار من المصفوفة أدناه، ومواقع العمل تُقيد فقط عند تفعيل سياسة المواقع. الكاشير يبقى في نقطة البيع، والمدير لا يشاهد كشوف الرواتب افتراضيًا.</div>
    <label className="field"><span>وظيفة المستخدم</span>
      <select value={role} onChange={(event) => { setRole(event.target.value as DashboardRoleKey); setMessage(""); }}>
        {roles.map((item) => <option key={item.role} value={item.role}>{item.label}</option>)}
      </select></label>
    <div className="ownerHubGrid">
      {dashboardWidgets.filter((item) => available.includes(item.key)).map((item) =>
        <label key={item.key} className="ownerHubCard" style={{ display: "flex", gap: 10 }}>
          <input type="checkbox" checked={choice.includes(item.key)} onChange={() => toggle(item.key)}/>
          <strong>{item.title}</strong>
        </label>)}
    </div>
    <label className="field"><span>سبب تحديث الشاشة</span>
      <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
        placeholder="مثال: تفعيل متابعة التحصيل لقسم المحاسبة"/></label>
    {message && <div className="infoNote">{message}</div>}
    <div className="formActions"><button className="button primary" type="button" disabled={busy}
      onClick={save}>حفظ شاشة الوظيفة</button></div>
  </section>;
}
