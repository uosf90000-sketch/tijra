import type { ReactNode } from "react";
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

  return <PermissionBoundary permission="INVENTORY">{children}</PermissionBoundary>;
}
