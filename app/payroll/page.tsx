import { CheckCircle2, CirclePlus, FileText, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { employees, payrollRuns } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";
import { calculateNetSalary, calculatePayrollRun } from "@/lib/payroll";

export const metadata = { title: "الرواتب" };

export default function PayrollPage() {
  const summary = calculatePayrollRun(employees);

  return (
    <>
      <PageHeader
        eyebrow="إدارة الرواتب"
        title="الرواتب"
        description="أنشئ مسيرًا، راجع البدلات والخصومات والسلف، ثم اعتمد صافي كل موظف."
        actions={<button className="button primary"><CirclePlus size={17} /> مسير جديد</button>}
      />

      <section className="metricsGrid three">
        <MetricCard label="إجمالي المستحقات" value={formatSar(summary.gross)} note="أساسي + بدلات" icon={WalletCards} />
        <MetricCard label="الخصومات والسلف" value={formatSar(summary.deductions)} note="لهذه الدورة" icon={FileText} tone="amber" />
        <MetricCard label="صافي الرواتب" value={formatSar(summary.net)} note={`${employees.length} موظفين`} icon={CheckCircle2} tone="blue" />
      </section>

      <section className="panel payrollHero">
        <div className="panelHeader">
          <div>
            <span className="eyebrow">المسير الحالي</span>
            <h2>أغسطس 2026</h2>
          </div>
          <StatusPill status="draft" />
        </div>

        <div className="payrollTotals">
          <div><span>الأساسي والبدلات</span><strong>{formatSar(summary.gross)}</strong></div>
          <div><span>إجمالي الخصم والسلف</span><strong>{formatSar(summary.deductions)}</strong></div>
          <div className="highlight"><span>صافي التحويل</span><strong>{formatSar(summary.net)}</strong></div>
        </div>

        <div className="employeePayrollList">
          {employees.map((employee) => {
            const item = calculateNetSalary(employee);
            return (
              <div className="employeePayrollRow" key={employee.id}>
                <div className="employeeAvatar">{employee.name.slice(0, 1)}</div>
                <div className="grow">
                  <strong>{employee.name}</strong>
                  <span>{employee.role} · أساسي {formatSar(employee.baseSalary)}</span>
                </div>
                <div className="alignEnd">
                  <strong>{formatSar(item.net)}</strong>
                  <span>صافي</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panelActions end">
          <button className="button secondary">حفظ كمسودة</button>
          <button className="button primary"><CheckCircle2 size={17} /> اعتماد المسير</button>
        </div>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">السجل</span><h2>المسيرات السابقة</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الفترة</th><th>الموظفون</th><th>الإجمالي</th><th>الخصومات</th><th>الصافي</th><th>الحالة</th></tr></thead>
            <tbody>
              {payrollRuns.map((run) => (
                <tr key={run.period}>
                  <td><strong>{run.period}</strong></td>
                  <td>{run.employees}</td>
                  <td>{formatSar(run.gross)}</td>
                  <td>{formatSar(run.deductions)}</td>
                  <td><strong>{formatSar(run.net)}</strong></td>
                  <td><StatusPill status={run.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
