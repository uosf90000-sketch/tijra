/**
 * Purchase Guardian: deterministic checks shared between the receiving UI and API.
 * Quotes and OCR suggestions are advisory; only reviewed receipt data changes stock.
 */
export type ReceiptLineReview = {
  productId: string;
  productName: string;
  orderedUnitCost: number;
  unitCost: number;
  receivedQty: number;
  invoicedQty: number;
  previousUnitCost?: number | null;
};

export type PurchaseWarning = {
  code: "PRICE_ABOVE_ORDER" | "PRICE_ABOVE_HISTORY" | "QTY_MISMATCH" | "TOTAL_MISMATCH" | "VAT_EXCEEDS_TOTAL";
  productId?: string;
  message: string;
  extraAmount: number;
};

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
const money = (amount: number) => roundMoney(amount).toFixed(2);
const PRICE_TOLERANCE_PERCENT = 5;

/** Supplier scoped, case insensitive, normalized invoice identity. */
export function makeInvoiceKey(businessId: string, supplierId: string, number?: string | null) {
  const normalized = (number ?? "").normalize("NFKC").toUpperCase().replace(/[\s\u200e\u200f]+/g, "");
  return normalized ? [businessId, supplierId, normalized].join(":") : null;
}

/** Compare genuine supplier/PO prices. Never interpret these numbers as market benchmarks. */
export function reviewPurchase(
  lines: ReceiptLineReview[],
  declaredTotal?: number | null,
  declaredVat?: number | null,
): { warnings: PurchaseWarning[]; subtotal: number; pricePremium: number } {
  const warnings: PurchaseWarning[] = [];
  let pricePremium = 0;
  let subtotal = 0;

  for (const line of lines) {
    subtotal += line.invoicedQty * line.unitCost;
    if (Math.abs(line.invoicedQty - line.receivedQty) > 0.001) {
      warnings.push({
        code: "QTY_MISMATCH", productId: line.productId,
        message: line.productName + ": الفاتورة تسجل " + line.invoicedQty + " والمستلم فعليًا " + line.receivedQty + ".",
        extraAmount: 0,
      });
    }
    const against = [
      { price: line.orderedUnitCost, code: "PRICE_ABOVE_ORDER" as const, label: "طلب الشراء" },
      { price: line.previousUnitCost, code: "PRICE_ABOVE_HISTORY" as const, label: "آخر فاتورة من المورد" },
    ];
    for (const base of against) {
      if (base.price == null || base.price <= 0) continue;
      const increase = line.unitCost - base.price;
      if (increase <= 0 || increase / base.price * 100 < PRICE_TOLERANCE_PERCENT) continue;
      const extra = roundMoney(increase * line.invoicedQty);
      warnings.push({
        code: base.code, productId: line.productId,
        message: line.productName + ": السعر " + money(line.unitCost) + " ر.س مقابل " +
          money(base.price) + " ر.س في " + base.label + " (زيادة " +
          Math.round(increase / base.price * 100) + "%، فرق " + money(extra) + " ر.س).",
        extraAmount: extra,
      });
    }
    if (line.previousUnitCost != null && line.previousUnitCost > 0) {
      pricePremium += Math.max(0, line.unitCost - line.previousUnitCost) * line.invoicedQty;
    } else if (line.orderedUnitCost > 0) {
      pricePremium += Math.max(0, line.unitCost - line.orderedUnitCost) * line.invoicedQty;
    }
  }

  subtotal = roundMoney(subtotal);
  if (declaredTotal != null && Number.isFinite(declaredTotal)) {
    // Some invoices show VAT-inclusive item prices, others show pre-VAT prices.
    // Accept either calculation; neither is proof of ZATCA compliance.
    const vat = declaredVat != null && Number.isFinite(declaredVat) ? declaredVat : 0;
    const matchesNet = Math.abs(declaredTotal - subtotal) <= 0.10;
    const matchesGross = vat >= 0 && Math.abs(declaredTotal - subtotal - vat) <= 0.10;
    if (!matchesNet && !matchesGross) {
      warnings.push({
        code: "TOTAL_MISMATCH",
        message: "إجمالي الفاتورة المعلن " + money(declaredTotal) +
          " ر.س لا يطابق مجموع الأصناف " + money(subtotal) + " ر.س بعد مراعاة الضريبة المسجلة.",
        extraAmount: 0,
      });
    }
    if (vat > declaredTotal + 0.01) {
      warnings.push({
        code: "VAT_EXCEEDS_TOTAL", message: "قيمة الضريبة أعلى من إجمالي الفاتورة؛ راجع القراءة.",
        extraAmount: 0,
      });
    }
  }
  return { warnings, subtotal, pricePremium: roundMoney(pricePremium) };
}

