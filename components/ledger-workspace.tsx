"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; code: string; name: string; kind: string };
type Period = { id: string; title: string; status: string; periodStart: string; periodEnd: string };
type Journal = {
  id: string; description: string; reference: string | null;
  status: string; createdByUserId: string; entryDate: string;
  period: { title: string; status: string };
  lines: Array<{ id: string; side: string; amount: string; account: { code: string; name: string } }>;
};

export function LedgerWorkspace({
  accounts, periods, journals, actorId, dualApproval, isOwner,
}: {
  accounts: Account[]; periods: Period[]; journals: Journal[];
  actorId: string; dualApproval: boolean; isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(path: string, method: string, data: object) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, {
        method, headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage("لم تُحفظ العملية: " + (result.error || "تأكد من البيانات والصلاحيات"));
        return;
      }
      setMessage("تم حفظ العملية في النظام وتسجيلها في سجل التدقيق.");
      router.refresh();
    } catch {
      setMessage("فشل الاتصال؛ راجع السجل قبل إعادة إرسال العملية.");
    } finally { setBusy(false); }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/ledger/accounts", "POST", {
      code: form.get("code"), name: form.get("name"), kind: form.get("kind"),
    });
  }

  async function createPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/ledger/periods", "POST", {
      title: form.get("title"),
      periodStart: String(form.get("start")) + "T00:00:00.000Z",
      periodEnd: String(form.get("end")) + "T23:59:59.999Z",
    });
  }

  async function createJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("debitAccount") === form.get("creditAccount")) {
      setMessage("اختر حسابين مختلفين على الأقل لهذا القيد.");
      return;
    }
    await submit("/api/ledger/journals", "POST", {
      periodId: form.get("periodId"),
      entryDate: String(form.get("entryDate")) + "T12:00:00.000Z",
      description: form.get("description"),
      reference: form.get("reference") || undefined,
      lines: [
        { accountId: form.get("debitAccount"), side: "DEBIT", amount: String(form.get("amount")) },
        { accountId: form.get("creditAccount"), side: "CREDIT", amount: String(form.get("amount")) },
      ],
    });
  }

  return <div style={{ display: "grid", gap: 20 }}>
    {message && <div className="infoNote">{message}</div>}
    {isOwner && <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">الإعداد الأول</span><h2>دليل الحسابات</h2></div></div>
      <form className="formGrid" onSubmit={createAccount}>
        <label className="field"><span>رمز الحساب</span><input name="code" required maxLength={24} placeholder="1100" /></label>
        <label className="field"><span>اسم الحساب</span><input name="name" required minLength={2} placeholder="الصندوق" /></label>
        <label className="field"><span>نوع الحساب</span><select name="kind">
          <option value="ASSET">أصل</option><option value="LIABILITY">التزام</option><option value="EQUITY">حقوق ملكية</option>
          <option value="REVENUE">إيراد</option><option value="EXPENSE">مصروف</option>
        </select></label>
        <div className="formActions"><button className="button secondary" disabled={busy}>إضافة الحساب</button></div>
      </form>
      <p className="policyNote">{accounts.length} حسابًا مسجلًا. الحسابات القائمة تظل مستقلة عن أرقام التقارير السابقة حتى تتم المطابقة.</p>
    </section>}

    {isOwner && <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">الفترات المالية</span><h2>فتح وإقفال الفترة</h2></div></div>
      <form className="formGrid" onSubmit={createPeriod}>
        <label className="field"><span>اسم الفترة</span><input name="title" required minLength={2} placeholder="أكتوبر 2026"/></label>
        <label className="field"><span>من تاريخ</span><input name="start" type="date" required/></label>
        <label className="field"><span>إلى تاريخ</span><input name="end" type="date" required/></label>
        <div className="formActions"><button className="button secondary" disabled={busy}>فتح فترة</button></div>
      </form>
      {periods.map((period) => <div key={period.id} className="alertRow">
        <div className="grow"><strong>{period.title}</strong><span>{period.status === "OPEN" ? "مفتوحة" : "مقفلة"}</span></div>
        {period.status === "OPEN" && <button type="button" className="button secondary" disabled={busy}
          onClick={() => {
            const reason = window.prompt("سبب إقفال الفترة (8 أحرف على الأقل):");
            if (!reason || reason.trim().length < 8) return;
            if (!window.confirm("بعد الإقفال لن يمكن ترحيل أي قيد جديد في هذه الفترة. هل تؤكد؟")) return;
            void submit("/api/ledger/periods", "PATCH", { periodId: period.id, reason });
          }}>إقفال الفترة</button>}
      </div>)}
    </section>}

    <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">قيد يدوي</span><h2>تسجيل المدين والدائن</h2></div></div>
      <div className="infoNote">القيد اليدوي في هذه الواجهة يتكون من سطر مدين وآخر دائن متساويين. يمكن للواجهة البرمجية إدخال قيود متعددة السطور بشرط توازنها. لا تؤثر القيود هنا تلقائيًا في الكاشير أو المدفوعات البنكية.</div>
      <form className="formGrid" onSubmit={createJournal}>
        <label className="field"><span>الفترة المفتوحة</span><select name="periodId" required>
          {periods.filter((p) => p.status === "OPEN").map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select></label>
        <label className="field"><span>تاريخ القيد</span><input name="entryDate" type="date" required /></label>
        <label className="field"><span>الوصف</span><input name="description" minLength={8} required placeholder="وصف المستند المحاسبي" /></label>
        <label className="field"><span>مرجع المستند</span><input name="reference" maxLength={100} /></label>
        <label className="field"><span>الحساب المدين</span><select name="debitAccount" required>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select></label>
        <label className="field"><span>الحساب الدائن</span><select name="creditAccount" required>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select></label>
        <label className="field"><span>المبلغ بالريال (منزلتان عشريتان)</span>
          <input name="amount" required pattern="[0-9]+([.][0-9]{1,2})?" placeholder="100.00" /></label>
        <div className="formActions"><button className="button primary" disabled={busy || accounts.length < 2 || !periods.some((p) => p.status === "OPEN")}>حفظ القيد للمراجعة</button></div>
      </form>
    </section>

    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">دفتر القيود</span><h2>القيود المسجلة</h2></div></div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>الوصف</th><th>التاريخ</th><th>الفترة</th><th>الحالة</th><th>القيود</th><th>الإجراء</th></tr></thead>
        <tbody>{journals.map((entry) => <tr key={entry.id}>
          <td>{entry.description}</td><td>{entry.entryDate.slice(0, 10)}</td><td>{entry.period.title}</td>
          <td>{entry.status === "POSTED" ? "مرحّل" : "مسودة"}</td>
          <td>{entry.lines.map((line) => <div key={line.id}>{line.account.code} {line.side === "DEBIT" ? "مدين" : "دائن"} {line.amount} ر.س</div>)}</td>
          <td>{entry.status === "DRAFT"
            ? <div style={{ display: "grid", gap: 5 }}>
                <button className="button secondary" disabled={busy || entry.period.status !== "OPEN" ||
                  (dualApproval && entry.createdByUserId === actorId)}
                  onClick={() => {
                    if (window.confirm("ترحيل القيد نهائيًا؟ لن يمكن تعديله بعد ذلك.")) {
                      void submit("/api/ledger/journals/" + encodeURIComponent(entry.id) + "/post", "POST", {});
                    }
                  }}>ترحيل القيد</button>
                {(isOwner || entry.createdByUserId === actorId) && <button className="button secondary" disabled={busy}
                  onClick={() => {
                    const reason = window.prompt("سبب سحب المسودة:");
                    if (reason && reason.trim().length >= 8) void submit("/api/ledger/journals", "DELETE", { entryId: entry.id, reason });
                  }}>سحب المسودة</button>}
              </div>
            : <span className="mutedText">مغلق</span>}</td>
        </tr>)}
        {!journals.length && <tr><td colSpan={6}>لا توجد قيود بعد.</td></tr>}
        </tbody></table></div>
    </section>
  </div>;
}
