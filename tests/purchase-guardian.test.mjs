import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePriceTrends, makeInvoiceKey, matchOcrLines, reviewPurchase,
} from "../lib/purchase-guardian.ts";

test("duplicate keys scope by business and supplier and normalize numbers", () => {
  assert.equal(makeInvoiceKey("b", "s", " inv- 04 "), "b:s:INV-04");
  assert.equal(makeInvoiceKey("b", "s", "  "), null);
  assert.notEqual(makeInvoiceKey("b1", "s", "1"), makeInvoiceKey("b2", "s", "1"));
});

test("price variance plus receipt quantity mismatches require review", () => {
  const result = reviewPurchase([{
    productId: "p", productName: "أكواب", orderedUnitCost: 100, previousUnitCost: 95,
    unitCost: 110, invoicedQty: 4, receivedQty: 3,
  }], 506, 66);
  assert.equal(result.subtotal, 440);
  assert.equal(result.pricePremium, 60);
  assert.deepEqual(result.warnings.map((i) => i.code),
    ["QTY_MISMATCH", "PRICE_ABOVE_ORDER", "PRICE_ABOVE_HISTORY"]);
});

test("VAT-inclusive or exclusive totals pass, unexplained discrepancies warn", () => {
  const items = [{
    productId: "p", productName: "لبن", orderedUnitCost: 100,
    unitCost: 100, receivedQty: 2, invoicedQty: 2,
  }];
  assert.equal(reviewPurchase(items, 200, 30).warnings.length, 0);
  assert.equal(reviewPurchase(items, 230, 30).warnings.length, 0);
  assert.equal(reviewPurchase(items, 260, 30).warnings[0].code, "TOTAL_MISMATCH");
});

test("OCR suggests only confirmed item arithmetic and leaves ambiguous values blank", () => {
  const products = [{ productId: "p", name: "أكواب ورقية", maxQty: 15 }];
  const clean = matchOcrLines([{ line: "أكواب ورقية 3 22 66", numbers: [3, 22, 66] }], products);
  assert.deepEqual(clean, [{ productId: "p", line: "أكواب ورقية 3 22 66", quantity: 3, unitCost: 22 }]);
  const bad = matchOcrLines([{ line: "أكواب ورقية 3 22 85", numbers: [3, 22, 85] }], products);
  assert.equal(bad[0].unitCost, null);
  const ambiguous = matchOcrLines([
    { line: "أكواب ورقية 3 22 66", numbers: [3, 22, 66] },
    { line: "أكواب ورقية 4 22 88", numbers: [4, 22, 88] },
  ], products);
  assert.equal(ambiguous.length, 0);
});

test("cumulative increases measure positive purchase deltas, not a claim of loss", () => {
  const common = { supplierId: "s", supplierName: "Supplier", productId: "p", productName: "A", unit: "ctn" };
  const result = calculatePriceTrends([
    { ...common, unitCost: 120, quantity: 3, date: new Date("2026-01-02") },
    { ...common, unitCost: 100, quantity: 3, date: new Date("2026-01-01") },
    { ...common, unitCost: 90, quantity: 3, date: new Date("2026-01-03") },
  ]);
  assert.equal(result.cumulativeIncrease, 60);
  assert.equal(result.increasedInvoiceLines, 1);
});
