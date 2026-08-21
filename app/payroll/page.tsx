import { redirect } from "next/navigation";
import { CheckCircle2, FileText, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PayrollCreateButton } from "@/components/payroll-create-button";
import { StatusPill } from "@/components/status-pill";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الرواتب" };
export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const [employees, runs] = await Promise.all([
    db.employee.findMany({ where: { businessId: context.business.id, active: true }, orderBy: { name: "asc" } }),
    db.payrollRun.findMany({
      where: { businessId: context.business.id },
      include: { items: { include: { employee: true } } },
      orderBy: { periodEnd: "desc" },
      take: 12,
    }),
  ]);

  const current = runs[0];
  const expectedGross = employees.reduce((sum, item) => sum + Number(item.baseSalary) + Number(item.defaultAllowance), 0);
  const currentGross = current?.items.reduce((sum, item) => sum + Number(item.baseSalary) + Number(item.allowances), 0) ?? expectedGross;
  const currentDeductions = current?.items.reduce((sum, item) => sum + Number(item.deductions) + Number(item.advances), 0) ?? 0;
  const currentNet = current?.items.reduce((sum, item) => sum + Number(item.netSalary), 0) ?? expectedGross;
  const formatter = new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        eyebrow="إدارة الرواتب"
        title="الرواتب"
        description="أنشئ المسيرات واحفظ صافي الموظفين داخل قاعدة البيانات."
        actions={<PayrollCreateButton />}
      />

      <section className="metricsGrid three">
        <MetricCard label="إجمالي المستحقات" value={formatSar(currentGross)} note="أساسي + بدلات" icon={WalletCards} />
        <MetricCard label="الخصومات والسلف" value={formatSar(currentDeductions)} note={current ? "في آخر مسير" : "لا يوجد مسير بعد"} icon={FileText} tone="amber" />
        <MetricCard label="صافي الرواتب" value={formatSar(currentNet)} note={`${employees.length} موظفين نشطين`} icon={CheckCircle2} tone="blue" />
      </section>

      <section className="panel payrollHero">
        <div className="panelHeader">
          <div><span className="eyebrow">{current ? "آخر مسير" : "التقدير الحالي"}</span><h2>{current ? formatter.format(current.periodStart) : "أنشئ أول مسير"}</h2></div>
          <StatusPill status={current?.status.toLowerCase() ?? "draft"} />
        </div>

        <div className="payrollTotals">
          <div><span>الأساسي والبدلات</span><strong>{formatSar(currentGross)}</strong></div>
          <div><span>إجمالي الخصم والسلف</span><strong>{formatSar(currentDeductions)}</strong></div>
          <div className="highlight"><span>صافي الرواتب</span><strong>{formatSar(currentNet)}</strong></div>
        </div>

        <div className="employeePayrollList">
          {(current?.items ?? []).map((item) => (
            <div className="employeePayrollRow" key={item.id}>
              <div className="employeeAvatar">{item.employee.name.slice(0, 1)}</div>
              <div className="grow"><strong>{item.employee.name}</strong><span>{item.employee.jobTitle || "موظف"} · أساسي {formatSar(Number(item.baseSalary))}</span></div>
              <div className="alignEnd"><strong>{formatSar(Number(item.netSalary))}</strong><span>صافي</span></div>
            </div>
          ))}
          {!current && employees.map((employee) => (
            <div className="employeePayrollRow" key={employee.id}>
              <div className="employeeAvatar">{employee.name.slice(0, 1)}</div>
              <div className="grow"><strong>{employee.name}</strong><span>{employee.jobTitle || "موظف"} · أساسي {formatSar(Number(employee.baseSalary))}</span></div>
              <div className="alignEnd"><strong>{formatSar(Number(employee.baseSalary) + Number(employee.defaultAllowance))}</strong><span>متوقع</span></div>
            </div>
          ))}
          {!employees.length && <div className="infoNote">أضف موظفين أولًا قبل إنشاء مسير رواتب.</div>}
        </div>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>المسيرات السابقة</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الفترة</th><th>الموظفون</th><th>الإجمالي</th><th>الخصومات والسلف</th><th>الصافي</th><th>الحالة</th></tr></thead>
            <tbody>
              {runs.map((run) => {
                const gross = run.items.reduce((sum, item) => sum + Number(item.baseSalary) + Number(item.allowances), 0);
                const deductions = run.items.reduce((sum, item) => sum + Number(item.deductions) + Number(item.advances), 0);
                const net = run.items.reduce((sum, item) => sum + Number(item.netSalary), 0);
                return (
                  <tr key={run.id}>
                    <td><strong>{formatter.format(run.periodStart)}</strong></td>
                    <td>{run.items.length}</td>
                    <td>{formatSar(gross)}</td>
                    <td>{formatSar(deductions)}</td>
                    <td><strong>{formatSar(net)}</strong></td>
                    <td><StatusPill status={run.status.toLowerCase()} /></td>
                  </tr>
                );
              })}
              {!runs.length && <tr><td colSpan={6}><div className="infoNote">لا توجد مسيرات محفوظة بعد.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
