"use client";

import { useRouter } from "next/navigation";
import { Building2, Store, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { TijraLogo } from "@/components/tijra-logo";
import styles from "./auth-form.module.css";

type Mode = "login" | "register";

const activities = [
  ["GROCERY", "بقالة وتموينات"],
  ["ELECTRONICS", "إلكترونيات"],
  ["PHARMACY", "صيدلية"],
  ["RESTAURANT", "مطعم"],
  ["CAFE", "مقهى"],
  ["FASHION", "ملابس"],
  ["BEAUTY", "عناية وتجميل"],
  ["HARDWARE", "قطع غيار وأدوات"],
  ["OFFICE", "مكتبة ومستلزمات مكتبية"],
  ["OTHER", "نشاط آخر"],
] as const;

const accountTypes = [
  ["RETAILER", "تاجر", "أشتري من الموردين", Store],
  ["SUPPLIER", "مورد", "أبيع للتجار", Building2],
  ["BOTH", "الاثنان", "أشتري وأبيع", UsersRound],
] as const;

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  EMAIL_ALREADY_EXISTS: "يوجد حساب بهذا البريد الإلكتروني مسبقًا.",
  INVALID_INPUT: "راجع البيانات المدخلة وحاول مرة أخرى.",
  NO_BUSINESS_ACCESS: "الحساب غير مرتبط بمنشأة.",
};

export function AuthForm({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [businessType, setBusinessType] = useState("RETAILER");
  const [businessActivity, setBusinessActivity] = useState("GROCERY");
  const register = mode === "register";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    window.history.replaceState(null, "", next === "register" ? "/login?mode=register" : "/login");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = register
      ? {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          phone: form.get("phone") || undefined,
          businessName: form.get("businessName"),
          businessType,
          businessActivity,
          city: form.get("city") || undefined,
          taxNumber: form.get("taxNumber") || undefined,
        }
      : {
          email: form.get("email"),
          password: form.get("password"),
        };

    try {
      const response = await fetch(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(messages[result.error] ?? "تعذر إكمال العملية. حاول مرة أخرى.");
        return;
      }
      router.replace(register ? (businessType === "SUPPLIER" ? "/marketplace/seller" : "/marketplace") : "/");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <section className={styles.authWrap}>
        <header className={styles.brandHeader}>
          <TijraLogo size={84} />
          <p>المورد والتاجر في مكان واحد</p>
        </header>

        <div className={styles.card}>
          <div className={styles.modeTabs} role="tablist" aria-label="الدخول أو إنشاء حساب">
            <button type="button" role="tab" aria-selected={!register} className={!register ? styles.activeTab : ""} onClick={() => switchMode("login")}>تسجيل الدخول</button>
            <button type="button" role="tab" aria-selected={register} className={register ? styles.activeTab : ""} onClick={() => switchMode("register")}>إنشاء حساب</button>
          </div>

          <div className={styles.cardIntro}>
            <h1>{register ? "ابدأ مع تِجرا" : "مرحبًا بعودتك"}</h1>
            <p>{register ? "أنشئ منشأتك واختر دورك، وسنجهز لك الواجهة المناسبة." : "ادخل لحسابك وتابع السوق والطلبات وإحصائيات منشأتك."}</p>
          </div>

          <form className={styles.form} onSubmit={submit}>
            {register && (
              <>
                <div className={styles.typeGrid} role="radiogroup" aria-label="نوع الحساب">
                  {accountTypes.map(([value, title, note, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      className={`${styles.typeCard} ${businessType === value ? styles.typeCardActive : ""}`}
                      onClick={() => setBusinessType(value)}
                      aria-pressed={businessType === value}
                    >
                      <span className={styles.typeIcon}><Icon size={18} /></span>
                      <strong>{title}</strong>
                      <span>{note}</span>
                    </button>
                  ))}
                </div>

                <div className={styles.field}>
                  <label htmlFor="businessActivity">نشاط المنشأة</label>
                  <select id="businessActivity" value={businessActivity} onChange={(event) => setBusinessActivity(event.target.value)}>
                    {activities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>

                <div className={styles.grid2}>
                  <div className={styles.field}><label htmlFor="name">اسمك</label><input id="name" name="name" required minLength={2} autoComplete="name" /></div>
                  <div className={styles.field}><label htmlFor="phone">الجوال</label><input id="phone" name="phone" inputMode="tel" autoComplete="tel" /></div>
                </div>

                <div className={styles.field}><label htmlFor="businessName">اسم المنشأة</label><input id="businessName" name="businessName" required minLength={2} /></div>

                <div className={styles.grid2}>
                  <div className={styles.field}><label htmlFor="city">المدينة</label><input id="city" name="city" placeholder="مثال: جدة" /></div>
                  <div className={styles.field}><label htmlFor="taxNumber">الرقم الضريبي <span>اختياري</span></label><input id="taxNumber" name="taxNumber" inputMode="numeric" /></div>
                </div>
              </>
            )}

            <div className={styles.field}><label htmlFor="email">البريد الإلكتروني</label><input id="email" name="email" type="email" required autoComplete="email" dir="ltr" placeholder="example@tijra.com" /></div>
            <div className={styles.field}><label htmlFor="password">كلمة المرور</label><input id="password" name="password" type="password" required minLength={register ? 8 : 1} autoComplete={register ? "new-password" : "current-password"} dir="ltr" /></div>

            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.submit} disabled={loading}>{loading ? "جاري الحفظ..." : register ? "إنشاء الحساب والمتابعة" : "تسجيل الدخول"}</button>
          </form>
        </div>

        <p className={styles.footerNote}>تِجرا · منصة التجارة الذكية بين المورد والتاجر</p>
      </section>
    </main>
  );
}
