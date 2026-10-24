import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { dashboardWidgets, permittedDashboardWidgets, type DashboardRoleKey } from "@/lib/role-dashboard-policy";

const validRoles = ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT", "SUPPLIER", "STAFF"] as const;
const keys = dashboardWidgets.map((widget) => widget.key);
const schema = z.object({
  role: z.enum(validRoles),
  widgetKeys: z.array(z.enum(keys as [typeof keys[0], ...typeof keys])).max(keys.length),
  reason: z.string().trim().min(8).max(500),
}).strict();
const policyRole = (role: DashboardRoleKey) => ({
  role,
  permissions: (role === "STAFF" ? ["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"] : []) as Array<"CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING">,
});

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER")
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const rows = await db.roleDashboardProfile.findMany({ where: { businessId: context.business.id } });
  return NextResponse.json({ profiles: rows, presets: validRoles.map((role) => ({
    role, allowed: permittedDashboardWidgets(policyRole(role)),
  })) });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER")
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_ROLE_DASHBOARD" }, { status: 400 });
  const submitted = [...new Set(parsed.data.widgetKeys)];
  const allowed = permittedDashboardWidgets(policyRole(parsed.data.role));
  if (!submitted.length || submitted.some((key) => !allowed.includes(key)))
    return NextResponse.json({ error: "WIDGET_NOT_ALLOWED_FOR_ROLE" }, { status: 400 });

  const record = await db.$transaction(async (tx) => {
    const where = { businessId_role: { businessId: context.business.id, role: parsed.data.role } };
    const previous = await tx.roleDashboardProfile.findUnique({ where });
    const profile = await tx.roleDashboardProfile.upsert({
      where, update: { widgetKeys: submitted, updatedByUserId: context.user.id },
      create: { businessId: context.business.id, role: parsed.data.role,
        widgetKeys: submitted, updatedByUserId: context.user.id },
    });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "ROLE_DASHBOARD_CHANGED",
      actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role,
      note: JSON.stringify({ role: parsed.data.role, from: previous?.widgetKeys || null,
        to: profile.widgetKeys, reason: parsed.data.reason, authorizationChanged: false }),
    } });
    return profile;
  });
  return NextResponse.json({ profile: record, permissionChange: false });
}
