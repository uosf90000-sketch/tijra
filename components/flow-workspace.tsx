"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RuleType = "LOW_STOCK" | "OVERDUE_RECEIVABLE" | "APPROVAL_WAITING" | "RFQ_DEADLINE" | "DOCUMENT_EXPIRY";
type Rule = { id: string; signalType: RuleType; enabled: boolean };
type Signal = { sourceId: string; type: RuleType; title: string; description: string; href: string };
type Task = { id: string; title: string; description: string | null; status: string; href: string };
const labels: Record<RuleType, string> = {
  LOW_STOCK: "تنبيه انخفاض المخزون بعد خصم التوريد القادم",
  OVERDUE_RECEIVABLE: "تنبيه الذمم المدينة المتأخرة",
  APPROVAL_WAITING: "طلبات مشتريات تنتظر الاعتماد",
  RFQ_DEADLINE: "مواعيد إغلاق عروض الموردين",
  DOCUMENT_EXPIRY: "انتهاء تصاريح ومستندات المنشأة والموردين",
};
const keys = Object.keys(labels) as RuleType[];

export function FlowWorkspace({
  rules, signals, tasks, owner, reviewer,
}: { rules: Rule[]; signals: Signal[]; tasks: Task[]; owner: boolean; reviewer: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const enabled = (type: RuleType) => rules.find((x) => x.signalType === type)?.enabled ?? false;
  async function call(path: string, method: string, payload?: object) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, {
        method, headers: { "content-type": "application/json" },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage("لم تُنفذ العملية: " + (result.error || "تعذر الاتصال"));
        return;
      }
      setMessage(method === "POST"
        ? "تمت مراجعة الإشارات وإنشاء " + (result.tasksCreated || 0) + " مهمة جديدة دون إرسال مشتريات أو رسائل."
        : "تم حفظ قرار الحوكمة.");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال. راجع السجل قبل تكرار العملية.");
    } finally { setBusy(false); }
  }
  async function close(taskId: string, status: "DONE" | "CANCELLED") {
    const reason = window.prompt(status === "DONE"
      ? "اشرح كيف عالجت المهمة (8 أحرف على الأقل):" : "سبب إلغاء المهمة:");
    if (!reason || reason.trim().length < 8) return;
    await call("/api/flow/tasks/" + encodeURIComponent(taskId), "PATCH", { status, reason });
  }
  return <div style={{ display: "grid", gap: 18 }}>
    {message && <div className="infoNote">{message}</div>}
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">إشارات تستحق النظر</span><h2>{signals.length}</h2></article>
      <article className="panel"><span className="eyebrow">مهام مفتوحة</span><h2>{tasks.length}</h2></article>
      <article className="panel"><span className="eyebrow">قواعد مفعّلة</span><h2>{keys.filter(enabled).length}</h2></article>
    </section>
    {owner && <section className="panel" style={{ display: "grid", gap: 11 }}>
      <div className="panelHeader"><div><span className="eyebrow">قواعد التشغيل</span><h2>ما الذي يراقبه تِجرا Flow؟</h2></div></div>
      <p className="policyNote">تفعيل القاعدة يتيح تحويل الإشارة إلى مهمة عند الضغط على «مراجعة وإنشاء مهام». في هذه النسخة لا يوجد مجدول تلقائي ولا إرسال واتساب أو أوامر شراء دون موافقة.</p>
      {keys.map((type) => <label key={type} style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="checkbox" checked={enabled(type)} disabled={busy}
          onChange={(e) => void call("/api/flow", "PATCH", { signalType: type, enabled: e.target.checked })}/>
        {labels[type]}
      </label>)}
    </section>}
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panelHeader"><div><span className="eyebrow">اقتراحات مستندة للبيانات</span><h2>ما الذي يحتاج قرارًا الآن؟</h2></div></div>
      {signals.map((signal) => <div className="alertRow" key={signal.type + signal.sourceId}>
        <div className="grow"><strong>{signal.title}</strong><span>{signal.description}</span></div>
        <Link className="textLink" href={signal.href}>فتح</Link>
      </div>)}
      {!signals.length && <div className="infoNote">لا توجد إشارات ضمن السجلات المفحوصة حاليًا.</div>}
      {reviewer && <div className="formActions">
        <button className="button primary" type="button" disabled={busy}
          onClick={() => void call("/api/flow", "POST")}>مراجعة وإنشاء مهام من القواعد المفعلة</button>
      </div>}
    </section>
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panelHeader"><div><span className="eyebrow">التنفيذ والمساءلة</span><h2>قائمة المهام المفتوحة</h2></div></div>
      {tasks.map((task) => <div className="alertRow" key={task.id}>
        <div className="grow"><strong>{task.title}</strong><span>{task.description}</span></div>
        <Link className="textLink" href={task.href}>فتح الملف</Link>
        {reviewer && <button type="button" className="button secondary" disabled={busy}
          onClick={() => void close(task.id, "DONE")}>تمت المعالجة</button>}
      </div>)}
      {!tasks.length && <p className="policyNote">لا توجد مهام مفعّلة. يمكنك تفعيل القواعد وتشغيل المراجعة.</p>}
    </section>
  </div>;
}
