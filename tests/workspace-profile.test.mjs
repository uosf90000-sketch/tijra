import assert from "node:assert/strict";
import test from "node:test";
import {
  moduleKeys, resolveWorkspaceModules, primaryWorkspaceHref,
} from "../lib/workspace-profile.ts";
import { selectAuthorizedMembership } from "../lib/active-business.ts";

test("food truck sees simple default tools without large-company screens", () => {
  const keys = resolveWorkspaceModules("MICRO", "FOOD_TRUCK", []);
  assert.ok(keys.includes("SALES"));
  assert.ok(keys.includes("INVENTORY"));
  assert.ok(keys.includes("PURCHASING"));
  assert.ok(!keys.includes("STAFF"));
  assert.ok(!keys.includes("LOCATIONS"));
  assert.equal(primaryWorkspaceHref("MICRO", "FOOD_TRUCK", []), "/sales");
});

test("enterprise preset exposes all existing workspace modules without suggesting enterprise deployment readiness", () => {
  const keys = resolveWorkspaceModules("ENTERPRISE", "MIXED", []);
  assert.deepEqual(keys, moduleKeys);
});

test("custom modules are deduplicated and unsupported keys rejected", () => {
  const keys = resolveWorkspaceModules("SMALL", "SHOP", [
    "SALES", "SALES", "SECRET_ADMIN", "ACCOUNTING",
  ]);
  assert.deepEqual(keys, ["SALES", "ACCOUNTING"]);
});

test("membership switches to a permitted company but cannot select an unauthorized one", () => {
  const memberships = [
    { businessId: "company-a", role: "OWNER" },
    { businessId: "company-b", role: "ACCOUNTANT" },
  ];
  assert.equal(selectAuthorizedMembership(memberships, "company-b")?.role, "ACCOUNTANT");
  assert.equal(selectAuthorizedMembership(memberships, "company-evil")?.businessId, "company-a");
  assert.equal(selectAuthorizedMembership([], "company-a"), null);
});
