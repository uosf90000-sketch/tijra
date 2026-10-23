import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { listInventoryLocations } from "@/lib/commerce-ops";

const schema = z.object({
  membershipId: z.string().min(1),
  locationIds: z.array(z.string().min(1)).max(200),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const [members, locations, grants] = await Promise.all([
    db.membership.findMany({
      where: { businessId: context.business.id },
      select: { id: true, role: true, user: { select: { name: true } } },
    }),
    listInventoryLocations(context.business.id),
    db.membershipLocationGrant.findMany({
      where: { businessId: context.business.id },
      select: { membershipId: true, locationId: true },
    }),
  ]);
  return NextResponse.json({
    enforced: context.business.locationAccessEnforced,
    members, locations, grants,
  });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_LOCATION_GRANTS" }, { status: 400 });
  const selected = [...new Set(parsed.data.locationIds)];
  const locations = await listInventoryLocations(context.business.id);
  if (selected.some((id) => !locations.some((item) => item.id === id && item.active))) {
    return NextResponse.json({ error: "UNRECOGNIZED_OR_INACTIVE_LOCATION" }, { status: 400 });
  }
  try {
    const result = await db.$transaction(async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { id: parsed.data.membershipId, businessId: context.business.id },
      });
      if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");
      if (membership.role === "OWNER") throw new Error("OWNER_GRANTS_NOT_EDITABLE");
      const previous = await tx.membershipLocationGrant.findMany({
        where: { membershipId: membership.id, businessId: context.business.id },
        select: { locationId: true },
      });
      await tx.membershipLocationGrant.deleteMany({
        where: { membershipId: membership.id, businessId: context.business.id },
      });
      if (selected.length) {
        await tx.membershipLocationGrant.createMany({
          data: selected.map((locationId) => ({
            businessId: context.business.id,
            membershipId: membership.id,
            locationId,
          })),
        });
      }
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: "LOCATION_ACCESS_CHANGED",
          itemName: membership.userId,
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          note: JSON.stringify({
            previous: previous.map((item) => item.locationId), current: selected,
            reason: parsed.data.reason,
          }),
        },
      });
      await tx.session.deleteMany({ where: { userId: membership.userId } });
      return { membershipId: membership.id, locationIds: selected };
    });
    return NextResponse.json({ grants: result });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBERSHIP_NOT_FOUND")
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message === "OWNER_GRANTS_NOT_EDITABLE")
      return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("Location access update failed", error);
    return NextResponse.json({ error: "LOCATION_ACCESS_FAILED" }, { status: 500 });
  }
}
