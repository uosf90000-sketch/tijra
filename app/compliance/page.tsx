import Link from "next/link";
import { redirect } from "next/navigation";
import { ComplianceWorkspace } from "@/components/compliance-workspace";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";

export const metadata = { title: "سجل التصاريح والمستندات | تِجرا" };
export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!(await hasBusinessWideRead(context))) redirect("/no-access");
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    redirect("/no-access");
  const [documents, suppliers] = await Promise.all([
    db.complianceDocument.findMany({
      where: { businessId: context.business.id },
      include: { supplier: { select: { name: true } } },
      orderBy: { expiresAt: "asc" }, take: 300,
    }),
    db.supplier.findMany({
      where: { businessId: context.business.id },
      select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300,
    }),
  ]);
  return <>
    <PageHeader eyebrow="تِجرا 360" title="متابعة التصاريح والمستندات"
      description="سجل تواريخ الرخص والتأمينات والمستندات ذات الصلاحية، وراجع ما يحتاج تجديدًا قبل التعطل."
      actions={<Link className="button secondary" href="/flow">متابعة انتهاء المستندات في Flow</Link>} />
    <ComplianceWorkspace
      documents={documents.map((d) => ({
        id: d.id, documentType: d.documentType,
        title: d.title, reference: d.reference,
        expiresAt: d.expiresAt.toISOString(), reviewStatus: d.reviewStatus,
        supplier: d.supplier,
      }))}
      suppliers={suppliers}
      owner={context.membership.role === "OWNER"}
      canEdit={["OWNER", "MANAGER"].includes(context.membership.role)}
    />
  </>;
}
