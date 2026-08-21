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
