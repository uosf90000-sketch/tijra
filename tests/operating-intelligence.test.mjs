import assert from "node:assert/strict";
import test from "node:test";
import {
  getIncomingPurchaseQuantities, getMarketplaceIncomingQuantities, combineIncomingQuantities, buildMarginAlerts, summarizeSuppliers, describePurchaseActions,
} from "../lib/operating-intelligence.ts";
import { buildPurchaseSuggestion } from "../lib/purchasing.ts";

test("only actual remaining quantities on open sent orders are counted", () => {
  const values = getIncomingPurchaseQuantities([
    { status: "SENT", items: [{ productId: "p", orderedQty: 20, receivedQty: 5 }] },
    { status: "PARTIALLY_RECEIVED", items: [{ productId: "p", orderedQty: 4, receivedQty: 1 }] },
    { status: "DRAFT", items: [{ productId: "p", orderedQty: 50, receivedQty: 0 }] },
    { status: "CANCELLED", items: [{ productId: "p", orderedQty: 50, receivedQty: 0 }] },
    { status: "RECEIVED", items: [{ productId: "p", orderedQty: 10, receivedQty: 10 }] },
    { status: "CONFIRMED", items: [{ productId: "q", orderedQty: 10, receivedQty: 4 }] },
  ]);
  assert.equal(values.get("p"), 18);
  assert.equal(values.get("q"), 6);
});

test("incoming stock suppresses covered restock but not an uncovered gap", () => {
  const base = {
    productId: "p", productName: "A", onHand: 0, avgDailySales: 0,
    reorderPoint: 5, targetCoverageDays: 7, safetyStockDays: 1,
    offers: [{ supplierId: "s", supplierName: "S", unitPrice: 10 }],
  };
  assert.equal(buildPurchaseSuggestion({ ...base, incomingQty: 10 }).suggestedQty, 0);
  assert.equal(buildPurchaseSuggestion({ ...base, incomingQty: 7 }).suggestedQty, 3);
  assert.equal(buildPurchaseSuggestion({ ...base, incomingQty: 0 }).suggestedQty, 10);
  assert.equal(buildPurchaseSuggestion({ ...base, incomingQty: 8, onHand: 2 }).suggestedQty, 0);
});

test("gross margin uses sale price as denominator and does not update the product", () => {
  const products = [
    { id: "a", name: "A", salePrice: 100, averageCost: 95, quantity: 12 },
    { id: "b", name: "B", salePrice: 100, averageCost: 40, quantity: 4 },
    { id: "c", name: "C", salePrice: 100, averageCost: 0, quantity: 8 },
  ];
  const alerts = buildMarginAlerts(products);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].marginPercent, 5);
  assert.equal(alerts[0].suggestedPrice, 126.67);
  assert.equal(products[0].salePrice, 100);
});

test("supplier score does not claim a promised date and uses actual receiving time", () => {
  const result = summarizeSuppliers([
    {
      supplierId: "s", status: "RECEIVED", orderedAt: new Date("2026-10-01"),
      receivedAt: new Date("2026-10-04"), items: [{ orderedQty: 10, receivedQty: 10 }],
    },
    {
      supplierId: "s", status: "SENT", orderedAt: new Date("2026-10-01"),
      receivedAt: null, items: [{ orderedQty: 10, receivedQty: 3 }],
    },
    {
      supplierId: "s", status: "CANCELLED", orderedAt: new Date("2026-10-02"),
      receivedAt: null, items: [{ orderedQty: 3, receivedQty: 0 }],
    },
  ], new Date("2026-10-23"));
  const metric = result.get("s");
  assert.equal(metric?.completed, 1);
  assert.equal(metric?.canceled, 1);
  assert.equal(metric?.openBeyond7Days, 1);
  assert.equal(metric?.averageDaysToComplete, 3);
});

test("navigation points to existing operational actions", () => {
  assert.deepEqual(describePurchaseActions(1, 2, 3).map((x) => x.count), [1, 2, 3]);
});


test("marketplace incoming counts only unique barcode + same unit and open states", () => {
  const products = [
    { id: "p", barcode: "1234", unit: "كرتون" },
    { id: "dup1", barcode: "9999", unit: "حبة" },
    { id: "dup2", barcode: "9999", unit: "حبة" },
    { id: "no-code", barcode: null, unit: "حبة" },
  ];
  const entries = [
    { status: "PLACED", items: [
      { barcode: "1234", unit: "كرتون", quantity: 4 },
      { barcode: "1234", unit: "حبة", quantity: 20 },
      { barcode: "9999", unit: "حبة", quantity: 5 },
      { barcode: null, unit: "حبة", quantity: 7 },
    ] },
    { status: "ACCEPTED", items: [{ barcode: "1234", unit: "كرتون", quantity: 3 }] },
    { status: "RECEIVED", items: [{ barcode: "1234", unit: "كرتون", quantity: 2 }] },
    { status: "CANCELLED", items: [{ barcode: "1234", unit: "كرتون", quantity: 20 }] },
  ];
  const inbound = getMarketplaceIncomingQuantities(products, entries);
  assert.equal(inbound.get("p"), 7);
  assert.equal(inbound.has("dup1"), false);
  assert.equal(inbound.has("no-code"), false);
  const total = combineIncomingQuantities(inbound, new Map([["p", 8]]));
  assert.equal(total.get("p"), 15);
});
