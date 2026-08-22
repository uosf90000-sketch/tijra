import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ExpenseCreateForm } from "@/components/expense-create-form";
import { PageHeader } from "@/components/page-header";
import { RetailerServiceGate } from "@/components/retailer-service-gate";
import { getSessionContext } from "@/lib/auth";

export const metadata = { title: "تسجيل مصروف" };

export default async function NewExpensePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  if (context.business.businessType === "RETAILER") {
    return (
      <>
        <PageHeader eyebrow="الملخص المالي" title="المحاسبة المتقدمة" description="حاليًا نعرض للتاجر مشترياته والتزاماته من تِجرا، وتسجيل المصروفات الكامل سيأتي مع نظام المتجر." />
        <RetailerServiceGate service="accounting" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة"
        title="تسجيل مصروف"
        description="أضف مصروفًا تشغيليًا ليظهر تلقائيًا في ملخص الربح."
        actions={<Link className="button secondary" href="/accounting"><ArrowRight size={17} /> رجوع للمحاسبة</Link>}
      />
      <ExpenseCreateForm />
    </>
  );
}
