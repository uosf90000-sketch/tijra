import assert from "node:assert/strict";
import test from "node:test";
import {
  roleLandingHref, effectivePermissions, canEnterRoleWorkbench,
  canEnterFinanceWorkbench, roleLandingLabel,
} from "../lib/role-workspaces.ts";

test("executive home is reserved for owner; cashier and accountant land directly at work", () => {
  const base = { permissions: [] };
  assert.equal(roleLandingHref({ ...base, role: "OWNER" }), "/");
  assert.equal(roleLandingHref({ ...base, role: "MANAGER" }), "/workbench");
  assert.equal(roleLandingHref({ ...base, role: "CASHIER" }), "/sales");
  assert.equal(roleLandingHref({ ...base, role: "ACCOUNTANT" }), "/workbench/accounting");
  assert.equal(roleLandingHref({ ...base, role: "SUPPLIER" }), "/marketplace/seller");
  assert.notEqual(roleLandingHref({ ...base, role: "CASHIER" }), "/");
  assert.equal(roleLandingLabel({ ...base, role: "OWNER" }), "لوحة المالك");
});

test("staff can receive one or several permissions but no implicit owner access", () => {
  const cash = { role: "STAFF", permissions: ["CASHIER"] };
  assert.deepEqual(effectivePermissions(cash), ["CASHIER"]);
  assert.equal(roleLandingHref(cash), "/sales");
  assert.equal(canEnterRoleWorkbench(cash), false);
  assert.equal(canEnterFinanceWorkbench(cash), false);
  const inventory = { role: "STAFF", permissions: ["INVENTORY"] };
  assert.equal(roleLandingHref(inventory), "/staff/inventory");
  const accountant = { role: "STAFF", permissions: ["ACCOUNTING"] };
  assert.equal(roleLandingHref(accountant), "/workbench/accounting");
  assert.equal(canEnterFinanceWorkbench(accountant), true);
  const multi = { role: "STAFF", permissions: ["INVENTORY","PURCHASES","INVENTORY"] };
  assert.deepEqual(effectivePermissions(multi), ["INVENTORY","PURCHASES"]);
  assert.equal(roleLandingHref(multi), "/workbench");
  assert.equal(canEnterRoleWorkbench(multi), true);
  assert.equal(roleLandingHref({ role: "STAFF", permissions: [] }), "/no-access");
});

test("legacy roles never inherit all sidebar/financial permissions", () => {
  assert.deepEqual(effectivePermissions({ role: "CASHIER", permissions: ["ACCOUNTING"] }), ["CASHIER"]);
  assert.deepEqual(effectivePermissions({ role: "ACCOUNTANT", permissions: ["CASHIER"] }), ["ACCOUNTING"]);
  assert.deepEqual(effectivePermissions({ role: "SUPPLIER", permissions: [] }), ["INVENTORY","PURCHASES"]);
  assert.equal(canEnterRoleWorkbench({ role: "MANAGER", permissions: [] }), true);
  assert.equal(canEnterFinanceWorkbench({ role: "MANAGER", permissions: [] }), true);
});
