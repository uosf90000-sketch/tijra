import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ProductCreateForm } from "@/components/product-create-form";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { isFoodActivity } from "@/lib/business-experience";

export const metadata = { title: "إضافة منتج" };

export default async function NewProductPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const foodBusiness = isFoodActivity(context.business.businessActivity);
  return (
    <>
      <PageHeader
        eyebrow="المنتجات"
        title="إضافة منتج"
        description={foodBusiness ? "أضف اسم المنتج وصورته وسعره ليظهر مباشرة كصورة في كاشير المطعم أو المقهى." : context.business.businessActivity === "HARDWARE" ? "أضف اسم القطعة ورقمها والكمية. الكاشير يقدر يبحث برقم القطعة ويشوف المتوفر فورًا." : "أضف الصنف وبياناته الأساسية. تِجرا يجهز طريقة البيع المناسبة حسب نشاطك."}
        actions={<Link className="button secondary" href="/products"><ArrowRight size={17} /> رجوع للمنتجات</Link>}
      />
      <ProductCreateForm businessActivity={context.business.businessActivity} />
    </>
  );
}
