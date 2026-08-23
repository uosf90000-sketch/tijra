import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Calculator, ChefHat, PackagePlus, PackageSearch, Tags } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { isFoodActivity } from "@/lib/business-experience";

export const metadata = { title: "المنتجات" };

export default async function ProductsHubPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect(firstPermissionHref(context.membership));

  const foodBusiness = isFoodActivity(context.business.businessActivity);
  const tools = [
    { href: "/inventory/new", title: "إضافة منتج", description: foodBusiness ? "اسم المنتج، الصورة والسعر ليظهر مباشرة في كاشير المطعم أو المقهى." : "الاسم والسعر والصورة وبيانات الصنف الأساسية.", icon: PackagePlus },
    ...(foodBusiness ? [{ href: "/recipes", title: "المكونات والإضافات", description: "حدد مكونات كل وجبة أو مشروب، ثم أضف الإضافات والبدائل التي يختارها العميل.", icon: ChefHat }] : []),
    { href: "/inventory/product-settings", title: "طريقة البيع", description: "قطعة، وزن، خدمة أو Serial / IMEI حسب نشاطك.", icon: Calculator },
    { href: "/inventory/units", title: "الوحدات والأحجام", description: "حبة، كرتون، عبوة ووحدات البيع المرتبطة بالباركود.", icon: Tags },
    { href: "/inventory", title: "كميات المنتجات", description: "راجع الكمية الحالية والتغطية وحالة المخزون.", icon: Boxes },
    { href: "/inventory/batches", title: "الدفعات والصلاحية", description: "تابع الدفعات القريبة من الانتهاء والمخزون الفعلي.", icon: PackageSearch },
  ];

  return (
    <>
      <PageHeader eyebrow="إعداد المنشأة" title="المنتجات" description="كل ما يخص إعداد المنتج في مكان واحد. تِجرا يظهر لك الأدوات المناسبة لنشاطك فقط." />
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
