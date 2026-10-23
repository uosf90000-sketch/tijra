import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2 } from "lucide-react";
import { CompanyWorkspaceManager } from "@/components/company-workspace-manager";
import { WorkspaceProfileForm } from "@/components/workspace-profile-form";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "الشركات ومساحات العمل | تِجرا" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const memberships = await db.membership.findMany({
    where: { userId: context.user.id },
    include: { business: true },
    orderBy: { id: "asc" },
  });

  return <>
    <PageHeader eyebrow="الإعدادات" title="مساحة العمل والشركات"
      description="نظام واحد يمكن تبسيط واجهته لفود ترك أو توسيعها لشركة، مع شركات مستقلة لكل عضوية مخولة."
      actions={<Link className="button secondary" href="/management"><ArrowRight size={17} /> الإدارة</Link>} />
    {context.membership.role === "OWNER" && (
      <section style={{ marginBottom: 22 }}>
        <WorkspaceProfileForm
          key={context.business.id}
          initialScale={context.business.businessScale}
          initialModel={context.business.operatingModel}
          initialModules={context.business.workspaceModules}
          initialApprovalEnabled={context.business.purchaseApprovalEnabled}
          initialApprovalThreshold={Number(context.business.purchaseApprovalThreshold)}
        />
      </section>
    )}
    <CompanyWorkspaceManager
      key={context.business.id}
      companies={memberships.map(({ business, role }) => ({
        id: business.id, name: business.name, role,
        businessScale: business.businessScale,
        operatingModel: business.operatingModel,
        organizationId: business.organizationId,
      }))}
      activeBusinessId={context.business.id}
      canCreate={context.membership.role === "OWNER"}
    />
    <section className="infoNote" style={{ marginTop: 20 }}>
      <Building2 size={17} /> يحتاج تشغيل مجموعة كبيرة حقيقي إلى ضبط مستويات صلاحيات الفروع، وسجلات المراجعة،
      وتجميع مالي بين الشركات، وتكاملات الأنظمة الخارجية واختبارات أمن وأداء قبل اعتماده للإنتاج المؤسسي.
    </section>
  </>;
}
