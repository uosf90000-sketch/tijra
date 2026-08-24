export type PriceOfferInput = {
  productId: string;
  productName: string;
  unit: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  minOrderQty?: number | null;
  onHand: number;
  reorderPoint: number;
  lastQuotedAt: Date;
};

export type SmartPriceAlert = {
  productId: string;
  productName: string;
  unit: string;
  bestSupplierId: string;
  bestSupplierName: string;
  bestPrice: number;
  comparedSupplierId: string;
  comparedSupplierName: string;
  comparedPrice: number;
  savingPerUnit: number;
  savingPercent: number;
  suggestedQty: number;
  estimatedOrderSaving: number;
  lastQuotedAt: Date;
};

export type EarlyStockoutInput = {
  productId: string;
  productName: string;
  unit: string;
  onHand: number;
  reorderPoint: number;
  targetCoverageDays: number;
  soldQty: number;
  lookbackDays: number;
};

export type EarlyStockoutAlert = {
  productId: string;
  productName: string;
  unit: string;
  onHand: number;
  averageDailySales: number;
  daysUntilStockout: number | null;
  reorderPoint: number;
  targetCoverageDays: number;
  status: "OUT_OF_STOCK" | "EARLY_WARNING" | "LOW_STOCK";
  recommendedOrderQty: number;
};

export function buildSmartPriceAlerts(offers: PriceOfferInput[]): SmartPriceAlert[] {
  const grouped = new Map<string, PriceOfferInput[]>();

  for (const offer of offers) {
    const list = grouped.get(offer.productId) ?? [];
    list.push(offer);
    grouped.set(offer.productId, list);
  }

  const alerts: SmartPriceAlert[] = [];

  for (const [, productOffers] of grouped) {
    if (productOffers.length < 2) continue;

    const sorted = [...productOffers].sort((a, b) => a.unitPrice - b.unitPrice);
    const best = sorted[0];
    const compared = sorted.find((offer) => offer.supplierId !== best.supplierId && offer.unitPrice > best.unitPrice);
    if (!compared) continue;

    const savingPerUnit = compared.unitPrice - best.unitPrice;
    if (savingPerUnit <= 0) continue;

    const rawSuggestedQty = Math.max(1, Math.ceil(Math.max(best.reorderPoint * 2, best.reorderPoint + 1) - best.onHand));
    const suggestedQty = Math.max(rawSuggestedQty, Math.ceil(best.minOrderQty ?? 0));

    alerts.push({
      productId: best.productId,
      productName: best.productName,
      unit: best.unit,
      bestSupplierId: best.supplierId,
      bestSupplierName: best.supplierName,
      bestPrice: best.unitPrice,
      comparedSupplierId: compared.supplierId,
      comparedSupplierName: compared.supplierName,
      comparedPrice: compared.unitPrice,
      savingPerUnit,
      savingPercent: (savingPerUnit / compared.unitPrice) * 100,
      suggestedQty,
      estimatedOrderSaving: savingPerUnit * suggestedQty,
      lastQuotedAt: best.lastQuotedAt,
    });
  }

  return alerts.sort((a, b) => b.estimatedOrderSaving - a.estimatedOrderSaving);
}

/**
 * Predicts stockout from actual sales velocity rather than waiting for quantity to hit zero.
 * No prediction is fabricated when there is no sales history.
 */
export function buildEarlyStockoutAlerts(items: EarlyStockoutInput[]): EarlyStockoutAlert[] {
  return items
    .map((item) => {
      const days = Math.max(1, item.lookbackDays);
      const averageDailySales = item.soldQty > 0 ? item.soldQty / days : 0;
      const daysUntilStockout = averageDailySales > 0 ? item.onHand / averageDailySales : null;

      let status: EarlyStockoutAlert["status"] = "LOW_STOCK";
      if (item.onHand <= 0) {
        status = "OUT_OF_STOCK";
      } else if (
        (daysUntilStockout !== null && daysUntilStockout <= Math.max(1, item.targetCoverageDays)) ||
        item.onHand <= item.reorderPoint
      ) {
        status = "EARLY_WARNING";
      }

      const coverageTarget = Math.max(1, item.targetCoverageDays);
      const targetStock = Math.ceil(averageDailySales * coverageTarget);
      const recommendedOrderQty = Math.max(0, targetStock - item.onHand);

      return {
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        onHand: item.onHand,
        averageDailySales,
        daysUntilStockout,
        reorderPoint: item.reorderPoint,
        targetCoverageDays: coverageTarget,
        status,
        recommendedOrderQty,
      };
    })
    .filter((item) => item.status !== "LOW_STOCK" || item.onHand <= item.reorderPoint)
    .sort((a, b) => {
      if (a.daysUntilStockout === null) return 1;
      if (b.daysUntilStockout === null) return -1;
      return a.daysUntilStockout - b.daysUntilStockout;
    });
}
