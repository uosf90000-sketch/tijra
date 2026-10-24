import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { ensureDefaultLocation } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { decodeRecipeNote } from "@/lib/recipes";
import { recordSale } from "@/lib/stock-operations";
import { draftSaleJournal } from "@/lib/sale-ledger-automation";
import { locationAuthorized } from "@/lib/location-access";

const saleSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80).optional(),
  recordedAt: z.coerce.date().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  locationId: z.string().optional(),
  customerId: z.string().min(1).optional(),
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
  // POS always submits a client timestamp, including queued offline sales.
  // Staff sale timestamps are assigned by the server on sync (never backdated).
  // Only the owner can explicitly backdate soldAt; keep the untrusted device
  // timestamp in the audit note to aid reconciliation after prolonged outages.
  if (parsed.data.recordedAt && parsed.data.recordedAt.getTime() > Date.now() + 60_000)
    return NextResponse.json({ error: "FUTURE_CLIENT_SALE_TIME" }, { status: 400 });
  if (auth.context.business.businessScale === "ENTERPRISE" && !parsed.data.invoiceNumber)
    return NextResponse.json({ error: "INVOICE_NUMBER_REQUIRED" }, { status: 400 });

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
  const saleLocationId = parsed.data.locationId || defaultLocation.id;
  if (!(await locationAuthorized(auth.context, saleLocationId))) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });
  if (parsed.data.customerId) {
    const customer = await db.customer.findFirst({
      where: { businessId: auth.context.business.id, id: parsed.data.customerId },
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ error: "CUSTOMER_NOT_FOUND" }, { status: 404 });
  }
  if (parsed.data.invoiceNumber) {
    const existingSale = await db.sale.findFirst({
      where: { businessId: auth.context.business.id, invoiceNumber: parsed.data.invoiceNumber },
      include: { items: true },
    });
    if (existingSale && existingSale.locationId !== saleLocationId)
      return NextResponse.json({ error: "INVOICE_NUMBER_USED_IN_OTHER_LOCATION" }, { status: 409 });
    if (existingSale) return NextResponse.json({ sale: existingSale, duplicate: true });
  }
  try {
    const { recordedAt, ...saleData } = parsed.data;
    const sale = await recordSale({
      ...saleData,
      items: normalizedItems,
      locationId: saleLocationId,
      businessId: auth.context.business.id,
      actorUserId: auth.context.user.id,
      actorName: auth.context.user.name,
      actorRole: auth.context.membership.role,
    });
    const ownerBackdate = recordedAt && auth.context.membership.role === "OWNER";
    const finalSale = ownerBackdate
      ? await db.sale.update({ where: { id: sale.id }, data: { soldAt: recordedAt }, include: { items: true } })
      : sale;
    if (recordedAt && !ownerBackdate && Math.abs(recordedAt.getTime() - Date.now()) > 60_000) {
      await db.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id,
        action: "POS_OFFLINE_TIMESTAMP_RECORDED",
        orderId: finalSale.id,
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({ clientRecordedAt: recordedAt.toISOString(),
          serverSoldAt: finalSale.soldAt.toISOString(), backdated: false, offlineUnverified: true }),
      } }).catch((error) => {
        console.error("Unable to record offline POS timestamp", error);
      });
    }
    // Best-effort immediate ledger drafting. The durable source event was
    // committed with the sale, so a failure cannot lose the accounting handoff.
    // No ledger POST happens here: accountant/owner reviews the draft separately.
    const accounting = await draftSaleJournal({
      businessId: auth.context.business.id, saleId: finalSale.id,
      fallbackCreatorId: auth.context.user.id,
    }).catch((error) => {
      console.error("Sale recorded; accounting draft is safely queued for retry", error);
      return { status: "PENDING" as const, reason: "ACCOUNTING_DRAFT_RETRY_REQUIRED" };
    });
    return NextResponse.json({ sale: finalSale, accounting }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALE_FAILED";
    const status = message === "DUPLICATE_INVOICE_NUMBER" ? 409
      : message === "CASHIER_DISCOUNT_LIMIT_EXCEEDED" ? 403
      : message === "INVALID_SALE_PRICE" ? 400
      : message.startsWith("INSUFFICIENT_STOCK") || message.startsWith("INSUFFICIENT_LOCATION_STOCK") ? 409
      : message === "CUSTOMER_NOT_FOUND" ? 404
      : message === "PRODUCT_NOT_FOUND" ? 404
      : message.startsWith("SERIAL") || message === "DUPLICATE_SERIALS" ? 409
      : message.startsWith("INCOMPATIBLE_RECIPE_UNITS") || message.startsWith("INVALID_RECIPE") || message.startsWith("RECIPE_") ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
