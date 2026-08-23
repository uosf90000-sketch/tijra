import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { ensureDefaultLocation } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { decodeRecipeNote } from "@/lib/recipes";
import { recordSale } from "@/lib/stock-operations";

const saleSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80).optional(),
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

export async function POST(request: Request) {
  const auth = await requireApiPermission("CASHIER");
  if (auth.response) return auth.response;

  const parsed = saleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const productIds = Array.from(new Set(parsed.data.items.map((item) => item.productId)));
  const optionalRows = productIds.length ? await db.inventoryAuditEvent.findMany({
    where: {
      businessId: auth.context.business.id,
      action: "RECIPE_COMPONENT",
      listingId: { in: productIds },
    },
    select: { id: true, listingId: true, note: true },
  }) : [];

  const optionalByProduct = new Map<string, string[]>();
  for (const row of optionalRows) {
    if (!row.listingId || !decodeRecipeNote(row.note).extraOnly) continue;
    const current = optionalByProduct.get(row.listingId) ?? [];
    current.push(row.id);
    optionalByProduct.set(row.listingId, current);
  }

  const normalizedItems = parsed.data.items.map((item) => {
    const optionalIds = new Set(optionalByProduct.get(item.productId) ?? []);
    if (!optionalIds.size) return item;

    const supplied = new Map((item.adjustments ?? []).map((adjustment) => [adjustment.componentId, adjustment.multiplier]));
    const adjustments = (item.adjustments ?? [])
      .filter((adjustment) => !optionalIds.has(adjustment.componentId))
      .map((adjustment) => ({ ...adjustment }));

    for (const componentId of optionalIds) {
      adjustments.push({ componentId, multiplier: supplied.get(componentId) === 2 ? 2 as const : 0 as const });
    }
    return { ...item, adjustments };
  });

  const defaultLocation = await ensureDefaultLocation(auth.context.business.id);
  try {
    const sale = await recordSale({
      ...parsed.data,
      items: normalizedItems,
      locationId: parsed.data.locationId || defaultLocation.id,
      businessId: auth.context.business.id,
      actorUserId: auth.context.user.id,
      actorName: auth.context.user.name,
      actorRole: auth.context.membership.role,
    });
    return NextResponse.json({ sale }, { status: 201 });
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
