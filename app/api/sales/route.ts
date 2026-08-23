import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { ensureDefaultLocation } from "@/lib/commerce-ops";
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

  const defaultLocation = await ensureDefaultLocation(auth.context.business.id);
  try {
    const sale = await recordSale({
      ...parsed.data,
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
