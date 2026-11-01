/** A commitment is an internally recorded promise, not independent proof of payment/delivery. */
export type CommitmentView = {
  kind: "SUPPLIER_DELIVERY" | "CUSTOMER_PAYMENT" | "SERVICE_COMPLETION";
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  expectedAt: Date;
  fulfilledAt?: Date | null;
};
export function commitmentState(row: CommitmentView, now: Date): "OPEN" | "OVERDUE" | "FULFILLED" | "CANCELLED" {
  return row.status !== "OPEN" ? row.status : row.expectedAt.getTime() < now.getTime() ? "OVERDUE" : "OPEN";
}
export function commitmentLeadDays(expectedAt: Date, fulfilledAt: Date | null) {
  return fulfilledAt ? Math.round((fulfilledAt.getTime() - expectedAt.getTime()) / 8640000) / 10 : null;
}
export function canCloseManually(kind: CommitmentView["kind"], status: CommitmentView["status"], note: string) {
  return kind === "SERVICE_COMPLETION" && status === "OPEN" && note.trim().length >= 8;
}
