/**
 * Unified role landing policy. A role determines the first workspace; operation
 * permissions are checked again on every server page and API. This policy only
 * handles navigation and NEVER grants data access.
 */
export type TiJraRole = "OWNER" | "MANAGER" | "CASHIER" | "ACCOUNTANT" | "SUPPLIER" | "STAFF";
export type TiJraPermission = "CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING";
export type RoleMembership = { role: TiJraRole; permissions: readonly TiJraPermission[] };

export const roleLanding: Record<Exclude<TiJraRole, "STAFF">, string> = {
  OWNER: "/",
  MANAGER: "/workbench",
  CASHIER: "/sales",
  ACCOUNTANT: "/workbench/accounting",
  SUPPLIER: "/marketplace/seller",
};

const legacyRolePermissions: Record<Exclude<TiJraRole, "OWNER" | "STAFF">, readonly TiJraPermission[]> = {
  MANAGER: ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"],
  CASHIER: ["CASHIER"],
  ACCOUNTANT: ["ACCOUNTING"],
  SUPPLIER: ["INVENTORY", "PURCHASES"],
};

export function effectivePermissions(membership: RoleMembership): TiJraPermission[] {
  if (membership.role === "OWNER") return ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"];
  if (membership.role === "STAFF")
    return [...new Set(membership.permissions)].filter((permission) =>
      ["CASHIER","INVENTORY","PURCHASES","ACCOUNTING"].includes(permission));
  return [...legacyRolePermissions[membership.role]];
}

export function roleLandingHref(membership: RoleMembership) {
  if (membership.role !== "STAFF") return roleLanding[membership.role];
  const permissions = effectivePermissions(membership);
  if (!permissions.length) return "/no-access";
  if (permissions.length > 1) return "/workbench";
  if (permissions.includes("CASHIER")) return "/sales";
  if (permissions.includes("INVENTORY")) return "/staff/inventory";
  if (permissions.includes("PURCHASES")) return "/marketplace/orders";
  return "/workbench/accounting";
}

export function canEnterRoleWorkbench(membership: RoleMembership) {
  return membership.role === "MANAGER" ||
    (membership.role === "STAFF" && effectivePermissions(membership).length > 1);
}

export function canEnterFinanceWorkbench(membership: RoleMembership) {
  return membership.role === "OWNER" || effectivePermissions(membership).includes("ACCOUNTING");
}

export function roleLandingLabel(membership: RoleMembership) {
  const labels: Record<TiJraRole, string> = {
    OWNER: "لوحة المالك",
    MANAGER: "مركز التشغيل",
    CASHIER: "الكاشير",
    ACCOUNTANT: "الإدارة المالية",
    SUPPLIER: "بوابة المورد",
    STAFF: "مساحة الموظف",
  };
  return labels[membership.role];
}
