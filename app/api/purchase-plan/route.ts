import { NextResponse } from "next/server";
import { z } from "zod";
import { buildPurchasePlan } from "@/lib/purchasing";

const offerSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  minOrderQty: z.number().nonnegative().nullable().optional(),
});

const itemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  onHand: z.number().nonnegative(),
  avgDailySales: z.number().nonnegative(),
  targetCoverageDays: z.number().positive().max(60).optional(),
  safetyStockDays: z.number().nonnegative().max(30).optional(),
  offers: z.array(offerSchema),
});

const bodySchema = z.object({ items: z.array(itemSchema).max(500) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return NextResponse.json(buildPurchasePlan(parsed.data.items));
}
