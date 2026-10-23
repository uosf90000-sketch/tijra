import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { balancedJournal, dateWithinPeriod } from "@/lib/financial-ledger";

const lineSchema = z.object({
  accountId: z.string().min(1),
  side: z.enum(["DEBIT", "CREDIT"]),
  amount: z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/),
  description: z.string().trim().max(300).optional(),
});
const schema = z.object({
  periodId: z.string().min(1),
  entryDate: z.coerce.date(),
  description: z.string().trim().min(8).max(500),
  reference: z.string().trim().max(100).optional(),
  lines: z.array(lineSchema).min(2).max(100),
}).strict();
const deleteSchema = z.object({
  entryId: z.string().min(1),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const entries = await db.journalEntry.findMany({
    where: { businessId: auth.context.business.id },
    include: { period: { select: { title: true, status: true } },
      lines: { include: { account: { select: { code: true, name: true } } } } },
    orderBy: { entryDate: "desc" }, take: 100,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_JOURNAL" }, { status: 400 });
  try {
    balancedJournal(parsed.data.lines);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_AMOUNTS" }, { status: 400 });
  }
  try {
    const entry = await db.$transaction(async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({
        where: { id: parsed.data.periodId, businessId: auth.context.business.id, status: "OPEN" },
      });
      if (!period) throw new Error("OPEN_PERIOD_NOT_FOUND");
      if (!dateWithinPeriod(parsed.data.entryDate, period.periodStart, period.periodEnd))
        throw new Error("DATE_OUTSIDE_FISCAL_PERIOD");

      const ids = [...new Set(parsed.data.lines.map((line) => line.accountId))];
      const accounts = await tx.financialAccount.findMany({
        where: { id: { in: ids }, businessId: auth.context.business.id, active: true },
        select: { id: true },
      });
      if (accounts.length !== ids.length) throw new Error("LEDGER_ACCOUNT_NOT_FOUND");

      const created = await tx.journalEntry.create({
        data: {
          businessId: auth.context.business.id,
          periodId: period.id,
          entryDate: parsed.data.entryDate,
          description: parsed.data.description,
          reference: parsed.data.reference || null,
          createdByUserId: auth.context.user.id,
          status: "DRAFT",
          lines: { create: parsed.data.lines.map((line) => ({
            accountId: line.accountId, side: line.side,
            amount: line.amount, description: line.description || null,
          })) },
        },
        include: { lines: true },
      });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id,
        action: "JOURNAL_DRAFT_CREATED", orderId: created.id,
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({ reference: created.reference, lineCount: created.lines.length, periodId: period.id }),
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "JOURNAL_CREATE_FAILED";
    if (code === "OPEN_PERIOD_NOT_FOUND" || code === "LEDGER_ACCOUNT_NOT_FOUND")
      return NextResponse.json({ error: code }, { status: 404 });
    if (code === "DATE_OUTSIDE_FISCAL_PERIOD" ||
       (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Journal draft create failed", error);
    return NextResponse.json({ error: "JOURNAL_CREATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  try {
    await db.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id: parsed.data.entryId, businessId: auth.context.business.id },
      });
      if (!entry) throw new Error("JOURNAL_NOT_FOUND");
      if (entry.status !== "DRAFT") throw new Error("POSTED_JOURNAL_IMMUTABLE");
      if (entry.createdByUserId !== auth.context.user.id && auth.context.membership.role !== "OWNER")
        throw new Error("NOT_JOURNAL_CREATOR");
      await tx.journalEntry.delete({ where: { id: entry.id } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id,
        action: "JOURNAL_DRAFT_WITHDRAWN",
        orderId: entry.id,
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({ reference: entry.reference, reason: parsed.data.reason }),
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ removed: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DELETE_FAILED";
    if (code === "JOURNAL_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (code === "NOT_JOURNAL_CREATOR") return NextResponse.json({ error: code }, { status: 403 });
    if (code === "POSTED_JOURNAL_IMMUTABLE" ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Journal draft withdrawal failed", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
