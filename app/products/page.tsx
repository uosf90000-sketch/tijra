import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Calculator, ChefHat, PackagePlus, PackageSearch, Tags } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";

export const metadata = { title: "المنتجات" };

const tools = [
  { href: "/inventory/new", title: "إضافة منتج", description: "الاسم والسعر والصورة وبيانات الصنف الأساسية.", icon: PackagePlus },
  { href: "/recipes", title: "المكونات والوصفات", description: "اربط المنتج بالبن والحليب والكوب أو مكونات الوجبة.", icon: ChefHat },
  { href: "/inventory/product-settings", title: "طريقة البيع", description: "قطعة، وزن، خدمة، وصفة أو Serial / IMEI.", icon: Calculator },
  { href: "/inventory/units", title: "الوحدات والأحجام", description: "حبة، كرتون، عبوة ووحدات البيع المرتبطة بالباركود.", icon: Tags },
  { href: "/inventory", title: "كميات المنتجات", description: "راجع الكمية الحالية والتغطية وحالة المخزون.", icon: Boxes },
  { href: "/inventory/batches", title: "الدفعات والصلاحية", description: "تابع الدفعات القريبة من الانتهاء والمخزون الفعلي.", icon: PackageSearch },
];

export default async function ProductsHubPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect(firstPermissionHref(context.membership));

  return (
    <>
      <PageHeader eyebrow="إعداد المنشأة" title="المنتجات" description="كل ما يخص إعداد المنتج في مكان واحد. بعد ضبطه مرة واحدة، الكاشير والمخزون يعملان تلقائيًا." />
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
