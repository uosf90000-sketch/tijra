import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BarChart3, Bell, Calculator, Landmark, UsersRound, WalletCards, Building2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { resolveWorkspaceModules } from "@/lib/workspace-profile";

export const metadata = { title: "الإدارة" };

const tools = [
  { href: "/account/security", title: "أمان الحساب", description: "تفعيل تطبيق المصادقة الثنائية وإدارة حماية الدخول.", icon: ShieldCheck, module: "ALWAYS" },
  { href: "/management/governance", title: "مركز الحوكمة والرقابة", description: "حدود الموافقات، الصلاحيات، سجل القرارات والعمليات الحساسة.", icon: ShieldCheck, module: "ALWAYS" },
  { href: "/management/workspace", title: "الشركات ومساحة العمل", description: "خصص الواجهة حسب حجم المنشأة ونشاطها، وبدّل بين شركات المجموعة.", icon: Building2, module: "ALWAYS" },
  { href: "/sales/analytics", title: "تحليلات المبيعات", description: "المبيعات والربح ومتوسط الفاتورة واتجاه الأداء.", icon: BarChart3, module: "INSIGHTS" },
  { href: "/control-center", title: "مركز الرقابة", description: "المخزون المنخفض والهدر والفروقات والتنبيهات المهمة.", icon: Bell, module: "INSIGHTS" },
  { href: "/accounting", title: "الملخص المالي", description: "الإيرادات والمصروفات والنتيجة المالية.", icon: Calculator, module: "ACCOUNTING" },
  { href: "/accounting/reconciliation", title: "مطابقة الأموال", description: "طابق مبيعات البطاقات والتحويلات مع التسويات الفعلية واكشف أي فرق.", icon: Landmark, module: "ACCOUNTING" },
  { href: "/employees", title: "الموظفون", description: "الحسابات والصلاحيات ومساحات العمل.", icon: UsersRound, module: "STAFF" },
  { href: "/payroll", title: "الرواتب", description: "إدارة رواتب الموظفين من مكان واحد.", icon: WalletCards, module: "STAFF" },
  { href: "/activity", title: "مركز النشاط", description: "من نفذ كل حركة ومتى وما الذي تغير.", icon: Activity, module: "INSIGHTS" },
];

export default async function ManagementHubPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect(firstPermissionHref(context.membership));
  const visible = new Set(resolveWorkspaceModules(context.business.businessScale, context.business.operatingModel, context.business.workspaceModules));

  return (
    <>
      <PageHeader eyebrow="حساب المالك" title="الإدارة" description="التقارير والموظفون والرقابة مجمعة هنا بدل ما تزحم القائمة الرئيسية." />
      <section className="ownerHubGrid">
        {tools.filter((item) => item.module === "ALWAYS" || visible.has(item.module as Parameters<typeof visible.has>[0])).map(({ href, title, description, icon: Icon }) => (
          <Link className="ownerHubCard" href={href} key={href}>
            <span className="ownerHubIcon"><Icon size={22} /></span>
            <div><strong>{title}</strong><span>{description}</span></div>
          </Link>
        ))}
      </section>
    </>
  );
}
