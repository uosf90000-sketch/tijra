import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { ensureDefaultLocation } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { decodeRecipeNote } from "@/lib/recipes";
import { recordSale } from "@/lib/stock-operations";

const saleSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80).optional(),
  recordedAt: z.coerce.date().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  locationId: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      serials: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
      adjustments: z.array(z.object({
        componentId: z.string().min(1),
        multiplier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      })).max(100).optional(),
    }),
  ).min(1).max(200),
});

type OptionalComponent = { id: string; replacesComponentId: string | null };

export async function POST(request: Request) {
  const auth = await requireApiPermission("CASHIER");
  if (auth.response) return auth.response;

  const parsed = saleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.invoiceNumber) {
    const existingSale = await db.sale.findFirst({
      where: { businessId: auth.context.business.id, invoiceNumber: parsed.data.invoiceNumber },
      include: { items: true },
    });
    if (existingSale) return NextResponse.json({ sale: existingSale, duplicate: true });
  }

  const productIds = Array.from(new Set(parsed.data.items.map((item) => item.productId)));
  const recipeRows = productIds.length ? await db.inventoryAuditEvent.findMany({
    where: {
      businessId: auth.context.business.id,
      action: "RECIPE_COMPONENT",
      listingId: { in: productIds },
    },
    select: { id: true, listingId: true, note: true },
  }) : [];

  const optionalByProduct = new Map<string, OptionalComponent[]>();
  for (const row of recipeRows) {
    if (!row.listingId) continue;
    const config = decodeRecipeNote(row.note);
    if (!config.extraOnly) continue;
    const current = optionalByProduct.get(row.listingId) ?? [];
    current.push({ id: row.id, replacesComponentId: config.replacesComponentId });
    optionalByProduct.set(row.listingId, current);
  }

  const normalizedItems = parsed.data.items.map((item) => {
    const optionalComponents = optionalByProduct.get(item.productId) ?? [];
    if (!optionalComponents.length) return item;

    const optionalIds = new Set(optionalComponents.map((component) => component.id));
    const replacementTargetIds = new Set(optionalComponents.map((component) => component.replacesComponentId).filter((value): value is string => Boolean(value)));
    const supplied = new Map((item.adjustments ?? []).map((adjustment) => [adjustment.componentId, adjustment.multiplier]));
    const adjustments: Array<{ componentId: string; multiplier: 0 | 1 | 2 }> = (item.adjustments ?? [])
      .filter((adjustment) => !optionalIds.has(adjustment.componentId) && !replacementTargetIds.has(adjustment.componentId))
      .map((adjustment) => ({ ...adjustment }));

    const selectedReplacementTargets = new Set<string>();
    for (const component of optionalComponents) {
      let selected = supplied.get(component.id) === 2;
      if (component.replacesComponentId && selected) {
        if (selectedReplacementTargets.has(component.replacesComponentId)) selected = false;
        else selectedReplacementTargets.add(component.replacesComponentId);
      }
      adjustments.push({ componentId: component.id, multiplier: selected ? 2 : 0 });
    }

    for (const targetId of replacementTargetIds) {
      adjustments.push({ componentId: targetId, multiplier: selectedReplacementTargets.has(targetId) ? 0 : 1 });
    }

    return { ...item, adjustments };
  });

  const defaultLocation = await ensureDefaultLocation(auth.context.business.id);
  try {
    const { recordedAt, ...saleData } = parsed.data;
    const sale = await recordSale({
      ...saleData,
      items: normalizedItems,
      locationId: parsed.data.locationId || defaultLocation.id,
      businessId: auth.context.business.id,
      actorUserId: auth.context.user.id,
      actorName: auth.context.user.name,
      actorRole: auth.context.membership.role,
    });
    const finalSale = recordedAt
      ? await db.sale.update({ where: { id: sale.id }, data: { soldAt: recordedAt }, include: { items: true } })
      : sale;
    return NextResponse.json({ sale: finalSale }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALE_FAILED";
    const status = message.startsWith("INSUFFICIENT_STOCK") || message.startsWith("INSUFFICIENT_LOCATION_STOCK") ? 409
      : message === "PRODUCT_NOT_FOUND" ? 404
      : message.startsWith("SERIAL") || message === "DUPLICATE_SERIALS" ? 409
      : message.startsWith("INCOMPATIBLE_RECIPE_UNITS") || message.startsWith("INVALID_RECIPE") || message.startsWith("RECIPE_") ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
