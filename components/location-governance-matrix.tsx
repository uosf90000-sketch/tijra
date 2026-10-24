"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = { id: string; role: string; user: { name: string } };
type Location = { id: string; name: string; active: boolean };
type Grant = { membershipId: string; locationId: string };

export function LocationGovernanceMatrix({
  members, locations, grants, enforced,
}: {
  members: Member[]; locations: Location[]; grants: Grant[]; enforced: boolean;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const editable = members.filter((member) => member.role !== "OWNER");
  const active = locations.filter((loc) => loc.active);
  const chosen = (member: Member) => selection[member.id] ??
    grants.filter((grant) => grant.membershipId === member.id).map((grant) => grant.locationId);
  const toggle = (member: Member, locationId: string) => {
    const prev = chosen(member);
    setSelection((state) => ({
      ...state,
      [member.id]: prev.includes(locationId) ?
        prev.filter((x) => x !== locationId) : [...prev, locationId],
    }));
  };

  async function save(member: Member) {
    if (busy || (reason[member.id] ?? "").trim().length < 8) {
      setMessage("اكتب سبب التغيير بثمانية أحرف على الأقل.");
      return;
    }
    if (!window.confirm("سيتم حفظ المواقع المسموحة وإنهاء جلسات الموظف الحالية لتحديث صلاحياته. هل تؤكد؟")) return;
    setBusy(member.id);
    setMessage("");
    try {
      const response = await fetch("/api/governance/locations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          membershipId: member.id, locationIds: chosen(member),
          reason: (reason[member.id] ?? "").trim(),
        }),
      });
      if (!response.ok) throw new Error("UPDATE_FAILED");
      setMessage("حُفظت صلاحيات المواقع في سجل الحوكمة، ويحتاج الموظف دخولًا جديدًا.");
      router.refresh();
    } catch {
      setMessage("تعذر تغيير صلاحيات المواقع. تحقق من العضوية وصحة المواقع.");
    } finally { setBusy(null); }
  }

  return <section className="panel" style={{ display: "grid", gap: 15 }}>
    <div className="panelHeader"><div>
      <span className="eyebrow">حدود الفروع والمستودعات</span>
      <h2>توزيع المواقع حسب الموظف</h2>
    </div></div>
    <div className="infoNote">
      سياسة التقييد الآن: {enforced ? "مفعلة" : "غير مفعلة"}.
      امنح المواقع أولًا، ثم فعّل السياسة من إعدادات الحوكمة.
      عند التفعيل يُرفض تنفيذ العمليات في موقع غير ممنوح للمستخدم؛ تبقى المواقع الأخرى محفوظة.
    </div>
    {!active.length && <div className="infoNote">أضف موقعًا أو مستودعًا أولًا من إعدادات المخزون.</div>}
    {editable.map((member) => <article key={member.id} className="panel" style={{ display: "grid", gap: 10 }}>
      <div><strong>{member.user.name}</strong><span className="mutedText"> · {member.role}</span></div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {active.map((location) => <label key={location.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={chosen(member).includes(location.id)}
            onChange={() => toggle(member, location.id)}/>
          {location.name}
        </label>)}
      </div>
      {selection[member.id] && <div style={{ display: "grid", gap: 8 }}>
        <label className="field"><span>سبب المنح أو الإلغاء</span>
          <input maxLength={500} value={reason[member.id] ?? ""}
            onChange={(event) => setReason((state) => ({ ...state, [member.id]: event.target.value }))}/>
        </label>
        <div className="formActions"><button className="button secondary" type="button" disabled={Boolean(busy)}
          onClick={() => save(member)}>اعتماد مواقع المستخدم</button></div>
      </div>}
    </article>)}
    {message && <div className="infoNote">{message}</div>}
  </section>;
}
