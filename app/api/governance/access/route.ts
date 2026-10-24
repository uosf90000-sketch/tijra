import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

const permissionSchema = z.enum(["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"]);
const updateSchema = z.object({
  membershipId: z.string().min(1),
  permissions: z.array(permissionSchema).max(4),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });

  const memberships = await db.membership.findMany({
    where: { businessId: context.business.id },
    select: {
      id: true, userId: true, role: true, permissions: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ members: memberships });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PERMISSION_CHANGE" }, { status: 400 });

  try {
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.membership.findFirst({
        where: { id: parsed.data.membershipId, businessId: context.business.id },
        select: { id: true, userId: true, role: true, permissions: true },
      });
      if (!before) throw new Error("MEMBERSHIP_NOT_FOUND");
      if (before.role !== "STAFF" || before.userId === context.user.id) {
        throw new Error("PROTECTED_ROLE_OR_SELF");
      }
      const next = [...new Set(parsed.data.permissions)];
      const result = await tx.membership.update({
        where: { id: before.id },
        data: { permissions: next },
        select: { id: true, userId: true, role: true, permissions: true },
      });
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: "STAFF_PERMISSIONS_CHANGED",
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          itemName: before.userId,
          note: JSON.stringify({ previous: before.permissions, current: result.permissions, reason: parsed.data.reason }),
        },
      });
      // Force target user to sign in again; prevents any stale authenticated
      // client from continuing with cached access and applies new permissions.
      await tx.session.deleteMany({ where: { userId: before.userId } });
      return result;
    });
    return NextResponse.json({ membership: updated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "MEMBERSHIP_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (code === "PROTECTED_ROLE_OR_SELF") return NextResponse.json({ error: code }, { status: 403 });
    console.error("Permission governance update failed", error);
    return NextResponse.json({ error: "PERMISSION_CHANGE_FAILED" }, { status: 500 });
  }
}
