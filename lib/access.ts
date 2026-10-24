import type { AppPermission, UserRole } from "@prisma/client";
import { effectivePermissions, roleLandingHref } from "@/lib/role-workspaces";

export const appPermissions = ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"] as const satisfies readonly AppPermission[];

export const permissionLabels: Record<AppPermission, string> = {
  CASHIER: "الكاشير",
  INVENTORY: "المستودع والمخزون",
  PURCHASES: "المشتريات",
  ACCOUNTING: "المحاسبة",
};

type AccessMembership = {
  role: UserRole;
  permissions: AppPermission[];
};

export function hasAppPermission(membership: AccessMembership, permission: AppPermission) {
  return effectivePermissions(membership).includes(permission);
}

export function hasAnyAppPermission(membership: AccessMembership, permissions: readonly AppPermission[]) {
  return permissions.some((permission) => hasAppPermission(membership, permission));
}

export function firstPermissionHref(membership: AccessMembership) {
  return roleLandingHref(membership);
}