export type OcrLine = { line: string; numbers: number[] };
export type OcrMatch = { productId: string; line: string; quantity: number | null; unitCost: number | null };

function normalizedTokens(text: string) {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim().split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
}

/**
 * An OCR line is linked to a product only on a confident name match.
 * Qty/price suggestions require an unambiguous qty × unit price = line total triplet.
 */
export function matchOcrLines(
  candidates: OcrLine[],
  products: Array<{ productId: string; name: string; maxQty: number }>,
): OcrMatch[] {
  const proposals: OcrMatch[] = [];
  const used = new Set<number>();
  for (const product of products) {
    const tokens = normalizedTokens(product.name);
    if (!tokens.length) continue;
    const matches = candidates.map((candidate, i) => {
      const words = new Set(normalizedTokens(candidate.line));
      const hits = tokens.filter((t) => words.has(t)).length;
      const confident = tokens.length === 1 ? hits === 1 && tokens[0].length >= 4 :
        hits === tokens.length && hits >= 2;
      return { candidate, i, confident, hits };
    }).filter((item) => item.confident && !used.has(item.i))
      .sort((a, b) => b.hits - a.hits);
    if (matches.length !== 1) continue; // ambiguous product mapping
    const found = matches[0];
    used.add(found.i);
    const numbers = found.candidate.numbers;
    let quantity: number | null = null;
    let unitCost: number | null = null;
    // Extract only the final 3 numeric columns, with strict arithmetic validation.
    if (numbers.length >= 3) {
      const [q, p, total] = numbers.slice(-3);
      if (q > 0 && q <= product.maxQty + 0.001 && p > 0 &&
          Math.abs(roundMoney(q * p) - total) <= 0.05) {
        quantity = q;
        unitCost = p;
      }
    }
    proposals.push({ productId: product.productId, line: found.candidate.line, quantity, unitCost });
  }
  return proposals;
}

export type PriceTrendEntry = {
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  unit: string;
  unitCost: number;
  quantity: number;
  date: Date;
};

export function calculatePriceTrends(entries: PriceTrendEntry[]) {
  const lastPrice = new Map<string, number>();
  const productRows = new Map<string, {
    supplierName: string; productName: string; unit: string; oldPrice: number;
    latestPrice: number; increase: number; extraPaid: number; date: Date;
  }>();
  let cumulativeIncrease = 0;
  let increases = 0;
  for (const entry of [...entries].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const key = entry.supplierId + ":" + entry.productId;
    const previous = lastPrice.get(key);
    const increase = previous != null ? entry.unitCost - previous : 0;
    const extraPaid = previous != null ? Math.max(0, increase) * entry.quantity : 0;
    cumulativeIncrease += extraPaid;
    if (extraPaid > 0) increases += 1;
    productRows.set(key, {
      supplierName: entry.supplierName, productName: entry.productName, unit: entry.unit,
      oldPrice: previous ?? entry.unitCost, latestPrice: entry.unitCost,
      increase, extraPaid: (productRows.get(key)?.extraPaid ?? 0) + extraPaid, date: entry.date,
    });
    lastPrice.set(key, entry.unitCost);
  }
  return {
    cumulativeIncrease: roundMoney(cumulativeIncrease),
    increasedInvoiceLines: increases,
    rows: [...productRows.values()].sort((a, b) => b.extraPaid - a.extraPaid),
  };
}
