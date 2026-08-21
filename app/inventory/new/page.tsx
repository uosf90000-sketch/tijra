import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCreateForm } from "@/components/product-create-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "إضافة صنف" };

export default function NewProductPage() {
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
