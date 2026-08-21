import { CirclePlus, UserCheck, UsersRound, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { employees } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";
import { calculateNetSalary } from "@/lib/payroll";

export const metadata = { title: "الموظفون" };

export default function EmployeesPage() {
  const baseTotal = employees.reduce((sum, item) => sum + item.baseSalary, 0);
  const netTotal = employees.reduce((sum, item) => sum + calculateNetSalary(item).net, 0);

  return (
    <>
      <PageHeader
        eyebrow="فريق العمل"
        title="الموظفون"
        description="بيانات الموظفين ورواتبهم الأساسية والبدلات والخصومات والسلف من مكان واحد."
        actions={<button className="button primary"><CirclePlus size={17} /> إضافة موظف</button>}
      />

      <section className="metricsGrid three">
        <MetricCard label="الموظفون النشطون" value={`${employees.length}`} note="في المنشأة الحالية" icon={UsersRound} />
        <MetricCard label="الرواتب الأساسية" value={formatSar(baseTotal)} note="شهريًا" icon={WalletCards} tone="blue" />
        <MetricCard label="الصافي المتوقع" value={formatSar(netTotal)} note="بعد البدلات والخصومات والسلف" icon={UserCheck} tone="violet" />
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">السجل</span><h2>قائمة الموظفين</h2></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الموظف</th><th>المسمى</th><th>الراتب الأساسي</th><th>البدلات</th><th>الخصومات</th><th>السلف</th><th>الصافي</th><th>الحالة</th></tr></thead>
            <tbody>
              {employees.map((employee) => {
                const net = calculateNetSalary(employee).net;
                return (
                  <tr key={employee.id}>
                    <td>
                      <div className="tablePrimary">
                        <div className="employeeAvatar">{employee.name.slice(0, 1)}</div>
                        <div><strong>{employee.name}</strong><span>#{employee.id.toUpperCase()}</span></div>
                      </div>
                    </td>
                    <td>{employee.role}</td>
                    <td>{formatSar(employee.baseSalary)}</td>
                    <td className="positive">{formatSar(employee.allowances)}</td>
                    <td>{formatSar(employee.deductions)}</td>
                    <td>{formatSar(employee.advances)}</td>
                    <td><strong>{formatSar(net)}</strong></td>
                    <td><StatusPill status={employee.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
