import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EmployeeCreateForm } from "@/components/employee-create-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "إضافة موظف" };

export default function NewEmployeePage() {
  return (
    <>
      <PageHeader
        eyebrow="الموظفون"
        title="إضافة موظف"
        description="أضف بيانات الموظف والراتب الأساسي والبدلات الافتراضية."
        actions={<Link className="button secondary" href="/employees"><ArrowRight size={17} /> رجوع للموظفين</Link>}
      />
      <EmployeeCreateForm />
    </>
  );
}
