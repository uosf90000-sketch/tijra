import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadVisibleRoleWidgets } from "@/lib/role-dashboard-config";
import {
  canEnterRoleWorkbench, effectivePermissions, roleLandingLabel,
} from "@/lib/role-workspaces";

export const metadata = { title: "مساحة العمل | تِجرا" };
export const dynamic = "force-dynamic";

type Tile = { title: string; value: string; description: string; href: string };
type ActionLink = { title: string; href: string; description: string };

export default async function WorkbenchPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!canEnterRoleWorkbench(context.membership)) redirect("/no-access");

  const businessId = context.business.id;
  const visible = await loadVisibleRoleWidgets(businessId, context.membership);
  const permissions = effectivePermissions(context.membership);
  const manager = context.membership.role === "MANAGER";
  const [pendingPurchases, lowStock, overdueReceivables, openTasks, todaySales] = await Promise.all([
    permissions.includes("PURCHASES")
      ? db.purchaseOrder.count({ where: { businessId, status: "PENDING_APPROVAL" } }) : null,
    permissions.includes("INVENTORY")
      ? db.product.findMany({ where: { businessId, active: true },
          select: { quantity: true, reorderPoint: true }, take: 2000 }) : null,
    permissions.includes("ACCOUNTING")
      ? db.receivable.count({ where: { businessId, status: { in: ["OPEN", "PARTIALLY_PAID"] },
          dueAt: { lt: new Date() } } }) : null,
    manager ? db.operatingTask.count({ where: { businessId, status: "OPEN" } }) : null,
    manager ? db.sale.count({ where: { businessId, soldAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }) : null,
  ]);

  const tiles: Tile[] = [];
  const actions: ActionLink[] = [];
  if (manager) {
    tiles.push({ title: "فواتير اليوم", value: String(todaySales ?? 0),
      description: "عدد فواتير الكاشير المسجلة", href: "/sales/analytics" });
  }
  if (permissions.includes("INVENTORY")) {
    tiles.push({ title: "مخزون يحتاج مراجعة",
      value: String((lowStock || []).filter((p) => Number(p.quantity) <= Number(p.reorderPoint)).length),
      description: "ضمن أول 2000 صنف نشط (النتيجة قد تكون جزئية)", href: context.membership.role === "STAFF" ? "/staff/inventory" : "/inventory" });
    actions.push({ title: "المستودع والجرد", href: context.membership.role === "STAFF" ? "/staff/inventory" : "/inventory",
      description: "الكميات والحركة والاستلام ضمن الصلاحيات" });
  }
  if (permissions.includes("PURCHASES")) {
    tiles.push({ title: "مشتريات تنتظر الاعتماد", value: String(pendingPurchases ?? 0),
      description: "طلبات لم ترسل للمورد بعد", href: context.membership.role === "STAFF" ? "/marketplace/orders" : "/purchases" });
    actions.push({ title: "طلبات السوق", href: "/marketplace/orders",
      description: "الطلبات المسموحة ومتابعة الاستلام" });
    if (manager) actions.push({ title: "عروض أسعار الموردين", href: "/sourcing",
      description: "مقارنة العروض وإنشاء طلب شراء" });
  }
  if (permissions.includes("ACCOUNTING")) {
    tiles.push({ title: "ذمم متأخرة", value: String(overdueReceivables ?? 0),
      description: "مستحقات مفتوحة تجاوزت الموعد", href: "/workbench/accounting" });
    actions.push({ title: "المحاسبة والتحصيل", href: "/workbench/accounting",
      description: "المالية والتسويات والذمم ضمن الصلاحية" });
  }
  if (permissions.includes("CASHIER")) {
    actions.unshift({ title: "شاشة الكاشير", href: "/sales",
      description: "مسح المنتجات وتسجيل الفواتير والوردية" });
  }
  if (manager) {
    tiles.push({ title: "مهام تشغيل مفتوحة", value: String(openTasks ?? 0),
      description: "تتطلب متابعة من مسؤول", href: "/flow" });
    actions.push({ title: "تِجرا Flow", href: "/flow", description: "القرارات والتأخيرات عبر الأقسام" });
    actions.push({ title: "العملاء والمبيعات", href: "/crm", description: "العملاء وعروض الأسعار" });
    actions.push({ title: "نبض الأعمال", href: "/intelligence", description: "متابعة أداء الأقسام" });
  }

  const widgetForTile = (title: string) =>
    title === "فواتير اليوم" ? "SALES" :
    title === "مخزون يحتاج مراجعة" ? "INVENTORY" :
    title === "مشتريات تنتظر الاعتماد" ? "PURCHASES" :
    title === "ذمم متأخرة" ? "RECEIVABLES" : "TASKS";
  const widgetForLink = (href: string) =>
    href === "/sales" ? "SALES" :
    href.includes("inventory") ? "INVENTORY" :
    href.includes("accounting") || href.includes("receivable") ? "FINANCE" :
    href.includes("marketplace") || href.includes("sourcing") ? "PURCHASES" :
    href.includes("crm") ? "CUSTOMERS" : "TASKS";
  return <>
    <PageHeader eyebrow={roleLandingLabel(context.membership)}
      title={"مرحبًا " + context.user.name.split(" ")[0]}
      description={"هذه مساحة عملك في " + context.business.name + "؛ بيانات الأقسام الأخرى لا تُعرض إلا حسب صلاحيات الحساب."} />
    <section className="metricsGrid four">
      {tiles.filter((tile) => visible.has(widgetForTile(tile.title))).map((tile) => <Link key={tile.title} href={tile.href} className="panel" style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">{tile.title}</span><h2>{tile.value}</h2><p className="policyNote">{tile.description}</p>
      </Link>)}
    </section>
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panelHeader"><div><span className="eyebrow">مهامي</span><h2>الأقسام المسموح لك بالعمل عليها</h2></div></div>
      <div className="ownerHubGrid">
        {actions.filter((action) => visible.has(widgetForLink(action.href))).map((action) => <Link key={action.href} className="ownerHubCard" href={action.href}>
          <div><strong>{action.title}</strong><span>{action.description}</span></div>
        </Link>)}
      </div>
    </section>
  </>;
}
