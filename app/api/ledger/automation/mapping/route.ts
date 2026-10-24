import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { saleLedgerAccountKinds } from "@/lib/sale-ledger-plan";

const accountFields = Object.keys(saleLedgerAccountKinds) as Array<keyof typeof saleLedgerAccountKinds>;
const schema = z.object({
  cashAccountId: z.string().min(1), cardAccountId: z.string().min(1),
  transferAccountId: z.string().min(1), otherAccountId: z.string().min(1),
  revenueAccountId: z.string().min(1), cogsAccountId: z.string().min(1),
  inventoryAccountId: z.string().min(1), enabled: z.boolean(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["OWNER", "ACCOUNTANT"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const [mapping, accounts, pending] = await Promise.all([
    db.salesAccountingMap.findUnique({ where: { businessId: context.business.id } }),
    db.financialAccount.findMany({
      where: { businessId: context.business.id, active: true }, orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, kind: true },
    }),
    db.accountingSourceEvent.count({ where: { businessId: context.business.id, status: "PENDING" } }),
  ]);
  return NextResponse.json({ mapping, accounts, pending, vatReviewRequired: Boolean(context.business.taxNumber) });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER")
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_LEDGER_MAPPING" }, { status: 400 });
  const ids = [...new Set(accountFields.map((field) => parsed.data[field]))];
  const accounts = await db.financialAccount.findMany({
    where: { businessId: context.business.id, active: true, id: { in: ids } },
    select: { id: true, kind: true },
  });
  if (accounts.length !== ids.length) return NextResponse.json({ error: "INVALID_OR_CROSS_COMPANY_ACCOUNTS" }, { status: 400 });
  const byId = new Map(accounts.map((account) => [account.id, account.kind]));
  if (accountFields.some((field) => byId.get(parsed.data[field]) !== saleLedgerAccountKinds[field]))
    return NextResponse.json({ error: "ACCOUNT_KINDS_MISMATCH" }, { status: 400 });
  // Never permit automated gross-revenue recognition when VAT registration
  // is configured: no tax breakdown exists in the current POS schema.
  if (parsed.data.enabled && context.business.taxNumber)
    return NextResponse.json({ error: "VAT_ACCOUNTING_INTEGRATION_NOT_READY" }, { status: 409 });
  const record = await db.$transaction(async (tx) => {
    const previous = await tx.salesAccountingMap.findUnique({ where: { businessId: context.business.id } });
    const { reason, ...data } = parsed.data;
    const updated = await tx.salesAccountingMap.upsert({
      where: { businessId: context.business.id },
      create: { businessId: context.business.id, ...data },
      update: data,
    });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "ACCOUNTING_MAPPING_CHANGED",
      actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role,
      note: JSON.stringify({ previous, current: updated, reason }),
    } });
    return updated;
  });
  return NextResponse.json({ mapping: record });
}
