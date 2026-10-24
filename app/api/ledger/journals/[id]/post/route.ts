import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { balancedJournal, canPostJournal, dateWithinPeriod } from "@/lib/financial-ledger";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const { id } = await params;
  try {
    const result = await db.$transaction(async (tx) => {
      const [journal, company] = await Promise.all([
        tx.journalEntry.findFirst({
          where: { id, businessId: auth.context.business.id },
          include: { period: true, lines: { include: { account: { select: { businessId: true, active: true } } } } },
        }),
        tx.business.findUniqueOrThrow({
          where: { id: auth.context.business.id },
          select: { journalDualApprovalEnabled: true },
        }),
      ]);
      if (!journal) throw new Error("JOURNAL_NOT_FOUND");
      if (!canPostJournal({
        status: journal.status,
        periodStatus: journal.period.status,
        createdByUserId: journal.createdByUserId,
        actorUserId: auth.context.user.id,
        actorRole: auth.context.membership.role,
        dualApproval: company.journalDualApprovalEnabled,
      })) throw new Error("JOURNAL_POST_NOT_ALLOWED");
      if (!dateWithinPeriod(journal.entryDate, journal.period.periodStart, journal.period.periodEnd))
        throw new Error("DATE_OUTSIDE_FISCAL_PERIOD");
      if (journal.lines.some((line) => line.account.businessId !== auth.context.business.id || !line.account.active))
        throw new Error("INVALID_LEDGER_ACCOUNT");
      const sums = balancedJournal(journal.lines.map((line) => ({
        accountId: line.accountId, side: line.side,
        amount: line.amount.toFixed(2),
      })));
      const updated = await tx.journalEntry.updateMany({
        where: { id: journal.id, businessId: auth.context.business.id, status: "DRAFT" },
        data: { status: "POSTED", postedAt: new Date(), postedByUserId: auth.context.user.id },
      });
      if (updated.count !== 1) throw new Error("JOURNAL_ALREADY_POSTED");
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id,
        action: "JOURNAL_POSTED", orderId: journal.id,
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({
          reference: journal.reference, totalHalalas: sums.debitHalalas.toString(),
          lineCount: journal.lines.length,
        }),
      } });
      return { id: journal.id, status: "POSTED", totalHalalas: sums.debitHalalas.toString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ entry: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "JOURNAL_POST_FAILED";
    if (code === "JOURNAL_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (code === "JOURNAL_POST_NOT_ALLOWED") return NextResponse.json({ error: code }, { status: 403 });
    if (["DATE_OUTSIDE_FISCAL_PERIOD", "INVALID_LEDGER_ACCOUNT", "JOURNAL_ALREADY_POSTED", "UNBALANCED_JOURNAL"].includes(code) ||
       (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Journal posting failed", error);
    return NextResponse.json({ error: "JOURNAL_POST_FAILED" }, { status: 500 });
  }
}
