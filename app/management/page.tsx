import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BarChart3, Bell, Calculator, UsersRound, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";

export const metadata = { title: "الإدارة" };

const tools = [
  { href: "/sales/analytics", title: "تحليلات المبيعات", description: "المبيعات والربح ومتوسط الفاتورة واتجاه الأداء.", icon: BarChart3 },
  { href: "/control-center", title: "مركز الرقابة", description: "المخزون المنخفض والهدر والفروقات والتنبيهات المهمة.", icon: Bell },
  { href: "/accounting", title: "الملخص المالي", description: "الإيرادات والمصروفات والنتيجة المالية.", icon: Calculator },
  { href: "/employees", title: "الموظفون", description: "الحسابات والصلاحيات ومساحات العمل.", icon: UsersRound },
  { href: "/payroll", title: "الرواتب", description: "إدارة رواتب الموظفين من مكان واحد.", icon: WalletCards },
  { href: "/activity", title: "مركز النشاط", description: "من نفذ كل حركة ومتى وما الذي تغير.", icon: Activity },
];

export default async function ManagementHubPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect(firstPermissionHref(context.membership));

  return (
    <>
      <PageHeader eyebrow="حساب المالك" title="الإدارة" description="التقارير والموظفون والرقابة مجمعة هنا بدل ما تزحم القائمة الرئيسية." />
      <section className="ownerHubGrid">
        {tools.map(({ href, title, description, icon: Icon }) => (
          <Link className="ownerHubCard" href={href} key={href}>
            <span className="ownerHubIcon"><Icon size={22} /></span>
            <div><strong>{title}</strong><span>{description}</span></div>
          </Link>
        ))}
      </section>
    </>
  );
}
