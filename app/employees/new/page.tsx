import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EmployeeCreateForm } from "@/components/employee-create-form";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";

export const metadata = { title: "إضافة موظف" };

export default async function NewEmployeePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  return (
    <>
      <PageHeader
        eyebrow="الموظفون"
        title="إضافة موظف"
        description="أضف بيانات الموظف، وإذا رغبت افتح له حسابًا وحدد الأقسام التي يستطيع استخدامها."
        actions={<Link className="button secondary" href="/employees"><ArrowRight size={17} /> رجوع للموظفين</Link>}
      />
      <EmployeeCreateForm canCreateAccount={context.membership.role === "OWNER"} />
    </>
  );
}
