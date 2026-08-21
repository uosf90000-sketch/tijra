import { Check, ChevronLeft, Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "تهيئة المنشأة" };

export default function OnboardingPage() {
  return (
    <>
      <PageHeader
        eyebrow="البداية"
        title="تهيئة منشأتك"
        description="معلومات قليلة تكفي لبدء المخزون والمشتريات والمحاسبة والرواتب."
      />

      <section className="onboardingGrid">
        <article className="panel onboardingForm">
          <div className="stepHeader">
            <span className="stepBadge">1 من 3</span>
            <div className="stepProgress"><span style={{ width: "33%" }} /></div>
          </div>

          <div className="formSection">
            <div className="softIcon brand"><Store size={21} /></div>
            <div>
              <h2>بيانات المنشأة</h2>
              <p>تقدر تعدلها لاحقًا من الإعدادات.</p>
            </div>
          </div>

          <div className="formGrid">
            <label className="field full">
              <span>اسم المنشأة</span>
              <input defaultValue="تموينات النخيل" />
            </label>
            <label className="field">
              <span>نوع النشاط</span>
              <select defaultValue="grocery"><option value="grocery">بقالة / تموينات</option><option value="retail">تجزئة أخرى</option></select>
            </label>
            <label className="field">
              <span>العملة</span>
              <select defaultValue="SAR"><option value="SAR">ريال سعودي (SAR)</option></select>
            </label>
            <label className="field">
              <span>الرقم الضريبي (اختياري)</span>
              <input placeholder="15 رقمًا إن وجد" />
            </label>
            <label className="field">
              <span>المدينة</span>
              <input placeholder="مثال: جدة" />
            </label>
          </div>

          <div className="formActions">
            <button className="button primary">حفظ والمتابعة <ChevronLeft size={17} /></button>
          </div>
        </article>

        <aside className="panel onboardingAside">
          <span className="eyebrow">ماذا سيحدث بعدها؟</span>
          <h2>ابدأ بدون إدخال كل شيء يدويًا</h2>
          <div className="onboardingSteps">
            {[
              ["أضف المنتجات", "بالباركود أو استيراد ملف."],
              ["أضف مورديك الحاليين", "أسعار واتصال وطلبات فقط؛ التوصيل بينكما."],
              ["أضف الموظفين", "ثم أنشئ أول مسير رواتب."],
            ].map(([title, text]) => (
              <div className="onboardingStep" key={title}>
                <span><Check size={15} /></span>
                <div><strong>{title}</strong><p>{text}</p></div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
