"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saleLedgerAccountKinds, type SaleLedgerMapping } from "@/lib/sale-ledger-plan";

type Account = { id: string; code: string; name: string; kind: string };
type Config = SaleLedgerMapping & { enabled: boolean };
type Item = {
  id: string; sourceId: string; draftEntryId: string | null; status: string; createdAt: string; errorCode?: string | null;
};
const labels: Record<keyof SaleLedgerMapping, string> = {
  cashAccountId: "الصندوق / النقد",
  cardAccountId: "تسويات بطاقات (أصل مستحق)",
  transferAccountId: "التحويلات (أصل)",
  otherAccountId: "وسائل دفع أخرى (أصل)",
  revenueAccountId: "إيراد المبيعات (إجمالي دون تفصيل ضريبة)",
  cogsAccountId: "تكلفة البضاعة المباعة",
  inventoryAccountId: "المخزون الدفتري",
};
const fields = Object.keys(labels) as Array<keyof SaleLedgerMapping>;
const blank: Config = {
  cashAccountId: "", cardAccountId: "", transferAccountId: "", otherAccountId: "",
  revenueAccountId: "", cogsAccountId: "", inventoryAccountId: "", enabled: false,
};

export function SaleAccountingAutomation({
  accounts, initial, events, owner, vatRegistered,
}: {
  accounts: Account[]; initial: Config | null; events: Item[];
  owner: boolean; vatRegistered: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Config>(initial || blank);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [taxBasisConfirmed, setTaxBasisConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(url: string, method: "POST" | "PATCH", payload: object) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method, headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "SAVE_FAILED");
      setMessage(method === "POST" ? "راجع نتيجة إعادة إنشاء المسودة؛ لا يوجد ترحيل نهائي تلقائي." : "تم حفظ خريطة الحسابات وسجل الحوكمة.");
      router.refresh();
    } catch (error) {
      setMessage("تعذر التنفيذ: " + (error instanceof Error ? error.message : "خطأ"));
    } finally { setBusy(false); }
  }
  const ready = fields.every((field) => form[field].trim()) && reason.trim().length >= 8;
  return <div style={{ display: "grid", gap: 18 }}>
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panelHeader"><div><span className="eyebrow">ربط الكاشير بالمحاسبة</span>
        <h2>خريطة حسابات المبيعات</h2></div></div>
      <div className="infoNote">الإعداد لا يبدأ دفعًا بنكيًا أو إصدار فاتورة إلكترونية. عند تسجيل بيع، ينشئ تِجرا مصدرًا محاسبيًا دائمًا ويحاول إعداد قيد مزدوج في حالة «مسودة». يعتمد المحاسب القيد بشكل مستقل، مع احترام سياسة الفصل بين الإنشاء والاعتماد.</div>
      {vatRegistered && <div className="infoNote">هذه المنشأة لديها رقم ضريبي؛ لا يمكن تفعيل إعداد قيود المبيعات الإجمالية حتى يكتمل فصل ضريبة القيمة المضافة ومطابقة الفواتير مع متطلبات زاتكا.</div>}
      {owner && <>
        <div className="formGrid">
          {fields.map((field) => <label className="field" key={field}>
            <span>{labels[field]}</span>
            <select value={form[field]} onChange={(event) => setForm((prev) => ({
              ...prev, [field]: event.target.value,
            }))}>
              <option value="">اختر الحساب المناسب</option>
              {accounts.filter((account) => account.kind === saleLedgerAccountKinds[field])
                .map((account) => <option key={account.id} value={account.id}>
                  {account.code} — {account.name}
                </option>)}
            </select>
          </label>)}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={form.enabled} disabled={vatRegistered}
            onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}/>
          إنشاء مسودات قيود البيع تلقائيًا بعد تسجيل الفواتير
        </label>
        <label style={{ display: "flex", gap: 9, alignItems: "start" }}>
          <input type="checkbox" checked={taxBasisConfirmed}
            onChange={(event) => setTaxBasisConfirmed(event.target.checked)}/>
          أقرّ بأن منشأتي غير مطالبة حاليًا بتخصيص ضريبة قيمة مضافة على هذه المبيعات،
          وأنني مسؤول عن مراجعة المعالجة الضريبية لدى محاسب مختص قبل الترحيل.
        </label>
        <label className="field"><span>سبب اعتماد أو تغيير الخريطة</span>
          <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)}/>
        </label>
        <div className="formActions">
          <button type="button" className="button primary" disabled={!ready || busy || (form.enabled && !taxBasisConfirmed)}
            onClick={() => void submit("/api/ledger/automation/mapping", "PATCH", { ...form, reason, taxBasisConfirmed })}>
            حفظ حسابات الربط
          </button>
          <Link className="button secondary" href="/accounting/ledger">إدارة دليل الحسابات والقيود</Link>
        </div>
      </>}
    </section>
    <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">تدقيق مصدر القيود</span>
        <h2>قائمة فواتير مرتبطة أو تنتظر إعداد قيد</h2></div></div>
      <p className="policyNote">كل صف يرتبط بفاتورة بيع واحدة؛ أي محاولة ثانية لإنشاء القيد تتحقق من الربط الأصلي لمنع قيد مزدوج. البيع القديم قبل إضافة سجل المصادر يحتاج ترحيلًا تاريخيًا منفصلًا ومدققًا.</p>
      {message && <div className="infoNote">{message}</div>}
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>مرجع المصدر</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>{events.map((item) => <tr key={item.id}>
          <td dir="ltr">{item.sourceId}</td>
          <td>{item.draftEntryId ? "مسودة منشأة" : item.status === "BLOCKED" ? "متوقف للفحص: " + (item.errorCode || "راجع إعدادات الربط") : "بانتظار إعداد مسودة"}</td>
          <td>{item.draftEntryId
            ? <Link href="/accounting/ledger" className="textLink">مراجعة القيد</Link>
            : <button className="button secondary" type="button" disabled={busy}
                onClick={() => void submit("/api/ledger/automation/events", "POST", { saleId: item.sourceId })}>
                إعادة محاولة إعداد مسودة
              </button>}</td>
        </tr>)}
        {!events.length && <tr><td colSpan={3}>لم تسجل مصادر محاسبية جديدة بعد.</td></tr>}
        </tbody>
      </table></div>
    </section>
  </div>;
}
