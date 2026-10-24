/**
 * TIJRA 360 commercial invariants.
 * Monetary amounts are decimal strings and all comparisons use integer halalas.
 * None of these helpers initiates external payment, invoice clearance or dispatch.
 */
export function moneyHalalas(value: string): bigint {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("INVALID_MONEY");
  const result = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  if (result < 0n) throw new Error("INVALID_MONEY");
  return result;
}

export function milliUnits(value: string): bigint {
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) throw new Error("INVALID_QUANTITY");
  const result = BigInt(match[1]) * 1000n + BigInt((match[2] || "").padEnd(3, "0"));
  if (result <= 0n) throw new Error("INVALID_QUANTITY");
  return result;
}

export function calculateQuoteHalalas(lines: Array<{ quantity: string; unitPrice: string }>) {
  if (!lines.length || lines.length > 200) throw new Error("INVALID_QUOTE_LINES");
  return lines.reduce((sum, line) => {
    const quantity = milliUnits(line.quantity);
    const price = moneyHalalas(line.unitPrice);
    // Round each line half-up to a single halala before summation.
    return sum + (quantity * price + 500n) / 1000n;
  }, 0n);
}

export function halalasToDecimal(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? "-" : "") + (absolute / 100n) + "." + (absolute % 100n).toString().padStart(2, "0");
}

export function outstandingHalalas(amount: string, receipts: readonly string[]) {
  const original = moneyHalalas(amount);
  const paid = receipts.reduce((total, value) => total + moneyHalalas(value), 0n);
  if (paid > original) throw new Error("RECEIPT_OVERPAYMENT");
  return original - paid;
}

export function creditExposureViolation(input: {
  limit: string; existingOutstanding: readonly string[]; proposed: string;
}): string | null {
  const limit = moneyHalalas(input.limit);
  if (limit === 0n) return null; // 0 means no enforced credit limit, never no debt.
  const current = input.existingOutstanding.reduce((n, x) => n + moneyHalalas(x), 0n);
  return current + moneyHalalas(input.proposed) > limit ? "CUSTOMER_CREDIT_LIMIT_EXCEEDED" : null;
}

export type SupplierOfferComparison = {
  supplierId: string; supplierName: string; unitPrice: string;
  deliveryDays: number | null; quantity: string;
};
export function compareSupplierOffers(items: readonly SupplierOfferComparison[]) {
  return [...items].sort((a, b) => {
    const pa = moneyHalalas(a.unitPrice), pb = moneyHalalas(b.unitPrice);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return (a.deliveryDays ?? Number.MAX_SAFE_INTEGER) - (b.deliveryDays ?? Number.MAX_SAFE_INTEGER);
  }).map((item, index) => ({
    ...item, priceRank: index + 1,
    totalHalalas: (moneyHalalas(item.unitPrice) * milliUnits(item.quantity) + 500n) / 1000n,
  }));
}

export type OperatingSignal = {
  sourceId: string; type: "LOW_STOCK" | "OVERDUE_RECEIVABLE" | "APPROVAL_WAITING" | "RFQ_DEADLINE" | "DOCUMENT_EXPIRY";
  title: string; description: string; href: string; dueAt?: Date;
};

/** Generates explainable recommendations; NO purchase, debit or notification side effects. */
export function identifyOperatingSignals(input: {
  products: Array<{ id: string; name: string; quantity: number; reorderPoint: number; incoming: number }>;
  receivables: Array<{ id: string; invoiceRef: string; remaining: string; dueAt: Date }>;
  approvals: Array<{ id: string; orderNumber: string | null; amount: string }>;
  rfqs: Array<{ id: string; productName: string; deadline: Date }>;
  documents?: Array<{ id: string; title: string; expiresAt: Date; supplierName: string | null }>;
  now: Date;
}): OperatingSignal[] {
  const signals: OperatingSignal[] = [];
  for (const p of input.products) {
    if (p.reorderPoint > 0 && p.quantity + p.incoming < p.reorderPoint) signals.push({
      sourceId: p.id, type: "LOW_STOCK", title: "مخزون منخفض: " + p.name,
      description: "الرصيد " + p.quantity + "، على طلبات معلقة/توريد مخطط " + p.incoming + "، حد الطلب " + p.reorderPoint,
      href: "/smart-buy",
    });
  }
  for (const ar of input.receivables) {
    if (moneyHalalas(ar.remaining) > 0n && ar.dueAt.getTime() < input.now.getTime())
      signals.push({ sourceId: ar.id, type: "OVERDUE_RECEIVABLE",
        title: "تحصيل متأخر: " + ar.invoiceRef,
        description: "المتبقي " + ar.remaining + " ريال، والاستحقاق " + ar.dueAt.toISOString().slice(0, 10),
        href: "/crm/receivables", dueAt: ar.dueAt });
  }
  for (const po of input.approvals) signals.push({
    sourceId: po.id, type: "APPROVAL_WAITING",
    title: "طلب شراء ينتظر اعتمادًا: " + (po.orderNumber || po.id.slice(-6)),
    description: "القيمة " + po.amount + " ريال، لا يتم إرسال المورد قبل الموافقة",
    href: "/purchases/approvals",
  });
  for (const rfq of input.rfqs) if (rfq.deadline.getTime() <= input.now.getTime() + 2 * 86_400_000) signals.push({
    sourceId: rfq.id, type: "RFQ_DEADLINE", title: "عرض سعر قريب من الموعد: " + rfq.productName,
    description: "آخر موعد: " + rfq.deadline.toISOString().slice(0, 10),
    href: "/sourcing", dueAt: rfq.deadline,
  });
  for (const doc of input.documents || []) {
    if (doc.expiresAt.getTime() <= input.now.getTime() + 30 * 86_400_000) signals.push({
      sourceId: doc.id, type: "DOCUMENT_EXPIRY",
      title: "مستند " + (doc.supplierName ? "مورد " + doc.supplierName : "المنشأة") + ": " + doc.title,
      description: (doc.expiresAt.getTime() < input.now.getTime() ? "منتهي" : "قريب من الانتهاء") +
        " بتاريخ " + doc.expiresAt.toISOString().slice(0, 10) + " — راجع المتطلبات من المصدر الرسمي",
      href: "/compliance", dueAt: doc.expiresAt,
    });
  }
  return signals;
}
