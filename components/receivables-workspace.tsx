"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Customer = { id: string; name: string; paymentTermsDays: number };
type Quote = { id: string; quoteNumber: string; customerId: string; total: string };
type Receivable = {
  id: string; invoiceRef: string; amount: string; outstanding: string;
  dueAt: string; customer: { name: string }; status: string;
};

export function ReceivablesWorkspace({
  customers, quotes, receivables, canEdit,
}: { customers: Customer[]; quotes: Quote[]; receivables: Receivable[]; canEdit: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");

  async function request(url: string, data: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage("لم تُحفظ العملية: " + (result.error || "تعذر الاتصال")); return; }
      setMessage("تم توثيق العملية. لا تعتبر دفعة محققة من البنك أو فاتورة ضريبية صادرة.");
      router.refresh();
    } catch {
      setMessage("خطأ اتصال. تحقق من العملية قبل تكرارها.");
    } finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quoteId = String(form.get("quoteId") || "");
    await request("/api/crm/receivables", {
      customerId, quoteId: quoteId || undefined,
      invoiceRef: form.get("invoiceRef"), amount: String(form.get("amount")),
      dueAt: String(form.get("dueAt")) + "T12:00:00.000Z",
      description: form.get("description") || undefined,
    });
  }

  async function record(receivable: Receivable) {
    const amount = window.prompt("كم مبلغ التحصيل المسجل؟ المتبقي: " + receivable.outstanding, receivable.outstanding);
    if (!amount || !/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)) return;
    const reference = window.prompt("مرجع الإيداع/الإيصال (غير متكرر، 4 أحرف على الأقل):");
    if (!reference || reference.trim().length < 4) return;
    if (!window.confirm("هذا يسجل إثبات التحصيل يدويًا ولا يتحقق آليًا من البنك. هل تريد المتابعة؟")) return;
    await request("/api/crm/receipts", {
      receivableId: receivable.id, amount, reference: reference.trim(),
    });
  }

  const dueNow = receivables.filter((r) => r.status !== "PAID" && new Date(r.dueAt) < new Date());
  return <div style={{ display: "grid", gap: 18 }}>
    {message && <div className="infoNote">{message}</div>}
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">إجمالي المستحقات</span><h2>{receivables.length}</h2></article>
      <article className="panel"><span className="eyebrow">متأخرة عن الاستحقاق</span><h2>{dueNow.length}</h2></article>
      <article className="panel"><span className="eyebrow">مستحقات مدفوعة</span><h2>{receivables.filter((r) => r.status === "PAID").length}</h2></article>
    </section>
    {canEdit && <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">ذمم مدينة</span><h2>تسجيل مستحق على عميل</h2></div></div>
      <div className="infoNote">يُستخدم هذا السجل لمتابعة الالتزام والتحصيل داخليًا. لا يصدر فاتورة إلكترونية، ولا يُرحّل تلقائيًا إلى دفتر القيود.</div>
      <form className="formGrid" onSubmit={create}>
        <label className="field"><span>العميل</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="field"><span>مرتبط بعرض مقبول (اختياري)</span>
          <select name="quoteId" defaultValue=""><option value="">بدون عرض</option>
            {quotes.filter((q) => q.customerId === customerId).map((q) =>
              <option key={q.id} value={q.id}>{q.quoteNumber} — {q.total} ر.س</option>)}
          </select></label>
        <label className="field"><span>مرجع المستحق</span><input name="invoiceRef" required minLength={3} placeholder="AR-2026-001"/></label>
        <label className="field"><span>المبلغ بالريال</span><input name="amount" required defaultValue="0.00" pattern="[0-9]+([.][0-9]{1,2})?"/></label>
        <label className="field"><span>تاريخ الاستحقاق</span><input name="dueAt" type="date" required/></label>
        <label className="field"><span>الوصف</span><input name="description" maxLength={500}/></label>
        <div className="formActions"><button className="button primary" disabled={busy || !customers.length}>تسجيل المستحق</button></div>
      </form>
    </section>}
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">التحصيل والمتابعة</span><h2>مستحقات العملاء</h2></div></div>
      <div className="tableScroll"><table className="dataTable"><thead><tr>
        <th>المرجع</th><th>العميل</th><th>الأصل</th><th>المتبقي</th><th>الاستحقاق</th><th>الحالة</th><th>الإجراء</th>
      </tr></thead><tbody>{receivables.map((r) => <tr key={r.id}>
        <td>{r.invoiceRef}</td><td>{r.customer.name}</td><td>{r.amount}</td><td><strong>{r.outstanding}</strong></td>
        <td>{r.dueAt.slice(0, 10)}</td><td>{r.status === "PAID" ? "مسدد" : r.status === "PARTIALLY_PAID" ? "جزئي" : "مفتوح"}</td>
        <td>{canEdit && r.status !== "PAID" && r.status !== "VOID"
          ? <button type="button" className="button secondary" disabled={busy} onClick={() => record(r)}>تسجيل تحصيل</button>
          : "—"}</td>
      </tr>)}
      {!receivables.length && <tr><td colSpan={7}>لم يتم تسجيل مستحقات حتى الآن.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
