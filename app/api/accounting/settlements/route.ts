import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const settlementEntrySchema = z.object({
  provider: z.string().trim().min(1).max(120),
  paymentMethod: z.enum(["CARD", "TRANSFER", "OTHER", "CASH"]),
  salesDate: z.coerce.date(),
  settledAt: z.coerce.date().optional(),
  grossAmount: z.number().nonnegative(),
  fees: z.number().nonnegative().default(0),
  reference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
  source: z.enum(["MANUAL", "CSV"]).optional(),
}).refine((entry) => entry.fees <= entry.grossAmount, {
  message: "FEES_EXCEED_GROSS",
  path: ["fees"],
});

const requestSchema = z.union([
  settlementEntrySchema,
  z.object({ entries: z.array(settlementEntrySchema).min(1).max(500) }),
]);

export async function POST(request: Request) {
  const auth = await requireApiPermission("ACCOUNTING");
  if (auth.response) return auth.response;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const entries = "entries" in parsed.data ? parsed.data.entries : [parsed.data];
  const data = entries.map((entry) => ({
    businessId: auth.context.business.id,
    provider: entry.provider,
    paymentMethod: entry.paymentMethod,
    salesDate: entry.salesDate,
    settledAt: entry.settledAt ?? entry.salesDate,
    grossAmount: entry.grossAmount,
    fees: entry.fees,
    netAmount: Math.max(0, entry.grossAmount - entry.fees),
    reference: entry.reference || null,
    note: entry.note || null,
    source: entry.source ?? (entries.length > 1 ? "CSV" : "MANUAL"),
  }));

  const created = await db.paymentSettlement.createMany({
    data,
    skipDuplicates: true,
  });

  return NextResponse.json({ count: created.count, skipped: entries.length - created.count }, { status: 201 });
}
