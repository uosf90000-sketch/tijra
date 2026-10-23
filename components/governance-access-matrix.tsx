"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Permission = "CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING";
type Member = {
  id: string; userId: string; role: string; permissions: Permission[];
  user: { name: string; email: string };
};
const permissionLabels: Record<Permission, string> = {
  CASHIER: "الكاشير", INVENTORY: "المخزون", PURCHASES: "المشتريات", ACCOUNTING: "المحاسبة",
};
const keys = Object.keys(permissionLabels) as Permission[];

export function GovernanceAccessMatrix({ members }: { members: Member[] }) {
  const router = useRouter();
  const [changes, setChanges] = useState<Record<string, Permission[]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  function toggle(item: Member, key: Permission) {
    const old = changes[item.id] ?? item.permissions;
    setChanges((prev) => ({ ...prev, [item.id]: old.includes(key) ?
      old.filter((p) => p !== key) : [...old, key] }));
  }

  async function save(member: Member) {
    if (busy || (reasons[member.id] ?? "").trim().length < 8) {
      setMessage("اكتب سبب التعديل بثمانية أحرف على الأقل.");
      return;
    }
    if (!window.confirm("سيتم تعديل صلاحيات الموظف وإنهاء جلساته الحالية. هل تؤكد؟")) return;
    setBusy(member.id);
    setMessage("");
    try {
      const response = await fetch("/api/governance/access", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          membershipId: member.id, permissions: changes[member.id] ?? member.permissions,
          reason: (reasons[member.id] ?? "").trim(),
        }),
      });
      if (!response.ok) throw new Error("UPDATE_FAILED");
      setMessage("تم تحديث الصلاحيات مع حفظ السبب. يحتاج الموظف تسجيل الدخول مرة أخرى.");
      router.refresh();
    } catch {
      setMessage("تعذر تغيير الصلاحيات. ربما تغيرت عضوية المستخدم.");
    } finally {
      setBusy("");
    }
  }

  return <section className="panel" style={{ display: "grid", gap: 14 }}>
    <div className="panelHeader"><div><span className="eyebrow">التحكم بالوصول</span><h2>مراجعة صلاحيات الحسابات</h2></div></div>
    <div className="infoNote">يمكن للمالك تعديل صلاحيات حسابات الموظفين STAFF فقط. حسابات المالك والمدير والمحاسب لها أدوار منفصلة لا تُرقّى من هذه الشاشة. تعديل الصلاحيات ينهي جلسات الموظف الحالية.</div>
    {members.map((member) => <article key={member.id} className="panel" style={{ display: "grid", gap: 9 }}>
      <div><strong>{member.user.name}</strong><span className="mutedText" style={{ marginInlineStart: 9 }}>{member.role}</span><p className="policyNote">{member.user.email}</p></div>
      {member.role === "STAFF" ? <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {keys.map((key) => <label key={key} style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={(changes[member.id] ?? member.permissions).includes(key)}
              onChange={() => toggle(member, key)} />
            {permissionLabels[key]}
          </label>)}
        </div>
        {changes[member.id] && <>
          <label className="field"><span>سبب تغيير الصلاحيات</span>
            <input value={reasons[member.id] ?? ""} maxLength={500}
              onChange={(event) => setReasons((prev) => ({ ...prev, [member.id]: event.target.value }))} />
          </label>
          <div className="formActions"><button className="button secondary" disabled={Boolean(busy)}
            type="button" onClick={() => save(member)}>حفظ صلاحيات الموظف</button></div>
        </>}
      </> : <span className="mutedText">دور إداري محمي — تعديل هذه الصلاحية يحتاج إجراءً إداريًا منفصلًا.</span>}
    </article>)}
    {message && <div className="infoNote">{message}</div>}
  </section>;
}
