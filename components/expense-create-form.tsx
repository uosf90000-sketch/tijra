"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ExpenseCreateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: form.get("category"),
        description: form.get("description") || undefined,
        amount: Number(form.get("amount") || 0),
        expenseDate: form.get("expenseDate") || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error === "FORBIDDEN" ? "ليس لديك صلاحية تسجيل المصروف." : "تعذر تسجيل المصروف.");
      setLoading(false);
      return;
    }
    router.replace("/accounting");
    router.refresh();
  }

  return (
    <form className="panel onboardingForm" onSubmit={submit}>
      <div className="formSection"><div><h2>مصروف تشغيلي</h2><p>سجّل الإيجار والكهرباء والصيانة وغيرها بعيدًا عن تكلفة شراء البضاعة.</p></div></div>
      <div className="formGrid">
        <label className="field"><span>التصنيف</span><input name="category" required placeholder="إيجار، كهرباء، صيانة..." /></label>
        <label className="field"><span>المبلغ</span><input name="amount" required type="number" min="0.01" step="0.01" /></label>
        <label className="field"><span>التاريخ</span><input name="expenseDate" type="date" dir="ltr" /></label>
        <label className="field full"><span>الوصف</span><textarea name="description" rows={4} /></label>
      </div>
      {error && <div className="infoNote" style={{ color: "#9b3028", background: "#fff0ef" }}>{error}</div>}
      <div className="formActions"><button className="button primary" disabled={loading}><Save size={17} /> {loading ? "جاري الحفظ..." : "حفظ المصروف"}</button></div>
    </form>
  );
}
