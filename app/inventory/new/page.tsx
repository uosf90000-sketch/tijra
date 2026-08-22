import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ProductCreateForm } from "@/components/product-create-form";
import { PageHeader } from "@/components/page-header";
import { RetailerServiceGate } from "@/components/retailer-service-gate";
import { getSessionContext } from "@/lib/auth";

export const metadata = { title: "إضافة صنف" };

export default async function NewProductPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  if (context.business.businessType === "RETAILER") {
    return (
      <>
        <PageHeader eyebrow="نظام المتجر" title="إضافة أصناف للجرد" description="إضافة الأصناف اليدوية للتاجر ستكون ضمن نظام الجرد وقارئ الباركود القادم." />
        <RetailerServiceGate service="inventory" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="المخزون"
        title="إضافة صنف"
        description="أضف الصنف ورصيده الافتتاحي وتكلفته ونقطة إعادة الطلب."
        actions={<Link className="button secondary" href="/inventory"><ArrowRight size={17} /> رجوع للمخزون</Link>}
      />
      <ProductCreateForm />
    </>
  );
}
