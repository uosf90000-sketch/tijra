import assert from "node:assert/strict";
import test from "node:test";
import {
  moneyHalalas, milliUnits, calculateQuoteHalalas, halalasToDecimal,
  outstandingHalalas, creditExposureViolation, compareSupplierOffers,
  identifyOperatingSignals,
} from "../lib/tijra-360.ts";

test("quote sums in exact halalas with 3-decimal quantities", () => {
  assert.equal(moneyHalalas("12.50"), 1250n);
  assert.equal(milliUnits("1.250"), 1250n);
  assert.equal(calculateQuoteHalalas([
    { quantity: "1.250", unitPrice: "10.20" },
    { quantity: "2", unitPrice: "0.05" },
  ]), 1285n);
  assert.equal(halalasToDecimal(1285n), "12.85");
  assert.throws(() => calculateQuoteHalalas([]), /INVALID_QUOTE_LINES/);
  assert.throws(() => milliUnits("0"), /INVALID_QUANTITY/);
  assert.throws(() => moneyHalalas("10.001"), /INVALID_MONEY/);
});

test("customer collection cannot exceed receivable and credit rule detects exposure", () => {
  assert.equal(outstandingHalalas("100.00", ["25.50", "50.00"]), 2450n);
  assert.throws(() => outstandingHalalas("10.00", ["10.01"]), /RECEIPT_OVERPAYMENT/);
  assert.equal(creditExposureViolation({
    limit: "1000.00", existingOutstanding: ["800.00"], proposed: "250.00",
  }), "CUSTOMER_CREDIT_LIMIT_EXCEEDED");
  assert.equal(creditExposureViolation({
    limit: "1000.00", existingOutstanding: ["800.00"], proposed: "200.00",
  }), null);
  assert.equal(creditExposureViolation({
    limit: "0.00", existingOutstanding: ["100000.00"], proposed: "100.00",
  }), null);
});

test("source ranking uses real entered prices, not a fabricated quality score", () => {
  const offers = compareSupplierOffers([
    { supplierId: "a", supplierName: "A", unitPrice: "15.00", deliveryDays: 2, quantity: "10" },
    { supplierId: "b", supplierName: "B", unitPrice: "12.50", deliveryDays: 6, quantity: "10" },
    { supplierId: "c", supplierName: "C", unitPrice: "12.50", deliveryDays: 3, quantity: "10" },
  ]);
  assert.deepEqual(offers.map((x) => x.supplierId), ["c", "b", "a"]);
  assert.equal(offers[0].totalHalalas, 12500n);
});

test("Flow signals explain outstanding AR, quantity inbound and pending approvals", () => {
  const today = new Date("2026-10-24T12:00:00Z");
  const signals = identifyOperatingSignals({
    products: [
      { id: "p1", name: "Bread", quantity: 3, incoming: 9, reorderPoint: 10 },
      { id: "p2", name: "Cheese", quantity: 2, incoming: 1, reorderPoint: 10 },
    ],
    receivables: [
      { id: "ar1", invoiceRef: "AR-10", remaining: "100.00", dueAt: new Date("2026-10-20") },
      { id: "ar2", invoiceRef: "AR-11", remaining: "0.00", dueAt: new Date("2026-10-20") },
    ],
    approvals: [{ id: "po1", orderNumber: "PO-001", amount: "500.00" }],
    rfqs: [{ id: "rfq1", productName: "Wheat", deadline: new Date("2026-10-25") }],
    now: today,
  });
  assert.equal(signals.length, 4);
  assert.deepEqual(signals.map((s) => s.type), [
    "LOW_STOCK", "OVERDUE_RECEIVABLE", "APPROVAL_WAITING", "RFQ_DEADLINE",
  ]);
  assert.ok(signals.every((signal) => signal.href.startsWith("/")));
});
