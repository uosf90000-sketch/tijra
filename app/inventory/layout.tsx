import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PermissionBoundary } from "@/components/permission-boundary";
import { hasAppPermission, firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";

export default async function InventoryLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  if (context.membership.role === "STAFF") {
    if (hasAppPermission(context.membership, "INVENTORY")) redirect("/staff/inventory");
    redirect(firstPermissionHref(context.membership));
  }

  return <PermissionBoundary permission="INVENTORY">
    <nav className="pageActionGroup" aria-label="عمليات المخزون" style={{ marginBottom: 12 }}>
      <Link className="button secondary compact" href="/inventory">المخزون</Link>
      <Link className="button secondary compact" href="/inventory/receiving">الاستلام</Link>
      <Link className="button secondary compact" href="/inventory/locations">المواقع والنقل</Link>
      <Link className="button secondary compact" href="/inventory/returns">المرتجعات</Link>
      <Link className="button secondary compact" href="/inventory/audit">الجرد</Link>
      <Link className="button secondary compact" href="/inventory/waste">الهدر</Link>
      <Link className="button secondary compact" href="/inventory/movements">سجل الحركات</Link>
    </nav>
    {children}
  </PermissionBoundary>;
}
