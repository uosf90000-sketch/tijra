import { db } from "@/lib/db";

export type RecipeState = {
  id: string;
  saleProductId: string;
  ingredientProductId: string;
  ingredientName: string;
  ingredientUnit: string;
  ingredientQuantity: number;
  ingredientAverageCost: number;
  quantity: number;
  unit: string;
  canRemove: boolean;
  canExtra: boolean;
  extraOnly?: boolean;
  replacesComponentId?: string | null;
  extraPrice: number;
  yieldPercent: number;
};

type RecipeNote = {
  unit?: string;
  canRemove?: boolean;
  canExtra?: boolean;
  extraOnly?: boolean;
  replacesComponentId?: string | null;
};

const MASS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  "غ": 1,
  "غرام": 1,
  "جرام": 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  "كجم": 1000,
  "كيلو": 1000,
};

const VOLUME: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  "مل": 1,
  "ملل": 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  "ل": 1000,
  "لتر": 1000,
};

const PIECES = new Set(["piece", "pieces", "pc", "حبة", "قطعة", "شريحة", "رغيف"]);

function norm(value: string) {
  return value.trim().toLowerCase();
}

export function convertRecipeQuantity(quantity: number, fromUnit: string, toUnit: string) {
  const from = norm(fromUnit);
  const to = norm(toUnit);
  if (from === to) return quantity;
  if (MASS[from] && MASS[to]) return (quantity * MASS[from]) / MASS[to];
  if (VOLUME[from] && VOLUME[to]) return (quantity * VOLUME[from]) / VOLUME[to];
  if (PIECES.has(from) && PIECES.has(to)) return quantity;
  throw new Error(`INCOMPATIBLE_RECIPE_UNITS:${fromUnit}:${toUnit}`);
}

export function decodeRecipeNote(note: string | null): Required<RecipeNote> {
  try {
    const parsed = note ? JSON.parse(note) as RecipeNote : {};
    return {
      unit: parsed.unit || "حبة",
      canRemove: Boolean(parsed.canRemove),
      canExtra: Boolean(parsed.canExtra),
      extraOnly: Boolean(parsed.extraOnly),
      replacesComponentId: parsed.replacesComponentId || null,
    };
  } catch {
    return { unit: "حبة", canRemove: false, canExtra: false, extraOnly: false, replacesComponentId: null };
  }
}

export function requiredStockQuantity(component: RecipeState, saleQuantity = 1, multiplier = 1) {
  const yieldFactor = Math.max(0.01, component.yieldPercent / 100);
  const preparedQuantity = component.quantity * saleQuantity * multiplier;
  return convertRecipeQuantity(preparedQuantity / yieldFactor, component.unit, component.ingredientUnit);
}

export function recipeMaxServings(components: RecipeState[]) {
  const required = components.filter((component) => !component.extraOnly);
  if (!required.length) return components.length ? Number.POSITIVE_INFINITY : 0;
  let max = Number.POSITIVE_INFINITY;
  for (const component of required) {
    const perServing = requiredStockQuantity(component, 1, 1);
    if (perServing <= 0) continue;
    max = Math.min(max, component.ingredientQuantity / perServing);
  }
  return Number.isFinite(max) ? Math.max(0, max) : max;
}

export async function loadRecipesForBusiness(businessId: string, saleProductIds?: string[]) {
  const states = await db.inventoryAuditEvent.findMany({
    where: {
      businessId,
      action: "RECIPE_COMPONENT",
      ...(saleProductIds?.length ? { listingId: { in: saleProductIds } } : {}),
    },
    orderBy: { occurredAt: "asc" },
  });

  const ingredientIds = Array.from(new Set(states.map((row) => row.orderId).filter((value): value is string => Boolean(value))));
  const ingredients = ingredientIds.length
    ? await db.product.findMany({
        where: { businessId, id: { in: ingredientIds }, active: true },
        select: { id: true, name: true, unit: true, quantity: true, averageCost: true },
      })
    : [];
  const ingredientMap = new Map(ingredients.map((item) => [item.id, item]));

  const components: RecipeState[] = [];
  for (const row of states) {
    if (!row.listingId || !row.orderId || row.quantity == null) continue;
    const ingredient = ingredientMap.get(row.orderId);
    if (!ingredient) continue;
    const config = decodeRecipeNote(row.note);
    components.push({
      id: row.id,
      saleProductId: row.listingId,
      ingredientProductId: row.orderId,
      ingredientName: ingredient.name,
      ingredientUnit: ingredient.unit,
      ingredientQuantity: Number(ingredient.quantity),
      ingredientAverageCost: Number(ingredient.averageCost),
      quantity: Number(row.quantity) * (config.extraOnly ? 2 : 1),
      unit: config.unit,
      canRemove: config.canRemove,
      canExtra: config.canExtra,
      extraOnly: config.extraOnly,
      replacesComponentId: config.replacesComponentId,
      extraPrice: Number(row.previousQuantity ?? 0),
      yieldPercent: Number(row.newQuantity ?? 100),
    });
  }

  const byProduct = new Map<string, RecipeState[]>();
  for (const component of components) {
    const current = byProduct.get(component.saleProductId) ?? [];
    current.push(component);
    byProduct.set(component.saleProductId, current);
  }
  return byProduct;
}
