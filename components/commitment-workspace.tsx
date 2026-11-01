"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Entry = {
  id: string; kind: string; status: string; title: string; expectedAt: string;
  fulfilledAt: string | null; expectedAmount: string | null;
  evidenceNote: string | null; counterparty: string;
};
type Option = { id: string; label: string };
export function CommitmentWorkspace({ entries, orderOptions, customerOptions, totalCount, currency, canEdit }: {
  entries: Entry[]; orderOptions: Option[]; customerOptions: Array<{ id: string; name: string }>;
  totalCount: number; currency: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"SUPPLIER_DELIVERY" | "SERVICE_COMPLETION">("SUPPLIER_DELIVERY");
  const now = Date.now();
  const overdue = entries.filter(x => x.status === "OPEN" && new Date(x.expectedAt).getTime() < now).length;
  const fulfilled = entries.filter(x => x.status === "FULFILLED").length;
  async function send(url: string, method: string, body: object) {
    setBusy(true); setMessage("");
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage("تعذر تنفيذ العملية: " + (data.error || "راجع البيانات")); return; }
      setMessage("تم تسجيل العملية داخل مدار؛ لا يعتبر ذلك إثبات تسليم أو دفع صادرًا من جهة مستقلة.");
      router.refresh();
    } catch { setMessage("تعذر الاتصال. راجع السجل قبل تكرار الطلب."); }
    finally { setBusy(false); }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = String(data.get("expectedAt") || "");
    if (!date) { setMessage("اختر تاريخ الاستحقاق"); return; }
    const expectedAt = date + "T12:00:00.000Z";
    if (kind === "SUPPLIER_DELIVERY") {
      const sourceId = String(data.get("sourceId") || "");
      if (!sourceId) { setMessage("اختر طلب شراء لم يسجل له موعد"); return; }
      await send("/api/commitments", "POST", { kind, title: "موعد توريد", sourceId, expectedAt });
    } else {
      await send("/api/commitments", "POST", {
        kind, title: String(data.get("title") || ""), expectedAt,
        customerId: data.get("customerId") || undefined,
        expectedAmount: data.get("expectedAmount") || undefined,
      });
    }
  }
  async function close(id: string, status: "FULFILLED" | "CANCELLED") {
    const reason = window.prompt("أدخل سبب الإغلاق أو بيانات إثبات التنفيذ (8 أحرف على الأقل):");
    if (!reason || reason.trim().length < 8) return;
    await send("/api/commitments/" + encodeURIComponent(id), "PATCH", { status, evidenceNote: reason });
  }
  return <div style={{ display: "grid", gap: 18 }}>
    {message && <div className="infoNote" role="status">{message}</div>}
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">التزامات في السجل</span><h2>{totalCount}</h2></article>
      <article className="panel"><span className="eyebrow">متأخرة في المعروض</span><h2>{overdue}</h2></article>
      <article className="panel"><span className="eyebrow">موثقة كمنجزة داخليًا في المعروض</span><h2>{fulfilled}</h2></article>
    </section>
    <div className="infoNote">الإنجاز والتحصيل مبنيان على تسجيل المستخدم أو إجراء النظام الداخلي، وليسا تحققًا مصرفيًا أو إثباتًا من المورد. يتم عرض آخر 250 التزامًا بحسب موعد الاستحقاق، وليس إجمالي كل السجلات عند تجاوز هذا الحد.</div>
    {canEdit && <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">الموعد والتعهد</span><h2>تسجيل التزام</h2></div></div>
      <form className="formGrid" onSubmit={add}>
        <label className="field"><span>نوع الالتزام</span><select value={kind} onChange={e => setKind(e.currentTarget.value as typeof kind)}>
          <option value="SUPPLIER_DELIVERY">موعد توريد مرتبط بطلب شراء</option>
          <option value="SERVICE_COMPLETION">إكمال خدمة / مهمة</option>
        </select></label>
        {kind === "SUPPLIER_DELIVERY"
          ? <label className="field"><span>طلب الشراء</span><select name="sourceId" required defaultValue="">
              <option value="">اختر الطلب</option>
              {orderOptions.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select></label>
          : <>
            <label className="field"><span>اسم الخدمة أو المهمة</span><input name="title" minLength={3} maxLength={180} required placeholder="فحص وصيانة التكييف" /></label>
            <label className="field"><span>العميل (اختياري)</span><select name="customerId" defaultValue=""><option value="">بدون عميل مرتبط</option>{customerOptions.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="field"><span>القيمة المتوقعة (اختياري، {currency})</span><input name="expectedAmount" type="number" min="0" step="0.01" /></label>
          </>}
        <label className="field"><span>التاريخ المسجل للالتزام</span><input name="expectedAt" type="date" required /></label>
        <div className="formActions"><button type="submit" className="button primary" disabled={busy}>{busy ? "جارٍ الحفظ" : "تسجيل الالتزام"}</button></div>
      </form>
    </section>}
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">متابعة موحدة</span><h2>التعهدات ومواعيدها</h2></div></div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>الالتزام</th><th>الجهة</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th><th>الإجراء</th></tr></thead>
        <tbody>{entries.map(x => {
          const status = x.status === "OPEN" && new Date(x.expectedAt).getTime() < now ? "OVERDUE" : x.status;
          return <tr key={x.id}>
            <td><strong>{x.title}</strong><div className="mutedText">{x.kind === "SUPPLIER_DELIVERY" ? "توريد" : x.kind === "CUSTOMER_PAYMENT" ? "تحصيل عميل" : "خدمة"}{x.evidenceNote ? " · " + x.evidenceNote : ""}</div></td>
            <td>{x.counterparty}</td><td>{x.expectedAmount ? x.expectedAmount + " " + currency : "—"}</td>
            <td>{x.expectedAt.slice(0,10)}</td>
            <td>{status === "OVERDUE" ? "متأخر" : status === "FULFILLED" ? "سجل كمنجز" : status === "CANCELLED" ? "ملغي" : "مفتوح"}</td>
            <td>{canEdit && x.kind === "SERVICE_COMPLETION" && x.status === "OPEN"
              ? <div style={{ display: "flex", gap: 8 }}>
                <button className="button secondary" type="button" disabled={busy} onClick={() => close(x.id, "FULFILLED")}>توثيق الإنجاز</button>
                <button className="button secondary" type="button" disabled={busy} onClick={() => close(x.id, "CANCELLED")}>إلغاء</button>
              </div>
              : <span className="mutedText">حسب مصدر الالتزام</span>}</td>
          </tr>;
        })}
        {!entries.length && <tr><td colSpan={6}>لم تُسجل التزامات بعد.</td></tr>}
        </tbody></table></div>
    </section>
  </div>;
}
