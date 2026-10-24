"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Supplier = { id: string; name: string };
type Document = {
  id: string; documentType: string; title: string; reference: string | null;
  expiresAt: string; reviewStatus: string; supplier: { name: string } | null;
};
const types: Array<{ value: string; label: string }> = [
  { value: "COMMERCIAL_REGISTRATION", label: "السجل التجاري / التأكيد السنوي" },
  { value: "MUNICIPAL_LICENSE", label: "الرخصة البلدية" },
  { value: "FOOD_TRUCK_PERMIT", label: "تصريح عربة متنقلة" },
  { value: "VAT_CERTIFICATE", label: "شهادة التسجيل الضريبي" },
  { value: "INSURANCE", label: "التأمين" },
  { value: "SUPPLIER_LICENSE", label: "ترخيص المورد" },
  { value: "OTHER", label: "مستند آخر" },
];
export function ComplianceWorkspace({ documents, suppliers, owner, canEdit }: {
  documents: Document[]; suppliers: Supplier[]; owner: boolean; canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(method: "POST" | "PATCH", payload: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/compliance", {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage("تعذر الحفظ: " + (data.error || "راجع البيانات")); return; }
      setMessage("حُفظت البيانات بسجل داخلي. لم يتحقق مدار من المستند لدى الجهة المصدرة.");
      router.refresh();
    } catch { setMessage("فشل الاتصال. راجع السجل قبل تكرار العملية."); }
    finally { setBusy(false); }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("POST", {
      documentType: form.get("documentType"), title: form.get("title"),
      reference: form.get("reference") || undefined,
      supplierId: form.get("supplierId") || undefined,
      expiresAt: String(form.get("expiresAt")) + "T23:59:59.000Z",
      note: form.get("note") || undefined,
    });
  }
  async function review(id: string) {
    const reason = window.prompt("اشرح نتيجة المراجعة الداخلية (8 أحرف على الأقل):");
    if (!reason || reason.trim().length < 8) return;
    await submit("PATCH", { documentId: id, reason });
  }
  const now = new Date();
  return <div style={{ display: "grid", gap: 18 }}>
    {message && <div className="infoNote">{message}</div>}
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">مستندات مسجلة</span><h2>{documents.length}</h2></article>
      <article className="panel"><span className="eyebrow">منتهية</span><h2>{documents.filter((d) => new Date(d.expiresAt) < now).length}</h2></article>
      <article className="panel"><span className="eyebrow">تنتهي خلال 30 يومًا</span>
        <h2>{documents.filter((d) => new Date(d.expiresAt) >= now && new Date(d.expiresAt).getTime() < Date.now()+30*86400000).length}</h2></article>
    </section>
    {canEdit && <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">جاهزية النشاط</span><h2>تسجيل صلاحية مستند</h2></div></div>
      <div className="infoNote">هذه متابعة تاريخية بناءً على مستند يدخله المستخدم وليست تحققًا أو تجديدًا حكوميًا. راجع منصة بلدي ووزارة التجارة والجهة المختصة للتأكد من المتطلبات حسب نشاطك.</div>
      <form className="formGrid" onSubmit={add}>
        <label className="field"><span>نوع المستند</span><select name="documentType">
          {types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select></label>
        <label className="field"><span>اسم المستند</span><input name="title" required minLength={3} placeholder="رخصة البلدية لفرع الرياض"/></label>
        <label className="field"><span>يتبع إلى</span><select name="supplierId" defaultValue="">
          <option value="">المنشأة نفسها</option>{suppliers.map((supplier) =>
            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select></label>
        <label className="field"><span>رقم المرجع (اختياري)</span><input name="reference" maxLength={100}/></label>
        <label className="field"><span>تاريخ الانتهاء / المراجعة القادمة</span><input name="expiresAt" type="date" required/></label>
        <label className="field"><span>ملاحظة المراجعة</span><input name="note" maxLength={800}/></label>
        <div className="formActions"><button className="button primary" disabled={busy}>تسجيل المستند</button></div>
      </form>
    </section>}
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">المهام التنظيمية</span><h2>سجل المستندات</h2></div></div>
      <div className="tableScroll"><table className="dataTable"><thead><tr>
        <th>المستند</th><th>الجهة</th><th>الانتهاء</th><th>المراجعة الداخلية</th><th>الإجراء</th>
      </tr></thead><tbody>{documents.map((d) => <tr key={d.id}>
        <td>{d.title}</td><td>{d.supplier?.name || "المنشأة"}</td>
        <td>{d.expiresAt.slice(0,10)}</td>
        <td>{d.reviewStatus === "INTERNALLY_REVIEWED" ? "تمت مراجعة داخلية — ليست حكومية" : "مدخل ذاتيًا"}</td>
        <td>{owner && d.reviewStatus === "SELF_REPORTED" &&
          <button type="button" className="button secondary" disabled={busy}
            onClick={() => review(d.id)}>توثيق مراجعة داخلية</button>}</td>
      </tr>)}
      {!documents.length && <tr><td colSpan={5}>لا توجد مستندات مسجلة بعد.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
