import { redirect } from "next/navigation";
import { Banknote, Clock3, ReceiptText } from "lucide-react";
import { ShiftManager } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ensureDefaultLocation, getOpenShift, listShifts } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الورديات" };
export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  const location = await ensureDefaultLocation(context.business.id);
  const [openShift, shifts] = await Promise.all([getOpenShift(context.business.id, location.id), listShifts(context.business.id, 50)]);
  const closed = shifts.filter((x) => x.status === "CLOSED");
  const discrepancy = closed.reduce((sum, shift) => sum + Math.abs((shift.actualCash ?? 0) - (shift.expectedCash ?? 0)), 0);
  const latestDifference = closed[0] ? (closed[0].actualCash ?? 0) - (closed[0].expectedCash ?? 0) : 0;
  return <>
    <PageHeader eyebrow="الكاشير" title="الورديات" description="افتح الوردية برصيد الصندوق، وعند الإقفال يقارن تِجرا النقد المتوقع بالموجود الفعلي ويحفظ الموظف والفرق." />
    <section className="metricsGrid three"><MetricCard label="حالة الوردية" value={openShift ? "مفتوحة" : "مقفلة"} note={openShift ? `بدأت ${new Intl.DateTimeFormat("ar-SA", { timeStyle: "short" }).format(openShift.openedAt)}` : "جاهز لوردية جديدة"} icon={Clock3} /><MetricCard label="آخر فرق نقدي" value={formatSar(latestDifference)} note="الفعلي ناقص المتوقع" icon={Banknote} tone="amber" /><MetricCard label="إجمالي الفروقات" value={formatSar(discrepancy)} note={`${closed.length} وردية مقفلة`} icon={ReceiptText} tone="violet" /></section>
    <ShiftManager openShift={openShift ? { id: openShift.id, openingCash: openShift.openingCash, openedAt: openShift.openedAt.toISOString() } : null} defaultLocationId={location.id} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>الورديات السابقة</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الموظف</th><th>الفتح</th><th>الإقفال</th><th>رصيد البداية</th><th>المتوقع</th><th>الفعلي</th><th>الفرق</th></tr></thead><tbody>{shifts.map((shift) => { const diff = shift.status === "CLOSED" ? (shift.actualCash ?? 0) - (shift.expectedCash ?? 0) : null; return <tr key={shift.id}><td><strong>{shift.actorName}</strong></td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(shift.openedAt)}</td><td>{shift.closedAt ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(shift.closedAt) : "مفتوحة"}</td><td>{formatSar(shift.openingCash)}</td><td>{shift.expectedCash == null ? "—" : formatSar(shift.expectedCash)}</td><td>{shift.actualCash == null ? "—" : formatSar(shift.actualCash)}</td><td className={diff == null ? "" : Math.abs(diff) < 0.01 ? "positive" : "dangerText"}>{diff == null ? "—" : formatSar(diff)}</td></tr>; })}{!shifts.length && <tr><td colSpan={7}><div className="infoNote">لا توجد ورديات بعد.</div></td></tr>}</tbody></table></div></section>
  </>;
}
