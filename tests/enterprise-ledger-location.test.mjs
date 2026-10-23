import assert from "node:assert/strict";
import test from "node:test";
import { amountHalalas, balancedJournal, canPostJournal, dateWithinPeriod } from "../lib/financial-ledger.ts";
import { hasLocationGrant } from "../lib/location-policy.ts";

test("money calculations use exact halalas and reject unbalanced journals", () => {
  assert.equal(amountHalalas("100.25"), 10025n);
  assert.equal(amountHalalas("0.01"), 1n);
  assert.throws(() => amountHalalas("100.001"), /INVALID_LEDGER_AMOUNT/);
  assert.throws(() => amountHalalas("0.00"), /NONPOSITIVE_LEDGER_AMOUNT/);
  const valid = balancedJournal([
    { accountId: "cash", side: "DEBIT", amount: "0.10" },
    { accountId: "sales", side: "CREDIT", amount: "0.10" },
  ]);
  assert.equal(valid.debitHalalas, valid.creditHalalas);
  assert.throws(() => balancedJournal([
    { accountId: "cash", side: "DEBIT", amount: "100.25" },
    { accountId: "sales", side: "CREDIT", amount: "100.24" },
  ]), /UNBALANCED_JOURNAL/);
});

test("post requires an open period, maker checker when configured and acceptable date", () => {
  const base = {
    status: "DRAFT", periodStatus: "OPEN", createdByUserId: "creator",
    actorUserId: "accountant", actorRole: "ACCOUNTANT", dualApproval: true,
  };
  assert.equal(canPostJournal(base), true);
  assert.equal(canPostJournal({ ...base, actorUserId: "creator" }), false);
  assert.equal(canPostJournal({ ...base, periodStatus: "CLOSED" }), false);
  assert.equal(canPostJournal({ ...base, status: "POSTED" }), false);
  assert.equal(dateWithinPeriod(new Date("2026-10-15"), new Date("2026-10-01"), new Date("2026-10-31")), true);
  assert.equal(dateWithinPeriod(new Date("2026-11-01"), new Date("2026-10-01"), new Date("2026-10-31")), false);
});

test("location grants fail closed when policy enabled, owner can recover", () => {
  assert.equal(hasLocationGrant({
    enforced: true, role: "STAFF", locationId: "branch-1", grantedLocationIds: ["branch-2"],
  }), false);
  assert.equal(hasLocationGrant({
    enforced: true, role: "STAFF", locationId: "branch-2", grantedLocationIds: ["branch-2"],
  }), true);
  assert.equal(hasLocationGrant({
    enforced: true, role: "OWNER", locationId: "branch-1", grantedLocationIds: [],
  }), true);
  assert.equal(hasLocationGrant({
    enforced: false, role: "STAFF", locationId: "branch-1", grantedLocationIds: [],
  }), true);
});
