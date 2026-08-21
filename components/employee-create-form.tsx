"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function EmployeeCreateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone") || undefined,
        jobTitle: form.get("jobTitle") || undefined,
        baseSalary: Number(form.get("baseSalary") || 0),
        defaultAllowance: Number(form.get("defaultAllowance") || 0),
        hiredAt: form.get("hiredAt") || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error === "FORBIDDEN" ? "ليس لديك صلاحية إضافة موظف." : "تعذر إضافة الموظف. راجع البيانات.");
      setLoading(false);
      return;
    }
    router.replace("/employees");
    router.refresh();
  }

  return (
    <form className="panel onboardingForm" onSubmit={submit}>
      <div className="formSection"><div><h2>بيانات الموظف</h2><p>الراتب الأساسي والبدل الافتراضي يُستخدمان عند تجهيز مسير الرواتب.</p></div></div>
      <div className="formGrid">
        <label className="field full"><span>اسم الموظف</span><input name="name" required minLength={2} /></label>
        <label className="field"><span>المسمى الوظيفي</span><input name="jobTitle" placeholder="كاشير، مدير..." /></label>
        <label className="field"><span>الجوال</span><input name="phone" inputMode="tel" dir="ltr" /></label>
        <label className="field"><span>الراتب الأساسي</span><input name="baseSalary" required type="number" min="0" step="0.01" /></label>
        <label className="field"><span>البدل الافتراضي</span><input name="defaultAllowance" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label className="field full"><span>تاريخ التعيين</span><input name="hiredAt" type="date" dir="ltr" /></label>
      </div>
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ الموظف"}</button></div>
    </form>
  );
}
