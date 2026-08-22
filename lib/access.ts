import type { AppPermission, UserRole } from "@prisma/client";

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

const legacyRolePermissions: Partial<Record<UserRole, AppPermission[]>> = {
  MANAGER: ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"],
  CASHIER: ["CASHIER"],
  ACCOUNTANT: ["ACCOUNTING"],
  SUPPLIER: ["INVENTORY", "PURCHASES"],
};

export function hasAppPermission(membership: AccessMembership, permission: AppPermission) {
  if (membership.role === "OWNER") return true;
  if (membership.role === "STAFF") return membership.permissions.includes(permission);
  return legacyRolePermissions[membership.role]?.includes(permission) ?? false;
}

export function hasAnyAppPermission(membership: AccessMembership, permissions: readonly AppPermission[]) {
  return permissions.some((permission) => hasAppPermission(membership, permission));
}

export function firstPermissionHref(membership: AccessMembership) {
  if (hasAppPermission(membership, "CASHIER")) return "/sales";
  if (hasAppPermission(membership, "INVENTORY")) return "/inventory";
  if (hasAppPermission(membership, "PURCHASES")) return "/marketplace";
  if (hasAppPermission(membership, "ACCOUNTING")) return "/accounting";
  return "/no-access";
}
