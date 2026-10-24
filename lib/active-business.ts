/**
 * A selected company is authorized only when the currently authenticated user
 * has a live membership in that company. Never trust a client-supplied business ID.
 */
export function selectAuthorizedMembership<T extends { businessId: string }>(
  memberships: readonly T[],
  activeBusinessId: string | null | undefined,
): T | null {
  if (memberships.length === 0) return null;
  const requested = activeBusinessId ? memberships.find((membership) => membership.businessId === activeBusinessId) : null;
  return requested ?? memberships[0];
}
