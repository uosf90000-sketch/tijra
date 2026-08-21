export type SupplierOffer = {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  minOrderQty?: number | null;
};

export type PurchaseSuggestionInput = {
  productId: string;
  productName: string;
  onHand: number;
  avgDailySales: number;
  targetCoverageDays?: number;
  safetyStockDays?: number;
  offers: SupplierOffer[];
};

export type PurchaseSuggestion = {
  productId: string;
  productName: string;
  suggestedQty: number;
  selectedSupplier: SupplierOffer | null;
  estimatedTotal: number;
  reason: string;
};

function roundUp(value: number) {
  return Math.max(0, Math.ceil(value));
}

export function buildPurchaseSuggestion(input: PurchaseSuggestionInput): PurchaseSuggestion {
  const coverageDays = input.targetCoverageDays ?? 7;
  const safetyDays = input.safetyStockDays ?? 1;
  const targetStock = input.avgDailySales * (coverageDays + safetyDays);
  const rawQty = roundUp(targetStock - input.onHand);

  if (rawQty === 0) {
    return {
      productId: input.productId,
      productName: input.productName,
      suggestedQty: 0,
      selectedSupplier: null,
      estimatedTotal: 0,
      reason: `المخزون الحالي يغطي قرابة ${coverageDays} أيام`,
    };
  }

  const ranked = input.offers
    .map((offer) => {
      const effectiveQty = Math.max(rawQty, offer.minOrderQty ?? 0);
      return { offer, effectiveQty, total: effectiveQty * offer.unitPrice };
    })
    .sort((a, b) => a.total - b.total);

  const best = ranked[0] ?? null;

  return {
    productId: input.productId,
    productName: input.productName,
    suggestedQty: best?.effectiveQty ?? rawQty,
    selectedSupplier: best?.offer ?? null,
    estimatedTotal: best?.total ?? 0,
    reason: `بناءً على متوسط بيع ${input.avgDailySales.toFixed(1)} يوميًا وهدف تغطية ${coverageDays} أيام`,
  };
}

export function buildPurchasePlan(items: PurchaseSuggestionInput[]) {
  const suggestions = items.map(buildPurchaseSuggestion).filter((item) => item.suggestedQty > 0);
  const estimatedTotal = suggestions.reduce((sum, item) => sum + item.estimatedTotal, 0);

  const bySupplier = suggestions.reduce<Record<string, { supplierName: string; total: number; items: number }>>(
    (acc, item) => {
      if (!item.selectedSupplier) return acc;
      const key = item.selectedSupplier.supplierId;
      const current = acc[key] ?? { supplierName: item.selectedSupplier.supplierName, total: 0, items: 0 };
      current.total += item.estimatedTotal;
      current.items += 1;
      acc[key] = current;
      return acc;
    },
    {},
  );

  return { suggestions, estimatedTotal, bySupplier: Object.values(bySupplier) };
}
