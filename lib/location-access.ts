import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/auth";
import { listInventoryLocations } from "@/lib/commerce-ops";

/** Server-side, tenant-scoped authorization. Hiding locations in the UI is not sufficient. */
export function hasLocationGrant(input: {
  enforced: boolean;
  role: string;
  locationId: string | null | undefined;
  grantedLocationIds: readonly string[];
}) {
  if (!input.enforced || input.role === "OWNER") return true;
  if (!input.locationId) return false;
  return input.grantedLocationIds.includes(input.locationId);
}

export async function locationAuthorized(context: SessionContext, locationId: string): Promise<boolean> {
  if (!context.business.locationAccessEnforced || context.membership.role === "OWNER") return true;
  const grant = await db.membershipLocationGrant.findFirst({
    where: {
      businessId: context.business.id,
      membershipId: context.membership.id,
      locationId,
      membership: { userId: context.user.id, businessId: context.business.id },
    },
    select: { id: true },
  });
  return Boolean(grant);
}

export async function accessibleLocations(context: SessionContext) {
  const all = await listInventoryLocations(context.business.id);
  if (!context.business.locationAccessEnforced || context.membership.role === "OWNER") return all;
  const grants = await db.membershipLocationGrant.findMany({
    where: { businessId: context.business.id, membershipId: context.membership.id },
    select: { locationId: true },
  });
  const allowed = new Set(grants.map((row) => row.locationId));
  return all.filter((location) => allowed.has(location.id));
}
