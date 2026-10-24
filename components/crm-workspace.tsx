"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type CustomerSummary = {
  id: string; name: string; customerType: string; phone: string | null;
  creditLimit: string; paymentTermsDays: number;
  saleCount: number; lifetimeValue: string; lastPurchase: string | null;
};
export type QuoteSummary = {
  id: string; quoteNumber: string; status: string; total: string;
  expiresAt: string | null; customer: { name: string };
  lines: Array<{ id: string; description: string; quantity: string; unitPrice: string }>;
};

const quoteStatuses: Record<string, string> = {
  DRAFT: "مسودة", SENT: "تم الإرسال يدويًا", ACCEPTED: "مقبول", REJECTED: "مرفوض", EXPIRED: "منتهي",
};

export function CrmWorkspace({
  customers, quotes, owner,
}: { customers: CustomerSummary[]; quotes: QuoteSummary[]; owner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");

  async function send(url: string, method: string, payload: object) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage("لم تُحفظ العملية: " + (data.error || "تعذر الاتصال"));
        return;
      }
      setMessage("تم حفظ العملية وتوثيقها؛ لم تُرسل أي رسالة أو فاتورة ضريبية تلقائيًا.");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال. راجع العملية قبل تكرارها.");
    } finally { setBusy(false); }
  }

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send("/api/crm/customers", "POST", {
      name: form.get("name"), customerType: form.get("customerType"),
      phone: form.get("phone") || undefined, email: form.get("email") || undefined,
      creditLimit: owner ? String(form.get("creditLimit") || "0") : "0",
      paymentTermsDays: Number(form.get("paymentTermsDays") || 0),
    });
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send("/api/crm/quotes", "POST", {
      customerId, quoteNumber: form.get("quoteNumber"),
      note: form.get("note") || undefined,
      lines: [{
        description: form.get("description"),
        quantity: String(form.get("quantity")),
        unitPrice: String(form.get("unitPrice")),
      }],
    });
  }

  async function decideQuote(quoteId: string, status: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED") {
    const reason = window.prompt("سبب تحديث حالة عرض السعر (8 أحرف على الأقل):");
    if (!reason || reason.trim().length < 8) return;
    await send("/api/crm/quotes/" + encodeURIComponent(quoteId) + "/status", "PATCH", {
      status, reason: reason.trim(),
    });
  }

  return <div style={{ display: "grid", gap: 18 }}>
    {message && <div className="infoNote">{message}</div>}
    <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">CRM</span><h2>العملاء والحدود الائتمانية</h2></div></div>
      <form className="formGrid" onSubmit={addCustomer}>
        <label className="field"><span>اسم العميل</span><input required minLength={2} name="name" placeholder="شركة أو فرد"/></label>
        <label className="field"><span>نوع العميل</span><select name="customerType"><option value="BUSINESS">شركة</option><option value="INDIVIDUAL">فرد</option></select></label>
        <label className="field"><span>جوال العميل</span><input name="phone" maxLength={40}/></label>
        <label className="field"><span>البريد الإلكتروني</span><input name="email" type="email"/></label>
        <label className="field"><span>أيام السداد المتفق عليها</span><input name="paymentTermsDays" type="number" min={0} max={365} defaultValue={0}/></label>
        {owner && <label className="field"><span>الحد الائتماني بالريال (0 = غير مقيّد)</span>
          <input name="creditLimit" defaultValue="0.00" pattern="[0-9]+([.][0-9]{1,2})?"/></label>}
        <div className="formActions"><button className="button primary" disabled={busy}>حفظ العميل</button></div>
      </form>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>العميل</th><th>النوع</th><th>الجوال</th><th>الائتمان</th><th>أيام السداد</th><th>مبيعات مسجلة</th><th>آخر شراء</th></tr></thead>
        <tbody>{customers.map((c) => <tr key={c.id}>
          <td>{c.name}</td><td>{c.customerType === "BUSINESS" ? "شركة" : "فرد"}</td>
          <td>{c.phone || "—"}</td><td>{c.creditLimit} ر.س</td><td>{c.paymentTermsDays}</td><td>{c.saleCount} فاتورة · {c.lifetimeValue} ر.س</td><td>{c.lastPurchase?.slice(0,10) || "—"}</td>
        </tr>)}
        {!customers.length && <tr><td colSpan={7}>أضف أول عميل لتبدأ دورة البيع.</td></tr>}</tbody>
      </table></div>
    </section>
    <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">من العرض إلى البيع</span><h2>إنشاء عرض سعر</h2></div></div>
      <p className="policyNote">هذا عرض سعر داخلي من سطر واحد في الواجهة المبدئية؛ الواجهة البرمجية تدعم عدة أصناف. تغيير حالة «مرسل» لا يرسل بريدًا أو واتساب فعليًا.</p>
      <form className="formGrid" onSubmit={createQuote}>
        <label className="field"><span>العميل</span><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="field"><span>رقم عرض السعر (غير متكرر)</span><input name="quoteNumber" required minLength={3} placeholder="Q-2026-001"/></label>
        <label className="field"><span>وصف الخدمة أو المنتج</span><input name="description" required minLength={2} placeholder="توريد بضاعة / خدمة صيانة"/></label>
        <label className="field"><span>الكمية</span><input name="quantity" required defaultValue="1" pattern="[0-9]+([.][0-9]{1,3})?"/></label>
        <label className="field"><span>سعر الوحدة (ر.س)</span><input name="unitPrice" required defaultValue="0.00" pattern="[0-9]+([.][0-9]{1,2})?"/></label>
        <label className="field"><span>ملاحظة</span><input name="note" maxLength={1000}/></label>
        <div className="formActions"><button className="button primary" disabled={busy || !customers.length}>حفظ مسودة عرض السعر</button></div>
      </form>
    </section>
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">العروض التجارية</span><h2>أحدث عروض الأسعار</h2></div></div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>الرقم</th><th>العميل</th><th>المجموع</th><th>الحالة</th><th>القرار</th></tr></thead>
        <tbody>{quotes.map((q) => <tr key={q.id}>
          <td>{q.quoteNumber}</td><td>{q.customer.name}</td><td>{q.total} ر.س</td>
          <td>{quoteStatuses[q.status] || q.status}</td>
          <td>{q.status === "DRAFT"
            ? <button className="button secondary" type="button" disabled={busy} onClick={() => decideQuote(q.id, "SENT")}>تعليم مرسل يدويًا</button>
            : q.status === "SENT"
              ? <div className="formActions"><button className="button secondary" type="button" disabled={busy} onClick={() => decideQuote(q.id, "ACCEPTED")}>قبول</button>
                <button className="button secondary" type="button" disabled={busy} onClick={() => decideQuote(q.id, "REJECTED")}>رفض</button></div>
              : "—"}</td>
        </tr>)}
        {!quotes.length && <tr><td colSpan={5}>لا توجد عروض حتى الآن.</td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
