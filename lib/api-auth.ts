import type { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
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
