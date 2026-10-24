import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLandingHref, type TiJraRole } from "@/lib/role-workspaces";

export const metadata = { title: "مصفوفة وظائف وصلاحيات مدار" };
export const dynamic = "force-dynamic";

const roles: Array<{ role: TiJraRole; title: string; work: string; data: string }> = [
  { role: "OWNER", title: "مالك المنشأة / الرئيس",
    work: "لوحة القيادة وجميع العمليات والموافقات والحوكمة",
    data: "المؤشرات المجمعة والسجلات لكل منشأته الحالية" },
  { role: "MANAGER", title: "مدير التشغيل",
    work: "مركز التشغيل والمخزون والمشتريات والمهام والأقسام المتاحة",
    data: "أرقام تشغيل مرتبطة بالشركة؛ دون حوكمة حساب المالك" },
  { role: "CASHIER", title: "الكاشير",
    work: "نقطة البيع والورديات المسجلة له",
    data: "المنتجات والمعلومات اللازمة للبيع فقط" },
  { role: "ACCOUNTANT", title: "المحاسب",
    work: "مكتبه المالي والمستحقات والقيود والمطابقة",
    data: "الحركات المالية والمستندات اللازمة للمحاسبة" },
  { role: "SUPPLIER", title: "مسؤول التوريد",
    work: "بوابة المورد ومخزونه وطلباته",
    data: "بيانات المورد المرتبطة بالمنشأة المخول لها" },
  { role: "STAFF", title: "موظف بصلاحيات محددة",
    work: "شاشات بحسب CASHIER / INVENTORY / PURCHASES / ACCOUNTING",
    data: "بيانات المهمة والفروع المسندة عند تفعيل سياسة المواقع" },
];

export default async function RolePermissionsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect("/no-access");
  const counts = await db.membership.groupBy({
    by: ["role"],
    where: { businessId: context.business.id },
    _count: { id: true },
  });
  const numbers = new Map(counts.map((row) => [row.role, row._count.id]));
  return <>
    <PageHeader eyebrow="حوكمة الموظفين" title="من يشاهد ماذا في مدار؟"
      description="دليل حي لتوجيه الأدوار وشاشات الدخول. الإخفاء في الواجهة لا يكفي؛ يلزم تدقيق مسارات الخادم والصلاحيات على كل عملية."
      actions={<Link href="/employees" className="button secondary">الموظفون وصلاحيات حساباتهم</Link>} />
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">توزيع الواجبات</span><h2>مصفوفة الأدوار الأساسية</h2></div></div>
      <div className="tableScroll"><table className="dataTable"><thead>
        <tr><th>الدور</th><th>الحسابات</th><th>بداية الدخول</th><th>الشاشات المهمة</th><th>نوع البيانات</th></tr>
      </thead><tbody>
        {roles.map((item) => <tr key={item.role}>
          <td><strong>{item.title}</strong></td>
          <td>{numbers.get(item.role) || 0}</td>
          <td><code dir="ltr">{roleLandingHref({ role: item.role, permissions: [] })}</code></td>
          <td>{item.work}</td><td>{item.data}</td>
        </tr>)}
      </tbody></table></div>
    </section>
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panelHeader"><div><span className="eyebrow">فصل المهام</span><h2>ربط عام دون توسعة صلاحيات المستخدم</h2></div></div>
      <div className="alertRow"><div><strong>الكاشير</strong><span>يسجل الفاتورة ويربطها بعميل اختياري ويسحب من مخزون الموقع.</span></div></div>
      <div className="alertRow"><div><strong>المحاسب</strong><span>يراجع التسويات والذمم والدفتر المستقل؛ الربط التلقائي للقيود لم يكتمل.</span></div></div>
      <div className="alertRow"><div><strong>المستودع</strong><span>يدير رصيد الأصناف ضمن المواقع المصرح بها عندما تكون سياسة تقييد المواقع مفعلة.</span></div></div>
      <div className="alertRow"><div><strong>مدير التشغيل</strong><span>يتابع الطلبات والنواقص ومهام Flow ويعتمد الإجراءات التي تسمح بها سياسات المنشأة.</span></div></div>
      <div className="alertRow"><div><strong>المالك</strong><span>يرى الصورة العامة من نفس البيانات، دون الدخول لحساب أي موظف.</span></div></div>
      <p className="policyNote">لا يتيح هذا الجدول تعديل الصلاحيات مباشرة. عزل قواعد البيانات على مستوى RLS وكامل اختبارات الصلاحيات لكل API ما زال من شروط الاعتماد للمؤسسات الكبرى.</p>
    </section>
  </>;
}
