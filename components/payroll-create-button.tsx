"use client";

import { CirclePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PayrollCreateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function createRun() {
    setLoading(true);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const response = await fetch("/api/payroll/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd, approve: false, adjustments: [] }),
    });
    setLoading(false);
    if (response.ok) router.refresh();
  }

  return <button className="button primary" onClick={createRun} disabled={loading}><CirclePlus size={17} /> {loading ? "جاري الإنشاء..." : "مسير جديد"}</button>;
}
