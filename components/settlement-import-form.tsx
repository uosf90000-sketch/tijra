"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Landmark, Upload } from "lucide-react";

type PaymentMethod = "CARD" | "TRANSFER" | "OTHER" | "CASH";

type SettlementEntry = {
  provider: string;
  paymentMethod: PaymentMethod;
  salesDate: string;
  settledAt?: string;
  grossAmount: number;
  fees: number;
  reference?: string;
  note?: string;
  source?: "MANUAL" | "CSV";
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function normalizePaymentMethod(value: string): PaymentMethod {
  const normalized = value.trim().toUpperCase();
  if (normalized === "CARD" || value.includes("بطاق")) return "CARD";
  if (normalized === "TRANSFER" || value.includes("تحويل")) return "TRANSFER";
  if (normalized === "CASH" || value.includes("نقد")) return "CASH";
  return "OTHER";
}

function csvEntries(text: string): SettlementEntry[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const indexOf = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;

  const columns = {
    salesDate: indexOf("salesdate", "sales_date", "date"),
    provider: indexOf("provider", "bank", "gateway"),
    paymentMethod: indexOf("paymentmethod", "payment_method", "method"),
    grossAmount: indexOf("grossamount", "gross_amount", "gross"),
    fees: indexOf("fees", "fee"),
    settledAt: indexOf("settledat", "settled_at", "settlementdate"),
    reference: indexOf("reference", "ref"),
    note: indexOf("note", "notes"),
  };

  if (columns.salesDate < 0 || columns.provider < 0 || columns.paymentMethod < 0 || columns.grossAmount < 0) return [];

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const grossAmount = Number(values[columns.grossAmount] || 0);
    const fees = columns.fees >= 0 ? Number(values[columns.fees] || 0) : 0;
    return {
      salesDate: values[columns.salesDate],
      provider: values[columns.provider],
      paymentMethod: normalizePaymentMethod(values[columns.paymentMethod]),
      grossAmount,
      fees,
      settledAt: columns.settledAt >= 0 ? values[columns.settledAt] || undefined : undefined,
      reference: columns.reference >= 0 ? values[columns.reference] || undefined : undefined,
      note: columns.note >= 0 ? values[columns.note] || undefined : undefined,
      source: "CSV" as const,
    };
  }).filter((entry) => entry.salesDate && entry.provider && Number.isFinite(entry.grossAmount) && entry.grossAmount >= 0);
}

async function postEntries(entries: SettlementEntry[]) {
  const response = await fetch("/api/accounting/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entries.length === 1 ? entries[0] : { entries }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "تعذر حفظ التسوية");
  return payload;
}

export function SettlementImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  async function submitManual(formData: FormData) {
    setSaving(true);
    setMessage("");
    try {
      const entry: SettlementEntry = {
        provider: String(formData.get("provider") || ""),
        paymentMethod: String(formData.get("paymentMethod") || "CARD") as PaymentMethod,
        salesDate: String(formData.get("salesDate") || today),
        settledAt: String(formData.get("settledAt") || today),
        grossAmount: Number(formData.get("grossAmount") || 0),
        fees: Number(formData.get("fees") || 0),
        reference: String(formData.get("reference") || "") || undefined,
        note: String(formData.get("note") || "") || undefined,
        source: "MANUAL",
      };
      await postEntries([entry]);
      setMessage("تم تسجيل التسوية ومطابقتها مع المبيعات.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ التسوية");
    } finally {
      setSaving(false);
    }
  }

  async function importCsv(file: File) {
    setSaving(true);
    setMessage("");
    try {
      const entries = csvEntries(await file.text());
      if (!entries.length) throw new Error("ملف CSV غير صالح. استخدم الأعمدة: salesDate, provider, paymentMethod, grossAmount, fees.");
      if (entries.length > 500) throw new Error("الحد الأقصى 500 تسوية في الملف الواحد.");
      const result = await postEntries(entries);
      const skipped = Number(result.skipped || 0);
      setMessage(skipped ? `تم استيراد ${result.count ?? 0} تسوية، وتجاوز ${skipped} مكررة.` : `تم استيراد ${result.count ?? entries.length} تسوية بنجاح.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر استيراد الملف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="accountingGrid">
      <form className="panel" action={submitManual}>
        <div className="panelHeader">
          <div><span className="eyebrow"><Landmark size={14} /> تسجيل مباشر</span><h2>أضف تسوية</h2></div>
        </div>

        <label className="field"><span>مزود الدفع / البنك</span><input name="provider" placeholder="مثال: مدى - بنك الراجحي" required /></label>
        <div className="formGrid two">
          <label className="field"><span>طريقة الدفع</span><select name="paymentMethod" defaultValue="CARD"><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل</option><option value="OTHER">أخرى</option><option value="CASH">نقد</option></select></label>
          <label className="field"><span>تاريخ المبيعات التي تغطيها التسوية</span><input type="date" name="salesDate" defaultValue={today} required /></label>
          <label className="field"><span>تاريخ إيداع التسوية</span><input type="date" name="settledAt" defaultValue={today} required /></label>
          <label className="field"><span>إجمالي التسوية قبل الرسوم</span><input type="number" name="grossAmount" min="0" step="0.01" required /></label>
          <label className="field"><span>الرسوم</span><input type="number" name="fees" min="0" step="0.01" defaultValue="0" required /></label>
          <label className="field"><span>المرجع</span><input name="reference" placeholder="اختياري" /></label>
        </div>
        <label className="field"><span>ملاحظة</span><input name="note" placeholder="اختياري" /></label>
        <button className="button primary" type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ ومطابقة"}</button>
      </form>

      <article className="panel">
        <div className="panelHeader">
          <div><span className="eyebrow"><FileSpreadsheet size={14} /> استيراد جماعي</span><h2>رفع CSV</h2></div>
        </div>
        <p className="muted">للعمليات الكثيرة ارفع كشف التسويات بصيغة CSV. يدعم حتى 500 صف في المرة الواحدة.</p>
        <div className="infoNote">
          الأعمدة المطلوبة: <strong>salesDate, provider, paymentMethod, grossAmount</strong><br />
          الاختيارية: fees, settledAt, reference, note
        </div>
        <label className="button secondary" style={{ cursor: "pointer", width: "fit-content" }}>
          <Upload size={17} /> اختر ملف CSV
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }}
          />
        </label>
        {message ? <div className="infoNote" role="status">{message}</div> : null}
      </article>
    </div>
  );
}
