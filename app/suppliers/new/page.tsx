import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SupplierCreateForm } from "@/components/supplier-create-form";

export const metadata = { title: "إضافة مورد" };

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader
        eyebrow="الموردون"
        title="إضافة مورد"
        description="أضف المورد الذي تتعامل معه حاليًا، ثم سجّل أسعاره على منتجاتك للمقارنة."
        actions={<Link className="button secondary" href="/suppliers"><ArrowRight size={17} /> رجوع للموردين</Link>}
      />
      <SupplierCreateForm />
    </>
  );
}
