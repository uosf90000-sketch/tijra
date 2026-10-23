import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UsersRound, WalletCards, ShoppingBasket } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GovernancePolicyForm } from "@/components/governance-policy-form";
import { GovernanceAccessMatrix } from "@/components/governance-access-matrix";
import { RevokeOtherSessionsButton } from "@/components/revoke-other-sessions-button";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "مركز الحوكمة والرقابة | تِجرا" };
export const dynamic = "force-dynamic";

const categories: Record<string, string> = {
  GOVERNANCE_POLICY_CHANGED: "تغيير سياسات الحوكمة",
  WORKSPACE_PROFILE_UPDATED: "تغيير مساحة العمل",
  COMPANY_SWITCH: "تبديل الشركة",
  STAFF_PERMISSIONS_CHANGED: "تعديل صلاحيات موظف",
  STAFF_ACCOUNT_CREATED: "إنشاء حساب موظف",
  EMPLOYEE_CREATED: "إضافة موظف",
  OTHER_SESSIONS_REVOKED: "إنهاء جلسات الدخول الأخرى",
  PAYROLL_RUN_CREATED: "إنشاء مسير رواتب",
  PAYROLL_APPROVED: "اعتماد مسير رواتب",
  PAYROLL_MARKED_PAID: "تسجيل إثبات دفع رواتب",
  EXPENSE_RECORDED: "تسجيل مصروف",
  PURCHASE_APPROVAL_APPROVE: "اعتماد شراء",
  PURCHASE_APPROVAL_REJECT: "رفض شراء",
  SUPPLIER_PO_CANCELLED: "إلغاء طلب شراء",
  OWNER_SALE_PRICE_CHANGE: "تعديل سعر بيع",
  QUICK_STOCK_IN: "إضافة سريعة للمخزون",
  QUICK_STOCK_OUT: "إخراج سريع من المخزون",
  LOCATION_TRANSFER: "تحويل بين المواقع",
  LOCATION_ACCESS_CHANGED: "تغيير مواقع الموظف",
  SALE_PRICE_OVERRIDE: "خصم أو تعديل على سعر الكاشير",
};
const auditedActions = Object.keys(categories);
const formatDate = (date: Date) => new Intl.DateTimeFormat("ar-SA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
}).format(date);

export default async function GovernancePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect("/management/workspace");
  const businessId = context.business.id;
  const [memberships, pendingOrders, draftPayrolls, recentEvents, recentExpenses, policy, sessions] = await Promise.all([
    db.membership.findMany({
      where: { businessId },
      select: { id: true, userId: true, role: true, permissions: true,
        user: { select: { name: true, email: true } } },
      orderBy: { id: "asc" }, take: 200,
    }),
    db.purchaseOrder.count({ where: { businessId, status: "PENDING_APPROVAL" } }),
    db.payrollRun.count({ where: { businessId, status: "DRAFT" } }),
    db.inventoryAuditEvent.findMany({
      where: { businessId, action: { in: auditedActions } },
      orderBy: { occurredAt: "desc" }, take: 100,
      select: { id: true, action: true, actorName: true, occurredAt: true,
        itemName: true, note: true },
    }),
    db.expense.count({ where: { businessId, amount: { gte: context.business.expenseOwnerThreshold } } }),
    db.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        locationAccessEnforced: true,
        purchaseApprovalEnabled: true, purchaseApprovalThreshold: true,
        payrollDualApprovalEnabled: true, stockReasonRequired: true,
        stockValueReviewThreshold: true, expenseOwnerThreshold: true, cashierMaxDiscountPercent: true,
      },
    }),
    db.session.count({ where: { userId: context.user.id, expiresAt: { gt: new Date() } } }),
  ]);

  return <>
    <PageHeader eyebrow="الرقابة والإدارة" title="مركز حوكمة تِجرا"
      description="سياسات المخاطر، فصل المسؤوليات، مراجعة صلاحيات الموظفين، وآثار العمليات الحساسة في منشأتك."
      actions={<Link className="button secondary" href="/management">العودة للإدارة</Link>} />
    <section className="metricsGrid four">
      <article className="panel"><ShieldCheck size={20}/><span className="eyebrow">سياسات المشتريات</span>
        <h2>{policy.purchaseApprovalEnabled ? "مفعّلة" : "اختيارية"}</h2></article>
      <article className="panel"><ShoppingBasket size={20}/><span className="eyebrow">طلبات تنتظر الموافقة</span>
        <h2>{pendingOrders}</h2><Link className="textLink" href="/purchases/approvals">مراجعة</Link></article>
      <article className="panel"><WalletCards size={20}/><span className="eyebrow">مسيرات بانتظار الاعتماد</span>
        <h2>{draftPayrolls}</h2><Link className="textLink" href="/payroll">الرواتب</Link></article>
      <article className="panel"><UsersRound size={20}/><span className="eyebrow">مستخدمون مرتبطون</span>
        <h2>{memberships.length}</h2></article>
    </section>
    <div className="infoNote" style={{ marginTop: 16, marginBottom: 18 }}>
      <strong>مؤشرات للمتابعة:</strong> {recentExpenses} مصروفات مسجلة تجاوزت حد تدخل المالك،
      {" " + sessions} جلسات نشطة لحساب المالك. تفعيل السياسات هنا لا يحول النظام وحده إلى نظام ERP معتمد أو نظام تدقيق مقاوم للتلاعب الإداري.
    </div>
    <section style={{ display: "grid", gap: 18 }}>
      <GovernancePolicyForm initial={{
        locationAccessEnforced: policy.locationAccessEnforced,
        purchaseApprovalEnabled: policy.purchaseApprovalEnabled,
        purchaseApprovalThreshold: Number(policy.purchaseApprovalThreshold),
        payrollDualApprovalEnabled: policy.payrollDualApprovalEnabled,
        stockReasonRequired: policy.stockReasonRequired,
        stockValueReviewThreshold: Number(policy.stockValueReviewThreshold),
        expenseOwnerThreshold: Number(policy.expenseOwnerThreshold),
        cashierMaxDiscountPercent: Number(policy.cashierMaxDiscountPercent),
      }}/>
      <GovernanceAccessMatrix members={memberships}/>
      <RevokeOtherSessionsButton activeCount={sessions}/>
      <section className="panel tablePanel">
        <div className="panelHeader"><div><span className="eyebrow">أثر كل قرار</span><h2>آخر 100 حركة حوكمة</h2></div>
          <Link className="textLink" href="/activity">سجل التشغيل</Link></div>
        <div className="tableScroll">
          <table className="dataTable"><thead><tr><th>العملية</th><th>المستخدم</th><th>الصنف / المرجع</th><th>الوقت</th><th>السبب والملاحظة</th></tr></thead>
          <tbody>{recentEvents.map((event) => <tr key={event.id}>
            <td><strong>{categories[event.action] || event.action}</strong></td>
            <td>{event.actorName}</td>
            <td>{event.itemName || "—"}</td>
            <td>{formatDate(event.occurredAt)}</td>
            <td><span className="mutedText">{event.note?.slice(0, 250) || "—"}</span></td>
          </tr>)}
          {!recentEvents.length && <tr><td colSpan={5}>لا توجد أحداث حوكمة مسجلة حتى الآن.</td></tr>}
          </tbody></table>
        </div>
        <p className="policyNote">هذا سجل تشغيل مخزن في قاعدة التطبيق، وليس أرشيف تدقيق خارجيًا ثابتًا لا يمكن لمسؤول قاعدة البيانات تغييره.</p>
      </section>
    </section>
  </>;
}
