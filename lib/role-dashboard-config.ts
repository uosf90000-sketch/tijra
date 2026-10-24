import { db } from "@/lib/db";
import { visibleDashboardWidgets, type DashboardPermissionKey, type DashboardRoleKey } from "@/lib/role-dashboard-policy";

export async function loadVisibleRoleWidgets(
  businessId: string,
  membership: { role: DashboardRoleKey; permissions: readonly DashboardPermissionKey[] },
) {
  const stored = await db.roleDashboardProfile.findUnique({
    where: { businessId_role: { businessId, role: membership.role } },
    select: { widgetKeys: true },
  });
  return new Set(visibleDashboardWidgets(membership, stored?.widgetKeys ?? []));
}
