"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import styles from "./auth-form.module.css";

type Mode = "login" | "register";

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
      router.replace(register ? "/onboarding" : "/");
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
          <h1>{register ? "ابدأ إدارة تجارتك من مكان واحد." : "رجعت لتجارتك. خلّ تِجرا ترتب الباقي."}</h1>
          <p>المخزون، الموردون، المشتريات، المحاسبة والرواتب في نظام عربي بسيط ومصمم للتاجر الصغير.</p>
          <div className={styles.points}>
            <div className={styles.point}><span className={styles.dot} /> تنبيهات مخزون واقتراح مشتريات ذكية</div>
            <div className={styles.point}><span className={styles.dot} /> البيع يحدّث المخزون والتكلفة آليًا</div>
            <div className={styles.point}><span className={styles.dot} /> التوصيل يبقى مباشرة بينك وبين المورد</div>
          </div>
        </div>
        <div className={styles.fine}>TIJRA · تشغيل تجارتك بوضوح</div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>{register ? "حساب جديد" : "تسجيل الدخول"}</span>
          <h2>{register ? "أنشئ منشأتك" : "أهلًا بك"}</h2>
          <p className={styles.sub}>{register ? "أنشئ حساب المالك، وبعدها أضف المنتجات والموردين والموظفين." : "استخدم بريدك وكلمة المرور للوصول إلى لوحة منشأتك."}</p>

          <form className={styles.form} onSubmit={submit}>
            {register && (
              <>
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
