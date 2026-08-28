"use client";

import { CirclePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function PayrollCreateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const period = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(start) };
  }, []);

  async function createRun() {
    if (loading) return;
    if (!window.confirm(`إنشاء مسير ${period.label} كمسودة للمراجعة؟ لن يتم اعتماده أو دفعه تلقائيًا.`)) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/payroll/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ periodStart: period.start, periodEnd: period.end, approve: false, adjustments: [] }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(result.error === "NO_ACTIVE_EMPLOYEES" ? "لا يوجد موظفون نشطون لإنشاء المسير." : "تعذر إنشاء المسير."); return; }
      setMessage(`تم إنشاء مسير ${period.label} كمسودة. راجعه قبل الاعتماد ✅`);
      router.refresh();
    } catch { setMessage("تعذر الاتصال بالخادم."); }
    finally { setLoading(false); }
  }

  return <div><button className="button primary" type="button" onClick={createRun} disabled={loading}><CirclePlus size={17} /> {loading ? "جاري الإنشاء..." : `مسير ${period.label}`}</button>{message ? <div className="infoNote" style={{ marginTop: 8 }}>{message}</div> : null}</div>;
}
