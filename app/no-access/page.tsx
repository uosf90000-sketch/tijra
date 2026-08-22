import { ShieldX } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export const metadata = { title: "لا توجد صلاحيات" };

export default async function NoAccessPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  return (
    <section className="panel" style={{ maxWidth: 620, margin: "72px auto", padding: 30, textAlign: "center" }}>
      <div className="softIcon brand" style={{ margin: "0 auto 14px" }}><ShieldX size={22} /></div>
      <span className="eyebrow">صلاحيات الحساب</span>
      <h1 style={{ margin: "8px 0", fontSize: 26 }}>لا توجد أقسام مفعّلة لهذا الحساب</h1>
      <p className="panelLead">اطلب من مالك المنشأة تفعيل صلاحية واحدة أو أكثر من صفحة الموظفين. الحساب الرئيسي يظل بصلاحية كاملة دائمًا.</p>
    </section>
  );
}
