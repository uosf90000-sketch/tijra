import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Check, Store, Tags, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveWorkspaceModules } from "@/lib/workspace-profile";

export const metadata = { title: "تهيئة المنشأة" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const businessId = context.business.id;
  const [products, suppliers, employees, prices] = await Promise.all([
    db.product.count({ where: { businessId, active: true } }),
    db.supplier.count({ where: { businessId } }),
    db.employee.count({ where: { businessId, active: true } }),
    db.supplierProduct.count({ where: { supplier: { businessId } } }),
  ]);

  const activeModules = new Set(resolveWorkspaceModules(
    context.business.businessScale, context.business.operatingModel, context.business.workspaceModules,
  ));
  const steps = [
    { title: "خصص مساحة العمل", text: "راجع الأدوات الظاهرة حسب نشاطك وحجم منشأتك.", done: true, href: "/management/workspace", icon: Store },
    ...(activeModules.has("INVENTORY")
      ? [{ title: "أضف المنتجات", text: "سجّل الأرصدة والأسعار لتبدأ إدارة المخزون.", done: products > 0, href: "/inventory/new", icon: Boxes }] : []),
    ...(activeModules.has("PURCHASING")
      ? [{ title: "أضف مورديك", text: "نظم عروض الموردين ومشترياتك.", done: suppliers > 0, href: "/suppliers/new", icon: Store },
         { title: "سجّل أسعار الموردين", text: "فعّل مقارنة الأسعار والشراء الذكي.", done: prices > 0, href: "/suppliers/prices/new", icon: Tags }] : []),
    ...(activeModules.has("STAFF")
      ? [{ title: "أضف الموظفين", text: "هيّئ حسابات العاملين ورواتبهم.", done: employees > 0, href: "/employees/new", icon: UsersRound }] : []),
  ];
  const completed = steps.filter((item) => item.done).length;

  return (
    <>
      <PageHeader
        eyebrow="البداية"
        title={`تهيئة ${context.business.name}`}
        description="نبدأ فقط بالأدوات التي يحتاجها نشاطك، ويمكنك زيادة الوحدات من إعدادات مساحة العمل في أي وقت."
      />

      <section className="onboardingGrid">
        <article className="panel onboardingForm">
          <div className="stepHeader">
            <span className="stepBadge">{completed} من {steps.length}</span>
            <div className="stepProgress"><span style={{ width: `${Math.round((completed / steps.length) * 100)}%` }} /></div>
          </div>

          <div className="formSection">
            <div className="softIcon brand"><Store size={21} /></div>
            <div><h2>{context.business.name}</h2><p>{context.business.city || "لم تُحدد المدينة"} · {context.business.taxNumber ? `رقم ضريبي ${context.business.taxNumber}` : "الرقم الضريبي اختياري"}</p></div>
          </div>

          <div className="onboardingSteps">
            {steps.map(({ title, text, done, href, icon: Icon }) => (
              <Link className="onboardingStep" href={href} key={title} style={{ textDecoration: "none", color: "inherit" }}>
                <span>{done ? <Check size={15} /> : <Icon size={15} />}</span>
                <div><strong>{done ? `تم: ${title}` : title}</strong><p>{text}</p></div>
              </Link>
            ))}
          </div>

          <div className="formActions"><Link className="button primary" href="/">فتح لوحة التحكم</Link></div>
        </article>

        <aside className="panel onboardingAside">
          <span className="eyebrow">حدود تِجرا</span>
          <h2>نشغّل تجارتك، ولا ندخل بينك وبين المورد في التوصيل</h2>
          <div className="onboardingSteps">
            <div className="onboardingStep"><span><Check size={15} /></span><div><strong>المحاسبة والمخزون</strong><p>المبيعات والتكلفة والمصروفات والربح.</p></div></div>
            <div className="onboardingStep"><span><Check size={15} /></span><div><strong>الموردون والمشتريات</strong><p>أسعار وطلبات ومقارنة وتنبيه نقص.</p></div></div>
            <div className="onboardingStep"><span><Check size={15} /></span><div><strong>الموظفون والرواتب</strong><p>بيانات الموظفين ومسيرات الرواتب.</p></div></div>
            <div className="onboardingStep"><span><Check size={15} /></span><div><strong>لا تمويل ولا توصيل</strong><p>لا إقراض ولا تشغيل لوجستي داخل المنصة.</p></div></div>
          </div>
        </aside>
      </section>
    </>
  );
}
