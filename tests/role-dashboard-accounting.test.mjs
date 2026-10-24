import assert from "node:assert/strict";
import test from "node:test";
import { buildSaleLedgerDraft, saleLedgerAccountKinds } from "../lib/sale-ledger-plan.ts";
import { permittedDashboardWidgets, visibleDashboardWidgets } from "../lib/role-dashboard-policy.ts";

const mapping = {
  cashAccountId: "a-cash", cardAccountId: "a-card",
  transferAccountId: "a-transfer", otherAccountId: "a-other",
  revenueAccountId: "r-sales", cogsAccountId: "e-cogs",
  inventoryAccountId: "a-inventory",
};

test("POS cash payment becomes balanced reviewed journal draft proposal", () => {
  const rows = buildSaleLedgerDraft({
    total: "123.45", costTotal: "62.10", paymentMethod: "CASH",
  }, mapping);
  assert.deepEqual(rows.map((r) => [r.accountId, r.side, r.amount]), [
    ["a-cash", "DEBIT", "123.45"], ["r-sales", "CREDIT", "123.45"],
    ["e-cogs", "DEBIT", "62.10"], ["a-inventory", "CREDIT", "62.10"],
  ]);
  assert.equal(rows.some((line) => line.description?.includes("ضريبة")), true);
});

test("card / transfer payments use clearing and bank asset mappings", () => {
  const card = buildSaleLedgerDraft({ total: "10.00", costTotal: "0.00",
    paymentMethod: "CARD" }, mapping);
  assert.equal(card[0].accountId, "a-card");
  assert.equal(card.length, 2);
  const transfer = buildSaleLedgerDraft({ total: "10.00", costTotal: "0.00",
    paymentMethod: "TRANSFER" }, mapping);
  assert.equal(transfer[0].accountId, "a-transfer");
  assert.equal(saleLedgerAccountKinds.revenueAccountId, "REVENUE");
});

test("zero invoice and invalid decimals fail before creating anything", () => {
  assert.throws(() => buildSaleLedgerDraft({ total: "0.00", costTotal: "0.00",
    paymentMethod: "CASH" }, mapping), /ZERO_SALE_NO_JOURNAL/);
  assert.throws(() => buildSaleLedgerDraft({ total: "1.001", costTotal: "0.00",
    paymentMethod: "CASH" }, mapping), /INVALID_SALE_DECIMAL/);
});

test("a role dashboard cannot expand cashier privileges", () => {
  const cashier = { role: "CASHIER", permissions: ["CASHIER", "ACCOUNTING"] };
  assert.deepEqual(permittedDashboardWidgets(cashier), ["SALES"]);
  assert.deepEqual(visibleDashboardWidgets(cashier, ["FINANCE", "JOURNALS", "SALES"]), ["SALES"]);
  const accountant = { role: "ACCOUNTANT", permissions: [] };
  assert.equal(permittedDashboardWidgets(accountant).includes("STAFF"), false);
  assert.equal(permittedDashboardWidgets(accountant).includes("JOURNALS"), true);
});

test("custom staff widgets are filtered by each member's actual permissions", () => {
  const staff = { role: "STAFF", permissions: ["INVENTORY"] };
  assert.deepEqual(visibleDashboardWidgets(staff, ["INVENTORY", "FINANCE", "PURCHASES"]), ["INVENTORY"]);
  assert.deepEqual(visibleDashboardWidgets(staff, []), ["INVENTORY"]);
});
