import assert from "node:assert/strict";
import test from "node:test";
import { canDecidePurchaseApproval, needsPurchaseApproval } from "../lib/purchase-approval.ts";
import {
  stockAdjustmentViolation, expenseViolation, payrollTransitionViolation,
} from "../lib/governance-checks.ts";

test("purchases above approval threshold are blocked until a separate reviewer decides", () => {
  assert.equal(needsPurchaseApproval(4999, { enabled: true, threshold: 5000 }), false);
  assert.equal(needsPurchaseApproval(5000, { enabled: true, threshold: 5000 }), true);
  assert.equal(needsPurchaseApproval(7000, { enabled: false, threshold: 5000 }), false);
  const base = { requesterId: "requester", reviewerId: "owner", reviewerRole: "OWNER", status: "PENDING_APPROVAL" };
  assert.equal(canDecidePurchaseApproval(base), true);
  assert.equal(canDecidePurchaseApproval({ ...base, reviewerId: "requester" }), false);
  assert.equal(canDecidePurchaseApproval({ ...base, reviewerRole: "CASHIER" }), false);
  assert.equal(canDecidePurchaseApproval({ ...base, status: "SENT" }), false);
  assert.equal(canDecidePurchaseApproval({ ...base, requesterId: null }), false);
});

test("inventory movements require reason and supervisor by business policy", () => {
  const common = { role: "STAFF", quantity: 5, averageCost: 150, valueThreshold: 500 };
  assert.equal(stockAdjustmentViolation({ ...common, reasonRequired: true, reason: "" }), "STOCK_REASON_REQUIRED");
  assert.equal(stockAdjustmentViolation({ ...common, reasonRequired: false, reason: "" }), "SUPERVISOR_REQUIRED_FOR_LARGE_STOCK_ADJUSTMENT");
  assert.equal(stockAdjustmentViolation({ ...common, reasonRequired: true, reason: "تسوية الجرد", role: "OWNER" }), null);
  assert.equal(stockAdjustmentViolation({ ...common, quantity: 1, reasonRequired: false }), null);
});

test("expense threshold requires owner and reason", () => {
  const input = { amount: 15000, threshold: 5000, role: "ACCOUNTANT", description: "إصلاحات" };
  assert.equal(expenseViolation(input), "OWNER_REQUIRED_FOR_LARGE_EXPENSE");
  assert.equal(expenseViolation({ ...input, role: "OWNER", description: "" }), "EXPENSE_REASON_REQUIRED");
  assert.equal(expenseViolation({ ...input, role: "OWNER", description: "مراجعة فاتورة صيانة" }), null);
  assert.equal(expenseViolation({ ...input, role: "ACCOUNTANT", amount: 300 }), null);
});

test("enterprise payroll is initiated, reviewed and marked paid by separated identities", () => {
  const base = {
    action: "APPROVE" as const, status: "DRAFT",
    actorId: "creator", actorRole: "OWNER", createdByUserId: "creator",
    approvedByUserId: null, dualApproval: true, paymentReference: null,
  };
  assert.equal(payrollTransitionViolation(base), "SECOND_REVIEWER_REQUIRED");
  assert.equal(payrollTransitionViolation({ ...base, actorId: "accountant", actorRole: "ACCOUNTANT" }), null);
  assert.equal(payrollTransitionViolation({
    ...base, action: "MARK_PAID", status: "APPROVED", actorId: "accountant",
    approvedByUserId: "accountant",
  }), "OWNER_PAYMENT_CONFIRMATION_REQUIRED");
  assert.equal(payrollTransitionViolation({
    ...base, action: "MARK_PAID", status: "APPROVED", actorId: "owner",
    approvedByUserId: "owner", paymentReference: "BANK-001",
  }), "SECOND_PAYMENT_CHECKER_REQUIRED");
  assert.equal(payrollTransitionViolation({
    ...base, action: "MARK_PAID", status: "APPROVED", actorId: "owner",
    approvedByUserId: "accountant", paymentReference: null,
  }), "PAYMENT_REFERENCE_REQUIRED");
  assert.equal(payrollTransitionViolation({
    ...base, action: "MARK_PAID", status: "APPROVED", actorId: "owner",
    approvedByUserId: "accountant", paymentReference: "BANK-001",
  }), null);
});
