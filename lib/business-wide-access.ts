import type { SessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { listInventoryLocations } from "@/lib/commerce-ops";

/**
 * Company-wide dashboards have no reliable location dimension in every source
 * (payroll, receivables, customers, accounting). Fail CLOSED for restricted
 * branch members until those records have audited location scoping.
 */
export async function hasBusinessWideRead(context: SessionContext): Promise<boolean> {
  if (context.membership.role === "OWNER" || !context.business.locationAccessEnforced) return true;
  const all = (await listInventoryLocations(context.business.id)).filter((l) => l.active);
  if (!all.length) return false;
  const grants = await db.membershipLocationGrant.findMany({
    where: {
      businessId: context.business.id, membershipId: context.membership.id,
      membership: { userId: context.user.id, businessId: context.business.id },
    },
    select: { locationId: true },
  });
  const allowed = new Set(grants.map((grant) => grant.locationId));
  return all.every((location) => allowed.has(location.id));
}
