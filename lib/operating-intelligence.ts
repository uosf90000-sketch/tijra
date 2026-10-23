/**
 * Connected operational intelligence: uses actual TiJRA inventory and supplier PO records,
 * never a guessed ETA or cash balance. Designed for pure, deterministic unit testing.
 */
export type IncomingPurchaseOrder = {
  status: string;
  items: Array<{ productId: string; orderedQty: number; receivedQty: number }>;
};

const COMMITTED_PO_STATES = new Set(["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"]);

export function getIncomingPurchaseQuantities(orders: IncomingPurchaseOrder[]) {
  const incoming = new Map<string, number>();
  for (const order of orders) {
    if (!COMMITTED_PO_STATES.has(order.status)) continue;
    for (const item of order.items) {
      const remaining = Math.max(0, item.orderedQty - item.receivedQty);
      if (!Number.isFinite(remaining) || remaining <= 0) continue;
      incoming.set(item.productId, (incoming.get(item.productId) ?? 0) + remaining);
    }
  }
  return incoming;
}

export type IncomingMarketplaceOrder = {
  status: string;
  items: Array<{ barcode: string | null; unit: string; quantity: number }>;
};

/**
 * Pending marketplace orders have no canonical local product ID yet.
 * Match only when barcode+unit identifies exactly one active local product.
 * Name-only matches could reserve the wrong goods, so are intentionally excluded.
 */
export function getMarketplaceIncomingQuantities(
  products: Array<{ id: string; barcode: string | null; unit: string }>,
  orders: IncomingMarketplaceOrder[],
) {
  const keyed = new Map<string, string | null>();
  for (const product of products) {
    if (!product.barcode?.trim()) continue;
    const key = product.barcode.trim() + "\u0000" + product.unit;
    if (keyed.has(key)) keyed.set(key, null);
    else keyed.set(key, product.id);
  }
  const quantities = new Map<string, number>();
  for (const order of orders) {
    if (order.status !== "PLACED" && order.status !== "ACCEPTED") continue;
    for (const line of order.items) {
      if (!line.barcode?.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      const id = keyed.get(line.barcode.trim() + "\u0000" + line.unit);
      if (!id) continue;
      quantities.set(id, (quantities.get(id) ?? 0) + line.quantity);
    }
  }
  return quantities;
}

export function combineIncomingQuantities(...maps: Array<Map<string, number>>) {
  const combined = new Map<string, number>();
  for (const map of maps) {
    for (const [productId, quantity] of map) {
      combined.set(productId, (combined.get(productId) ?? 0) + quantity);
    }
  }
  return combined;
}

export type MarginProduct = {
  id: string; name: string; salePrice: number; averageCost: number; quantity: number;
};
export type MarginAlert = MarginProduct & {
  marginPercent: number;
  suggestedPrice: number;
  minimumPrice: number;
  severity: "NEGATIVE" | "LOW";
};
export function buildMarginAlerts(products: MarginProduct[], minimumMargin = 15, targetMargin = 25): MarginAlert[] {
  if (minimumMargin < 0 || minimumMargin >= 100 || targetMargin <= minimumMargin || targetMargin >= 100) {
    throw new Error("INVALID_MARGIN_POLICY");
  }
  return products.flatMap((item) => {
    if (!Number.isFinite(item.salePrice) || !Number.isFinite(item.averageCost) || item.averageCost <= 0) {
      return [];
    }
    const marginPercent = item.salePrice > 0 ? (item.salePrice - item.averageCost) / item.salePrice * 100 : -100;
    if (marginPercent >= minimumMargin) return [];
    const suggestedPrice = Math.ceil((item.averageCost / (1 - targetMargin / 100)) * 100) / 100;
    const minimumPrice = Math.ceil((item.averageCost / (1 - minimumMargin / 100)) * 100) / 100;
    return [{
      ...item, marginPercent, suggestedPrice, minimumPrice,
      severity: item.salePrice <= item.averageCost ? "NEGATIVE" as const : "LOW" as const,
    }];
  }).sort((a, b) => a.marginPercent - b.marginPercent);
}

export type SupplierOrderStat = {
  supplierId: string;
  status: string;
  orderedAt: Date | null;
  receivedAt: Date | null;
  items: Array<{ orderedQty: number; receivedQty: number }>;
};
export type SupplierPerformance = {
  supplierId: string;
  totalOrders: number;
  completed: number;
  canceled: number;
  open: number;
  openBeyond7Days: number;
  averageDaysToComplete: number | null;
  receivedUnits: number;
  orderedUnits: number;
};

const DAY = 86_400_000;
/**
 * No on-time rate because supplier promised delivery dates are not recorded.
 * Distinct units are NOT combined into a meaningful fulfillment percentage.
 */
export function summarizeSuppliers(orders: SupplierOrderStat[], now: Date) {
  const grouped = new Map<string, SupplierPerformance & { completionDays: number[] }>();
  for (const order of orders) {
    let record = grouped.get(order.supplierId);
    if (!record) {
      record = {
        supplierId: order.supplierId, totalOrders: 0, completed: 0, canceled: 0,
        open: 0, openBeyond7Days: 0, averageDaysToComplete: null,
        receivedUnits: 0, orderedUnits: 0, completionDays: [],
      };
      grouped.set(order.supplierId, record);
    }
    record.totalOrders++;
    if (order.status === "CANCELLED") record.canceled++;
    else if (order.status === "RECEIVED") {
      record.completed++;
      if (order.orderedAt && order.receivedAt) {
        record.completionDays.push(Math.max(0, (order.receivedAt.getTime() - order.orderedAt.getTime()) / DAY));
      }
    } else {
      record.open++;
      if (order.orderedAt && now.getTime() - order.orderedAt.getTime() > 7 * DAY) {
        record.openBeyond7Days++;
      }
    }
    for (const item of order.items) {
      record.orderedUnits += item.orderedQty;
      record.receivedUnits += item.receivedQty;
    }
  }
  return new Map<string, SupplierPerformance>(
    Array.from(grouped.entries(), ([id, record]): [string, SupplierPerformance] => {
      const { completionDays, ...stats } = record;
      return [id, {
        ...stats,
        averageDaysToComplete: completionDays.length
          ? Math.round(completionDays.reduce((sum, days) => sum + days, 0) / completionDays.length * 10) / 10
          : null,
      }];
    }),
  );
}

/** The owner can investigate these links; calculations do not automatically alter prices. */
export function describePurchaseActions(incoming: number, marginAlerts: number, waiting: number) {
  return [
    { key: "pending", count: incoming, title: "كميات بالطريق من الموردين", href: "/purchases", note: "قبل إنشاء طلبات جديدة" },
    { key: "margin", count: marginAlerts, title: "منتجات تحتاج مراجعة هامش الربح", href: "/purchases/insights#margin-risk", note: "بعد تحديث تكلفة الاستلام" },
    { key: "waiting", count: waiting, title: "طلبات تجاوزت 7 أيام دون إكمال", href: "/suppliers#supplier-performance", note: "مدة انتظار وليست مخالفة موعد تسليم" },
  ];
}
