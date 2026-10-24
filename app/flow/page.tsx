import Link from "next/link";
import { redirect } from "next/navigation";
import { FlowWorkspace } from "@/components/flow-workspace";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { currentBusinessSignals } from "@/lib/business-signals";

export const metadata = { title: "مدار Flow | مركز الأتمتة" };
export const dynamic = "force-dynamic";

export default async function FlowPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!(await hasBusinessWideRead(context))) redirect("/no-access");
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    redirect("/no-access");
  const [rules, tasks, signals] = await Promise.all([
    db.automationRule.findMany({ where: { businessId: context.business.id } }),
    db.operatingTask.findMany({
      where: { businessId: context.business.id, status: "OPEN" },
      orderBy: { createdAt: "desc" }, take: 250,
    }),
    currentBusinessSignals(context.business.id),
  ]);
  return <>
    <PageHeader eyebrow="نظام التشغيل الذكي" title="مدار Flow"
      description="التنبيهات تصبح مهامًا واضحة للمسؤول؛ تنفيذ العمليات المالية والشراء ما زال يحتاج موافقة بشرية."
      actions={<Link className="button secondary" href="/management">الإدارة</Link>} />
    <FlowWorkspace
      rules={rules.map((row) => ({ id: row.id, signalType: row.signalType, enabled: row.enabled }))}
      signals={signals.slice(0, 250)}
      tasks={tasks.map((row) => ({
        id: row.id, title: row.title, description: row.description, status: row.status, href: row.href,
      }))}
      owner={context.membership.role === "OWNER"}
      reviewer={["OWNER","MANAGER"].includes(context.membership.role)}
    />
  </>;
}
