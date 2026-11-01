import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { accessibleLocations, locationAuthorized } from "@/lib/location-access";
import { listInventoryLocations } from "@/lib/commerce-ops";
import { PageHeader } from "@/components/page-header";
import { ServiceJobsWorkspace } from "@/components/service-jobs-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "أوامر الخدمات الميدانية | مدار" };

export default async function ServiceJobsPage() {
  const c = await getSessionContext();
  if (!c) redirect("/login");
  const role = c.membership.role;
  if (!["OWNER","MANAGER","ACCOUNTANT","STAFF"].includes(role)) redirect("/no-access");
  const canManage = role === "OWNER" || role === "MANAGER";
  if (role !== "STAFF" && !(await hasBusinessWideRead(c))) redirect("/no-access");
  const businessId = c.business.id;
  let ownEmployee: string | undefined;
  let allowedLocations: string[] | undefined;
  if (role === "STAFF") {
    const employee = await db.employee.findFirst({
      where: { businessId, userId: c.user.id, active: true }, select: { id: true },
    });
    if (!employee) ownEmployee = "__not_assigned__";
    else ownEmployee = employee.id;
    if (c.business.locationAccessEnforced) {
      allowedLocations = (await accessibleLocations(c)).filter(l=>l.active).map(l=>l.id);
    }
  }
  const [jobs, customers, employees, locations] = await Promise.all([
    db.serviceJob.findMany({
      where: { businessId,
        ...(ownEmployee ? { assignedEmployeeId: ownEmployee } : {}),
        ...(allowedLocations ? { locationId: { in: allowedLocations } } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        assignedEmployee: { select: { id: true, name: true, userId: true } },
      },
      orderBy: { scheduledAt: "asc" }, take: 200,
    }),
    canManage ? db.customer.findMany({
      where: { businessId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300,
    }) : Promise.resolve([]),
    canManage ? db.employee.findMany({
      where: { businessId, active: true }, select: { id: true, name: true },
      orderBy: { name: "asc" }, take: 300,
    }) : Promise.resolve([]),
    canManage ? listInventoryLocations(businessId) : Promise.resolve([]),
  ]);
  const visibleLocations = canManage
    ? await Promise.all(locations.filter(l=>l.active).map(async l=>({
        id:l.id,name:l.name,allowed: await locationAuthorized(c,l.id),
      })))
    : [];
  return <>
    <PageHeader eyebrow="مدار / التشغيل الميداني" title="أوامر الخدمات"
      description="من تسجيل الطلب إلى تعيين الفني والتوثيق الداخلي للإنجاز. كل أمر مرتبط بموقع المنشأة وسجل الالتزامات." />
    <ServiceJobsWorkspace
      jobs={jobs.map(j=>({
        id:j.id, title:j.title, description:j.description, scheduledAt:j.scheduledAt.toISOString(),
        status:j.status, quotedAmount:j.quotedAmount?.toFixed(2) || null,
        customer:j.customer?.name || null, employee:j.assignedEmployee?.name || null,
        assignedToMe:j.assignedEmployee?.userId === c.user.id,
        assignedEmployeeId:j.assignedEmployeeId,
        completionNote:j.completionNote,
      }))}
      customers={customers} employees={employees}
      locations={visibleLocations.filter(l=>l.allowed).map(l=>({id:l.id,name:l.name}))}
      canManage={canManage} canAct={role==="STAFF"||canManage}
      currency={c.business.currency}
    />
  </>;
}
