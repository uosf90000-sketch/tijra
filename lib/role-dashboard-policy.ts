/** Display-only widget policy. NEVER grants any API authorization. */
export const dashboardWidgets = [
  { key: "SALES", title: "المبيعات والكاشير", permission: "CASHIER" },
  { key: "INVENTORY", title: "المخزون", permission: "INVENTORY" },
  { key: "PURCHASES", title: "المشتريات والموافقات", permission: "PURCHASES" },
  { key: "FINANCE", title: "المالية والتسويات", permission: "ACCOUNTING" },
  { key: "RECEIVABLES", title: "ذمم العملاء", permission: "ACCOUNTING" },
  { key: "CUSTOMERS", title: "العملاء وعروض الأسعار", permission: "MANAGEMENT" },
  { key: "SUPPLIERS", title: "الموردون والمنافسات", permission: "PURCHASES" },
  { key: "STAFF", title: "الموظفون", permission: "OWNER_ONLY" },
  { key: "COMPLIANCE", title: "الرخص والالتزام", permission: "MANAGEMENT" },
  { key: "TASKS", title: "المهام والتنبيهات", permission: "MANAGEMENT" },
  { key: "JOURNALS", title: "القيود المحاسبية", permission: "ACCOUNTING" },
] as const;
export type DashboardWidgetKey = typeof dashboardWidgets[number]["key"];
export type DashboardRoleKey = "OWNER" | "MANAGER" | "CASHIER" | "ACCOUNTANT" | "SUPPLIER" | "STAFF";
export type DashboardPermissionKey = "CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING";
type Membership = { role: DashboardRoleKey; permissions: readonly DashboardPermissionKey[] };

const rolePermissions: Record<Exclude<DashboardRoleKey, "STAFF" | "OWNER">, readonly DashboardPermissionKey[]> = {
  MANAGER: ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"],
  CASHIER: ["CASHIER"],
  ACCOUNTANT: ["ACCOUNTING"],
  SUPPLIER: ["INVENTORY", "PURCHASES"],
};

export function permittedDashboardWidgets(member: Membership): DashboardWidgetKey[] {
  const permissions = new Set(member.role === "OWNER"
    ? ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"]
    : member.role === "STAFF" ? member.permissions : rolePermissions[member.role]);
  return dashboardWidgets.filter((widget) => {
    if (widget.permission === "OWNER_ONLY") return member.role === "OWNER";
    if (widget.permission === "MANAGEMENT") return member.role === "OWNER" || member.role === "MANAGER";
    if (widget.key === "JOURNALS") return member.role === "OWNER" || member.role === "ACCOUNTANT";
    return permissions.has(widget.permission);
  }).map((item) => item.key);
}

export function visibleDashboardWidgets(member: Membership, saved: readonly string[]): DashboardWidgetKey[] {
  const allowed = permittedDashboardWidgets(member);
  if (!saved.length) return allowed;
  return [...new Set(saved)].filter((key): key is DashboardWidgetKey =>
    allowed.includes(key as DashboardWidgetKey));
}
