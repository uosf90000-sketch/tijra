import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { recordSale } from "@/lib/stock-operations";

const saleSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
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

  try {
    const sale = await recordSale({
      ...parsed.data,
      businessId: auth.context.business.id,
      actorUserId: auth.context.user.id,
      actorName: auth.context.user.name,
      actorRole: auth.context.membership.role,
    });
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALE_FAILED";
    const status = message.startsWith("INSUFFICIENT_STOCK") ? 409
      : message === "PRODUCT_NOT_FOUND" ? 404
      : message.startsWith("INCOMPATIBLE_RECIPE_UNITS") || message.startsWith("INVALID_RECIPE") || message.startsWith("RECIPE_") ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
