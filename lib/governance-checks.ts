/** Deterministic governance checks, shared by API handlers and unit tests. */
export function stockAdjustmentViolation(input: {
  role: string; quantity: number; averageCost: number; reason?: string | null;
  reasonRequired: boolean; valueThreshold: number;
}): string | null {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return "INVALID_STOCK_AMOUNT";
  const value = input.quantity * input.averageCost;
  if (!Number.isFinite(value) || value < 0) return "INVALID_STOCK_VALUE";
  if (input.reasonRequired && (!input.reason || input.reason.trim().length < 8)) return "STOCK_REASON_REQUIRED";
  if (value >= input.valueThreshold && !["OWNER", "MANAGER"].includes(input.role)) {
    return "SUPERVISOR_REQUIRED_FOR_LARGE_STOCK_ADJUSTMENT";
  }
  return null;
}

export function expenseViolation(input: {
  role: string; amount: number; threshold: number; description?: string | null;
}): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "INVALID_EXPENSE_AMOUNT";
  if (input.amount < input.threshold) return null;
  if (input.role !== "OWNER") return "OWNER_REQUIRED_FOR_LARGE_EXPENSE";
  if (!input.description || input.description.trim().length < 8) return "EXPENSE_REASON_REQUIRED";
  return null;
}

export function payrollTransitionViolation(input: {
  action: "APPROVE" | "MARK_PAID"; status: string;
  actorId: string; actorRole: string; createdByUserId: string | null;
  approvedByUserId: string | null; dualApproval: boolean; paymentReference?: string | null;
}): string | null {
  if (input.action === "APPROVE") {
    if (input.status !== "DRAFT") return "RUN_NOT_DRAFT";
    if (input.dualApproval && (!input.createdByUserId || input.createdByUserId === input.actorId)) {
      return "SECOND_REVIEWER_REQUIRED";
    }
    return null;
  }
  if (input.status !== "APPROVED") return "RUN_NOT_APPROVED";
  if (input.dualApproval && input.actorRole !== "OWNER") return "OWNER_PAYMENT_CONFIRMATION_REQUIRED";
  if (input.dualApproval && input.approvedByUserId === input.actorId) return "SECOND_PAYMENT_CHECKER_REQUIRED";
  if (!input.paymentReference || input.paymentReference.trim().length < 4) return "PAYMENT_REFERENCE_REQUIRED";
  return null;
}


export function cashierDiscountViolation(input: {
  role: string; listedPrice: number; chargedBasePrice: number; maxDiscountPercent: number;
}): string | null {
  if (!Number.isFinite(input.listedPrice) || !Number.isFinite(input.chargedBasePrice) ||
      input.listedPrice < 0 || input.chargedBasePrice < 0) return "INVALID_SALE_PRICE";
  if (["OWNER", "MANAGER"].includes(input.role)) return null;
  if (input.listedPrice === 0) return null;
  const allowedMinimum = input.listedPrice * (1 - Math.min(100, Math.max(0, input.maxDiscountPercent)) / 100);
  return input.chargedBasePrice < allowedMinimum - 0.009 ? "CASHIER_DISCOUNT_LIMIT_EXCEEDED" : null;
}
