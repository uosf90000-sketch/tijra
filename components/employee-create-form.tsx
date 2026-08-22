"use client";

import { Calculator, KeyRound, PackageOpen, Save, ShieldCheck, ShoppingCart, ShoppingBasket } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Permission = "CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING";

const permissionOptions: Array<{ value: Permission; title: string; note: string; icon: typeof ShoppingCart }> = [
  { value: "CASHIER", title: "الكاشير", note: "فتح شاشة البيع وتسجيل الفواتير فقط.", icon: ShoppingCart },
  { value: "INVENTORY", title: "المستودع والمخزون", note: "الأصناف والكميات والجرد وإضافة المخزون.", icon: PackageOpen },
  { value: "PURCHASES", title: "المشتريات", note: "السوق والموردون والطلبات والأسعار.", icon: ShoppingBasket },
  { value: "ACCOUNTING", title: "المحاسبة", note: "الملخص المالي والمصاريف والحركة المحاسبية.", icon: Calculator },
];

export function EmployeeCreateForm({ canCreateAccount }: { canCreateAccount: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  function togglePermission(permission: Permission) {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

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
        createAccount,
        accountEmail: createAccount ? form.get("accountEmail") : undefined,
        temporaryPassword: createAccount ? form.get("temporaryPassword") : undefined,
        permissions: createAccount ? permissions : [],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages: Record<string, string> = {
        FORBIDDEN: "ليس لديك صلاحية إضافة موظف.",
        OWNER_REQUIRED_FOR_ACCOUNT_ACCESS: "إنشاء حسابات الموظفين وتحديد صلاحياتها متاح لمالك المنشأة فقط.",
        ACCOUNT_EMAIL_ALREADY_EXISTS: "بريد الدخول مستخدم في حساب آخر. استخدم بريدًا مختلفًا.",
        INVALID_INPUT: createAccount && !permissions.length ? "اختر صلاحية واحدة على الأقل للموظف." : "راجع بيانات الموظف وبيانات الدخول.",
      };
      setError(messages[result.error] ?? "تعذر إضافة الموظف. راجع البيانات.");
      setLoading(false);
      return;
    }
    router.replace("/employees");
    router.refresh();
  }

  return (
    <form className="panel onboardingForm employeeAccessForm" onSubmit={submit}>
      <div className="formSection"><div><h2>بيانات الموظف</h2><p>المسمى الوظيفي للتنظيم الإداري فقط، ولا يحدد صلاحيات الدخول.</p></div></div>
      <div className="formGrid">
        <label className="field full"><span>اسم الموظف</span><input name="name" required minLength={2} /></label>
        <label className="field"><span>المسمى الوظيفي</span><input name="jobTitle" placeholder="مثال: كاشير، أمين مستودع، محاسب..." /></label>
        <label className="field"><span>الجوال</span><input name="phone" inputMode="tel" dir="ltr" /></label>
        <label className="field"><span>الراتب الأساسي</span><input name="baseSalary" required type="number" min="0" step="0.01" /></label>
        <label className="field"><span>البدل الافتراضي</span><input name="defaultAllowance" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label className="field full"><span>تاريخ التعيين</span><input name="hiredAt" type="date" dir="ltr" /></label>
      </div>

      <section className="employeeLoginSection">
        <div className="employeeLoginHead">
          <div className="employeeLoginIcon"><KeyRound size={20} /></div>
          <div><strong>فتح حساب TIJRA للموظف</strong><span>{canCreateAccount ? "اختياري — المالك يحدد ما يستطيع الموظف فتحه." : "إنشاء حسابات الموظفين متاح لمالك المنشأة فقط."}</span></div>
          <button
            type="button"
            className={`accessToggle ${createAccount ? "active" : ""}`}
            disabled={!canCreateAccount}
            aria-pressed={createAccount}
            onClick={() => canCreateAccount && setCreateAccount((value) => !value)}
          ><span /></button>
        </div>

        {createAccount && canCreateAccount ? (
          <div className="employeeAccessBody">
            <div className="formGrid">
              <label className="field"><span>بريد الدخول</span><input name="accountEmail" type="email" dir="ltr" required={createAccount} autoComplete="off" placeholder="employee@example.com" /></label>
              <label className="field"><span>كلمة مرور مؤقتة</span><input name="temporaryPassword" type="password" dir="ltr" required={createAccount} minLength={8} autoComplete="new-password" placeholder="8 أحرف على الأقل" /></label>
            </div>

            <div className="permissionHeader"><div><ShieldCheck size={18} /><strong>صلاحيات الموظف</strong></div><span>اختر واحدة أو أكثر — ويمكن اختيار الأربع كلها.</span></div>
            <div className="permissionGrid">
              {permissionOptions.map(({ value, title, note, icon: Icon }) => {
                const selected = permissions.includes(value);
                return (
                  <button key={value} type="button" className={`permissionCard ${selected ? "selected" : ""}`} onClick={() => togglePermission(value)} aria-pressed={selected}>
                    <span className="permissionCheck">{selected ? "✓" : ""}</span>
                    <span className="permissionIcon"><Icon size={19} /></span>
                    <strong>{title}</strong>
                    <small>{note}</small>
                  </button>
                );
              })}
            </div>
            <div className="accessOwnerNote"><ShieldCheck size={16} /><span>الحساب الرئيسي (مالك المنشأة) يبقى دائمًا بصلاحية كاملة ولا يتأثر بهذه الخيارات.</span></div>
          </div>
        ) : null}
      </section>

      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ الموظف"}</button></div>
    </form>
  );
}
