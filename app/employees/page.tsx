import Link from "next/link";
import { redirect } from "next/navigation";
import { CirclePlus, UserCheck, UsersRound, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { firstPermissionHref, permissionLabels } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الموظفون" };
export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!['OWNER', 'MANAGER'].includes(context.membership.role)) redirect(firstPermissionHref(context.membership));

  const employees = await db.employee.findMany({
    where: { businessId: context.business.id },
    include: {
      payrollItems: { include: { payrollRun: true }, orderBy: { payrollRun: { periodEnd: "desc" } }, take: 1 },
      user: {
        select: {
          email: true,
          memberships: {
            where: { businessId: context.business.id },
            select: { role: true, permissions: true },
          },
        },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const active = employees.filter((item) => item.active);
  const baseTotal = active.reduce((sum, item) => sum + Number(item.baseSalary), 0);
  const expectedTotal = active.reduce((sum, item) => sum + Number(item.baseSalary) + Number(item.defaultAllowance), 0);
  const accounts = employees.filter((item) => item.user).length;

  return (
    <>
      <PageHeader
        eyebrow="فريق العمل"
        title="الموظفون"
        description="بيانات الموظفين ورواتبهم وحسابات الدخول والصلاحيات التي يحددها مالك المنشأة."
        actions={<Link className="button primary" href="/employees/new"><CirclePlus size={17} /> إضافة موظف</Link>}
      />

      <section className="metricsGrid four">
        <MetricCard label="الموظفون النشطون" value={`${active.length}`} note="في المنشأة الحالية" icon={UsersRound} />
        <MetricCard label="حسابات التطبيق" value={`${accounts}`} note="موظفون لديهم دخول TIJRA" icon={UserCheck} tone="blue" />
        <MetricCard label="الرواتب الأساسية" value={formatSar(baseTotal)} note="شهريًا" icon={WalletCards} tone="blue" />
        <MetricCard label="المتوقع مع البدلات" value={formatSar(expectedTotal)} note="قبل الخصومات والسلف" icon={UserCheck} tone="violet" />
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>قائمة الموظفين</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الموظف</th><th>المسمى</th><th>دخول التطبيق</th><th>الصلاحيات</th><th>الراتب الأساسي</th><th>آخر صافي مسير</th><th>الحالة</th></tr></thead>
            <tbody>
              {employees.map((employee) => {
                const latest = employee.payrollItems[0];
                const membership = employee.user?.memberships[0];
                return (
                  <tr key={employee.id}>
                    <td><div className="tablePrimary"><div className="employeeAvatar">{employee.name.slice(0, 1)}</div><div><strong>{employee.name}</strong><span>{employee.phone || "بدون رقم جوال"}</span></div></div></td>
                    <td>{employee.jobTitle || "—"}</td>
                    <td>{employee.user ? <div className="accountStatus"><strong>مفعّل</strong><span dir="ltr">{employee.user.email}</span></div> : <span className="mutedText">بدون حساب</span>}</td>
                    <td>
                      {membership?.permissions.length ? (
                        <div className="permissionPills">{membership.permissions.map((permission) => <span className="permissionPill" key={permission}>{permissionLabels[permission]}</span>)}</div>
                      ) : <span className="mutedText">—</span>}
                    </td>
                    <td>{formatSar(Number(employee.baseSalary))}</td>
                    <td>{latest ? formatSar(Number(latest.netSalary)) : "لم يدخل مسيرًا بعد"}</td>
                    <td><StatusPill status={employee.active ? "active" : "inactive"} /></td>
                  </tr>
                );
              })}
              {!employees.length && <tr><td colSpan={7}><div className="infoNote">لا يوجد موظفون بعد. أضف أول موظف، ويمكن للمالك فتح حساب له وتحديد صلاحياته.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
