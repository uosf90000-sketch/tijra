"use client";

import { Camera, CheckCircle2, FileImage, LoaderCircle, Upload } from "lucide-react";
import { ChangeEvent, useState } from "react";

type OcrResult = {
  confidence: number;
  parsed: {
    invoiceNumber: string | null;
    taxNumber: string | null;
    total: number | null;
    vat: number | null;
    candidateItemLines: Array<{ line: string; numbers: number[] }>;
    rawText: string;
  };
};

export function InvoiceOcrUploader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OcrResult | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/ocr/invoice", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error === "FILE_TOO_LARGE" ? "الصورة أكبر من الحد المسموح." : "تعذر قراءة الفاتورة. جرّب صورة أوضح.");
        return;
      }
      setResult(data);
    } catch {
      setError("تعذر رفع الفاتورة أو تشغيل القراءة الآن.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  return (
    <article className="panel uploadPanel">
      <div className="uploadDropzone">
        <div className="uploadIcon">{loading ? <LoaderCircle className="spin" size={26} /> : <Camera size={26} />}</div>
        <h2>{loading ? "نقرأ الفاتورة الآن..." : "صوّر أو ارفع فاتورة المورد"}</h2>
        <p>القراءة تعمل محليًا بـ OCR عربي/إنجليزي بدون مفتاح API مدفوع. JPG، PNG أو WebP.</p>
        <label className="button primary fileButton" aria-disabled={loading}>
          <Upload size={17} /> {loading ? "جاري القراءة" : "اختيار صورة"}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={loading} />
        </label>
      </div>

      {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fff0ef", color: "#9b3028" }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div className="matchOk"><CheckCircle2 size={18} /><span>تمت القراءة · دقة OCR تقريبية {Math.round(result.confidence)}%</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
            <div className="infoNote">رقم الفاتورة: <strong>{result.parsed.invoiceNumber ?? "يحتاج مراجعة"}</strong></div>
            <div className="infoNote">الرقم الضريبي: <strong>{result.parsed.taxNumber ?? "غير واضح"}</strong></div>
            <div className="infoNote">الإجمالي: <strong>{result.parsed.total != null ? `${result.parsed.total.toLocaleString("ar-SA")} ر.س` : "يحتاج مراجعة"}</strong></div>
            <div className="infoNote">الضريبة: <strong>{result.parsed.vat != null ? `${result.parsed.vat.toLocaleString("ar-SA")} ر.س` : "غير واضحة"}</strong></div>
          </div>
          {result.parsed.candidateItemLines.length > 0 && (
            <div className="infoNote">
              <strong>أسطر محتملة للأصناف:</strong>
              <div style={{ marginTop: 8, display: "grid", gap: 5, fontSize: 12 }}>
                {result.parsed.candidateItemLines.slice(0, 8).map((item, index) => <span key={`${item.line}-${index}`}>{item.line}</span>)}
              </div>
            </div>
          )}
          <div className="policyNote">هذه قراءة مساعدة. لا يتم تعديل المخزون إلا بعد مراجعتك واعتماد المستلم فعليًا.</div>
        </div>
      )}

      <div className="privacyLine"><FileImage size={15} /> صورة الفاتورة تُعالج عند الطلب ولا تحتاج مفتاح OCR مدفوع.</div>
    </article>
  );
}
