import assert from "node:assert/strict";
import test from "node:test";
import { commitmentState, commitmentLeadDays, canCloseManually } from "../lib/commitment-passport.ts";

test("commitments distinguish overdue from fulfilled and never imply external verification", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const past = new Date("2026-10-30T12:00:00Z");
  assert.equal(commitmentState({ kind: "SUPPLIER_DELIVERY", status: "OPEN", expectedAt: past }, now), "OVERDUE");
  assert.equal(commitmentState({ kind: "CUSTOMER_PAYMENT", status: "FULFILLED", expectedAt: past }, now), "FULFILLED");
  assert.equal(commitmentLeadDays(past, now), 2);
  assert.equal(commitmentLeadDays(past, null), null);
});
test("supplier and receivable commitments are source-controlled, service requires a reason", () => {
  assert.equal(canCloseManually("SUPPLIER_DELIVERY", "OPEN", "proof entered"), false);
  assert.equal(canCloseManually("CUSTOMER_PAYMENT", "OPEN", "proof entered"), false);
  assert.equal(canCloseManually("SERVICE_COMPLETION", "OPEN", "short"), false);
  assert.equal(canCloseManually("SERVICE_COMPLETION", "OPEN", "تمت الزيارة بنجاح"), true);
  assert.equal(canCloseManually("SERVICE_COMPLETION", "FULFILLED", "تمت الزيارة بنجاح"), false);
});
