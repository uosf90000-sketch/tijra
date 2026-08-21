"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SupplierCreateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone") || undefined,
        email: form.get("email") || undefined,
        notes: form.get("notes") || undefined,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error === "FORBIDDEN" ? "ليس لديك صلاحية إضافة مورد." : "تعذر إضافة المورد. راجع البيانات.");
      setLoading(false);
      return;
    }

    router.replace("/suppliers");
    router.refresh();
  }

  return (
    <form className="panel onboardingForm" onSubmit={submit}>
      <div className="formSection">
        <div><h2>بيانات المورد</h2><p>التواصل والطلبات داخل تِجرا، أما التوصيل فيبقى اتفاقًا مباشرًا بينكما.</p></div>
      </div>
      <div className="formGrid">
        <label className="field full"><span>اسم المورد</span><input name="name" required minLength={2} placeholder="مثال: مؤسسة الإمداد السريع" /></label>
        <label className="field"><span>الجوال</span><input name="phone" inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" /></label>
        <label className="field"><span>البريد الإلكتروني</span><input name="email" type="email" dir="ltr" placeholder="supplier@example.com" /></label>
        <label className="field full"><span>ملاحظات</span><textarea name="notes" rows={4} placeholder="أيام التوريد أو شروط التعامل التي تريد تذكرها..." /></label>
      </div>
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ المورد"}</button></div>
    </form>
  );
}
