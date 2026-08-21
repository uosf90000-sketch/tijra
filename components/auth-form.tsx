"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
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
        <div className={styles.brand}><span className={styles.mark}>ت</span> تِجرا</div>
        <div className={styles.heroCopy}>
          <h1>{register ? "سوق الجملة وإدارة تجارتك في مكان واحد." : "رجعت لتجارتك. خلّ تِجرا ترتب الباقي."}</h1>
          <p>المورد يعرض بضاعته ومخزونه، وتاجر التجزئة يشتري ويقارن الأسعار مباشرة داخل تِجرا.</p>
          <div className={styles.points}>
            <div className={styles.point}><span className={styles.dot} /> سوق B2B بين المورد وتاجر التجزئة</div>
            <div className={styles.point}><span className={styles.dot} /> السوق يتخصص حسب نشاط المنشأة</div>
            <div className={styles.point}><span className={styles.dot} /> مقارنة تلقائية للسعر الأذكى</div>
          </div>
        </div>
        <div className={styles.fine}>TIJRA · سوق وتشغيل التجارة</div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>{register ? "حساب جديد" : "تسجيل الدخول"}</span>
          <h2>{register ? "اختر نشاطك" : "أهلًا بك"}</h2>
          <p className={styles.sub}>{register ? "حدد نوع الحساب ونشاط المنشأة حتى نعرض لك المنتجات المناسبة." : "استخدم بريدك وكلمة المرور للوصول إلى لوحة منشأتك."}</p>

          <form className={styles.form} onSubmit={submit}>
            {register && (
              <>
                <div className={styles.typeGrid} role="radiogroup" aria-label="نوع المنشأة">
                  {[
                    ["RETAILER", "تاجر تجزئة", "أشتري من الموردين وأدير المتجر"],
                    ["SUPPLIER", "مورد", "أعرض البضاعة وأستقبل الطلبات"],
                    ["BOTH", "الاثنان", "أبيع وأشتري داخل تِجرا"],
                  ].map(([value, title, note]) => (
                    <button
                      key={value}
                      type="button"
                      className={`${styles.typeCard} ${businessType === value ? styles.typeCardActive : ""}`}
                      onClick={() => setBusinessType(value)}
                      aria-pressed={businessType === value}
                    >
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
                  <small>مثال: محل إلكترونيات لن تظهر له منتجات البقالة في السوق الافتراضي.</small>
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
            <button className={styles.button} disabled={loading}>{loading ? "جاري الحفظ..." : register ? "إنشاء الحساب" : "دخول"}</button>
          </form>

          <p className={styles.switch}>
            {register ? <>عندك حساب؟ <Link href="/login">سجّل الدخول</Link></> : <>أول مرة تستخدم تِجرا؟ <Link href="/register">أنشئ حسابًا</Link></>}
          </p>
        </div>
      </section>
    </main>
  );
}
