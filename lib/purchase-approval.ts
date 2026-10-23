/**
 * Simple maker/checker policy for purchase orders.
 * A policy is optional for small shops and configurable by the business owner.
 * A reviewer must be a distinct user with OWNER/MANAGER authority in this tenant.
 */
export type PurchasePolicy = { enabled: boolean; threshold: number };
export type PurchaseApprovalContext = {
  requesterId: string | null;
  reviewerId: string;
  reviewerRole: string;
  status: string;
};

export function needsPurchaseApproval(total: number, policy: PurchasePolicy) {
  if (!Number.isFinite(total) || total < 0) throw new Error("INVALID_ORDER_VALUE");
  return policy.enabled && total >= policy.threshold;
}

export function canDecidePurchaseApproval(context: PurchaseApprovalContext) {
  return context.status === "PENDING_APPROVAL" &&
    context.requesterId !== null &&
    context.requesterId !== context.reviewerId &&
    (context.reviewerRole === "OWNER" || context.reviewerRole === "MANAGER");
}

export function approvalDecisionTarget(decision: "APPROVE" | "REJECT") {
  return decision === "APPROVE" ? "SENT" : "CANCELLED";
}
