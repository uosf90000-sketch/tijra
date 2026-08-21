"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Building2, Store, UsersRound } from "lucide-react";
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
  ["HARDWARE", "أدوات ومواد"],
  ["OFFICE", "مكتبة ومستلزمات مكتبية"],
  ["OTHER", "نشاط آخر"],
] as const;

const accountTypes = [
  ["RETAILER", "تاجر تجزئة", "أشتري من الموردين وأدير المتجر", Store],
  ["SUPPLIER", "مورد", "أعرض البضاعة وأستقبل الطلبات", Building2],
  ["BOTH", "الاثنان", "أبيع وأشتري داخل تِجرا", UsersRound],
] as const;

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  EMAIL_ALREADY_EXISTS: "يوجد حساب بهذا البريد الإلكتروني مسبقًا.",
  INVALID_INPUT: "راجع البيانات المدخلة وحاول مرة أخرى.",
  NO_BUSINESS_ACCESS: "الحساب غير مرتبط بمنشأة.",
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [businessType, setBusinessType] = useState("RETAILER");
  const [businessActivity, setBusinessActivity] = useState("GROCERY");
  const register = mode === "register";

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
      <section className={styles.hero}>
        <TijraLogo inverse size={62} className={styles.brandLogo} />

        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>منصة B2B للتجارة الذكية</span>
          <h1>الربط الذكي بين المورد وتاجر التجزئة.</h1>
          <p>المورد يعرض البضاعة والسعر والمخزون، والتاجر يقارن ويطلب ويحدّث مخزونه ومحاسبته من مكان واحد.</p>

          <div className={styles.connectionVisual} aria-hidden="true">
            <div className={styles.connectionRole}><Building2 size={19} /><span>المورد</span></div>
            <div className={styles.connectionLine}><ArrowLeftRight size={18} /></div>
            <div className={styles.connectionRole}><Store size={19} /><span>التاجر</span></div>
          </div>

          <div className={styles.points}>
            <div className={styles.point}><span className={styles.dot} /> سوق الموردين حسب نشاطك</div>
            <div className={styles.point}><span className={styles.dot} /> السعر الأذكى يقارن العروض تلقائيًا</div>
            <div className={styles.point}><span className={styles.dot} /> المخزون والمحاسبة والرواتب في نظام واحد</div>
          </div>
        </div>
        <div className={styles.fine}>TIJRA · المورد ↔ التاجر · تجارة مستمرة</div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>{register ? "ابدأ مع تِجرا" : "مرحبًا بعودتك"}</span>
          <h2>{register ? "أنشئ حساب منشأتك" : "تسجيل الدخول"}</h2>
          <p className={styles.sub}>{register ? "اختر دورك ونشاطك، وسنجهز لك السوق واللوحة المناسبة تلقائيًا." : "ادخل إلى سوقك ومخزونك وتقارير تجارتك."}</p>

          <form className={styles.form} onSubmit={submit}>
            {register && (
              <>
                <div className={styles.typeGrid} role="radiogroup" aria-label="نوع المنشأة">
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
                  <small>نستخدم النشاط لترتيب المنتجات والموردين الأكثر صلة بمنشأتك.</small>
                </div>
                <div className={styles.grid2}>
                  <div className={styles.field}><label htmlFor="name">اسمك</label><input id="name" name="name" required minLength={2} autoComplete="name" /></div>
                  <div className={styles.field}><label htmlFor="phone">الجوال</label><input id="phone" name="phone" inputMode="tel" autoComplete="tel" /></div>
                </div>
                <div className={styles.field}><label htmlFor="businessName">اسم المنشأة</label><input id="businessName" name="businessName" required minLength={2} /></div>
                <div className={styles.grid2}>
                  <div className={styles.field}><label htmlFor="city">المدينة</label><input id="city" name="city" /></div>
                  <div className={styles.field}><label htmlFor="taxNumber">الرقم الضريبي (اختياري)</label><input id="taxNumber" name="taxNumber" inputMode="numeric" /></div>
                </div>
              </>
            )}

            <div className={styles.field}><label htmlFor="email">البريد الإلكتروني</label><input id="email" name="email" type="email" required autoComplete="email" dir="ltr" /></div>
            <div className={styles.field}><label htmlFor="password">كلمة المرور</label><input id="password" name="password" type="password" required minLength={register ? 8 : 1} autoComplete={register ? "new-password" : "current-password"} dir="ltr" /></div>
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.button} disabled={loading}>{loading ? "جاري الحفظ..." : register ? "إنشاء الحساب والمتابعة" : "دخول إلى تِجرا"}</button>
          </form>

          <p className={styles.switch}>
            {register ? <>عندك حساب؟ <Link href="/login">سجّل الدخول</Link></> : <>أول مرة تستخدم تِجرا؟ <Link href="/register">أنشئ حسابًا</Link></>}
          </p>
        </div>
      </section>
    </main>
  );
}
