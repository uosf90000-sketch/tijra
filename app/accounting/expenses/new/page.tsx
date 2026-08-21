import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ExpenseCreateForm } from "@/components/expense-create-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "تسجيل مصروف" };

export default function NewExpensePage() {
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
