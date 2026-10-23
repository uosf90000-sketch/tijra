/** Pure authorization predicate. Company membership is checked separately by DB. */
export function hasLocationGrant(input: {
  enforced: boolean; role: string;
  locationId: string | null | undefined; grantedLocationIds: readonly string[];
}) {
  if (!input.enforced || input.role === "OWNER") return true;
  if (!input.locationId) return false;
  return input.grantedLocationIds.includes(input.locationId);
}
