import type { AppPermission, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { hasAnyAppPermission, hasAppPermission } from "@/lib/access";
import { getSessionContext, hasRole } from "@/lib/auth";

export async function requireApiRoles(roles: readonly UserRole[]) {
  const context = await getSessionContext();
  if (!context) {
    return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), context: null } as const;
  }
  if (!hasRole(context.membership.role, roles)) {
    return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), context: null } as const;
  }
  return { response: null, context } as const;
}

export async function requireApiPermission(permission: AppPermission) {
  const context = await getSessionContext();
  if (!context) {
    return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), context: null } as const;
  }
  if (!hasAppPermission(context.membership, permission)) {
    return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), context: null } as const;
  }
  return { response: null, context } as const;
}

export async function requireApiAnyPermission(permissions: readonly AppPermission[]) {
  const context = await getSessionContext();
  if (!context) {
    return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), context: null } as const;
  }
  if (!hasAnyAppPermission(context.membership, permissions)) {
    return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), context: null } as const;
  }
  return { response: null, context } as const;
}
