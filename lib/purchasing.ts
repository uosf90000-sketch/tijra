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
  reorderPoint?: number;
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
  const coverageDays = Math.max(1, input.targetCoverageDays ?? 7);
  const safetyDays = Math.max(0, input.safetyStockDays ?? 1);
  const reorderPoint = Math.max(0, input.reorderPoint ?? 0);
  const targetStockFromVelocity = input.avgDailySales * (coverageDays + safetyDays);

  // Keep Smart Buy consistent with Inventory/Alerts: a critically-low item must
  // remain actionable even when its short sales history would otherwise round
  // the recommendation to zero.
  const criticalThreshold = Math.max(1, reorderPoint * 0.5);
  const isCritical = input.onHand <= criticalThreshold;
  const configuredTarget = reorderPoint > 0 ? reorderPoint * 2 : 0;
  const targetStock = Math.max(targetStockFromVelocity, configuredTarget);
  const rawQty = roundUp(targetStock - input.onHand);
  const criticalFallbackQty = isCritical && rawQty === 0
    ? Math.max(1, roundUp(Math.max(configuredTarget, criticalThreshold + 1) - input.onHand))
    : rawQty;
  const suggestedBaseQty = input.onHand <= 0 && criticalFallbackQty === 0 ? 1 : criticalFallbackQty;

  if (suggestedBaseQty === 0) {
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
      const effectiveQty = Math.max(suggestedBaseQty, offer.minOrderQty ?? 0);
      return { offer, effectiveQty, total: effectiveQty * offer.unitPrice };
    })
    .sort((a, b) => a.total - b.total);

  const best = ranked[0] ?? null;
  const reason = input.onHand <= 0
    ? input.avgDailySales > 0
      ? `نافد الآن؛ متوسط الاستهلاك ${input.avgDailySales.toFixed(1)} يوميًا، والكمية تغطي ${coverageDays} أيام + مخزون أمان`
      : `نافد الآن؛ لا يوجد سجل مبيعات كافٍ، فاستُخدم حد إعادة الطلب كاحتياط`
    : isCritical
      ? `المخزون حرج (${input.onHand})؛ أُنشئت توصية إعادة طلب حتى لا تختفي الحالة الحرجة بسبب قلة سجل المبيعات`
      : `بناءً على متوسط بيع ${input.avgDailySales.toFixed(1)} يوميًا وهدف تغطية ${coverageDays} أيام`;

  return {
    productId: input.productId,
    productName: input.productName,
    suggestedQty: best?.effectiveQty ?? suggestedBaseQty,
    selectedSupplier: best?.offer ?? null,
    estimatedTotal: best?.total ?? 0,
    reason,
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
