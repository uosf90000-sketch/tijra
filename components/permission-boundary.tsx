import type { AppPermission } from "@prisma/client";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { firstPermissionHref, hasAnyAppPermission, hasAppPermission } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";

export async function PermissionBoundary({
  children,
  permission,
  anyOf,
  adminOnly = false,
}: {
  children: ReactNode;
  permission?: AppPermission;
  anyOf?: AppPermission[];
  adminOnly?: boolean;
}) {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const fallback = firstPermissionHref(context.membership);
  if (adminOnly && !["OWNER", "MANAGER"].includes(context.membership.role)) redirect(fallback);
  if (permission && !hasAppPermission(context.membership, permission)) redirect(fallback);
  if (anyOf?.length && !hasAnyAppPermission(context.membership, anyOf)) redirect(fallback);

  return <>{children}</>;
}
