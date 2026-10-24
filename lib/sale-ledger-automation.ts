import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildSaleLedgerDraft } from "@/lib/sale-ledger-plan";
import { dateWithinPeriod } from "@/lib/financial-ledger";

/**
 * Idempotent draft creation from an immutable checkout source event.
 * Never posts a journal, settles a bank transaction, or issues a tax invoice.
 * If configuration is missing, the event stays PENDING for a later safe retry.
 */
export async function draftSaleJournal(input: {
  businessId: string; saleId: string; fallbackCreatorId?: string;
}) {
  return db.$transaction(async (tx) => {
    const event = await tx.accountingSourceEvent.findUnique({
      where: { businessId_sourceType_sourceId: {
        businessId: input.businessId, sourceType: "SALE", sourceId: input.saleId,
      } },
    });
    if (!event) throw new Error("ACCOUNTING_SOURCE_NOT_FOUND");
    if (event.draftEntryId) return { status: "DRAFTED" as const, draftEntryId: event.draftEntryId, duplicate: true };

    const mapping = await tx.salesAccountingMap.findUnique({ where: { businessId: input.businessId } });
    if (!mapping?.enabled) return { status: "PENDING" as const, reason: "ACCOUNT_MAPPING_DISABLED" };
    const [sale, business] = await Promise.all([
      tx.sale.findFirst({ where: { businessId: input.businessId, id: input.saleId } }),
      tx.business.findUniqueOrThrow({
        where: { id: input.businessId }, select: { taxNumber: true, currency: true },
      }),
    ]);
    if (!sale) throw new Error("SALE_NOT_FOUND");
    if (business.taxNumber) return { status: "BLOCKED" as const, reason: "VAT_ACCOUNTING_INTEGRATION_NOT_READY" };
    if (business.currency !== "SAR") return { status: "BLOCKED" as const, reason: "NON_SAR_LEDGER_NOT_SUPPORTED" };

    const period = await tx.fiscalPeriod.findFirst({
      where: { businessId: input.businessId, status: "OPEN",
        periodStart: { lte: sale.soldAt }, periodEnd: { gte: sale.soldAt } },
      orderBy: { periodStart: "desc" },
    });
    if (!period || !dateWithinPeriod(sale.soldAt, period.periodStart, period.periodEnd))
      return { status: "PENDING" as const, reason: "OPEN_FISCAL_PERIOD_REQUIRED" };

    const creatorId = event.actorUserId || input.fallbackCreatorId;
    if (!creatorId) return { status: "PENDING" as const, reason: "SOURCE_ACTOR_REQUIRED" };
    const map = {
      cashAccountId: mapping.cashAccountId, cardAccountId: mapping.cardAccountId,
      transferAccountId: mapping.transferAccountId, otherAccountId: mapping.otherAccountId,
      revenueAccountId: mapping.revenueAccountId,
      cogsAccountId: mapping.cogsAccountId, inventoryAccountId: mapping.inventoryAccountId,
    };
    const ids = [...new Set(Object.values(map))];
    const valid = await tx.financialAccount.findMany({
      where: { businessId: input.businessId, id: { in: ids }, active: true },
      select: { id: true },
    });
    if (valid.length !== ids.length)
      return { status: "BLOCKED" as const, reason: "LEDGER_ACCOUNT_INACTIVE" };

    const lines = buildSaleLedgerDraft({
      total: sale.total.toFixed(2), costTotal: sale.costTotal.toFixed(2),
      paymentMethod: sale.paymentMethod,
    }, map);
    const journal = await tx.journalEntry.create({
      data: {
        businessId: input.businessId, periodId: period.id,
        entryDate: sale.soldAt, createdByUserId: creatorId, status: "DRAFT",
        description: "قيد تلقائي مسودة لمبيعات الكاشير — يستلزم المراجعة والترحيل",
        reference: "POS:" + sale.id,
        lines: { create: lines.map((line) => ({
          accountId: line.accountId, side: line.side,
          amount: line.amount, description: line.description,
        })) },
      },
    });
    const updated = await tx.accountingSourceEvent.updateMany({
      where: { id: event.id, businessId: input.businessId, draftEntryId: null },
      data: { draftEntryId: journal.id, status: "DRAFTED", errorCode: null, attempts: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("ACCOUNTING_CONCURRENT_DRAFT");
    await tx.inventoryAuditEvent.create({ data: {
      businessId: input.businessId, action: "ACCOUNTING_SALE_DRAFTED",
      orderId: journal.id, actorUserId: creatorId, actorName: "تِجرا / نظام المحاسبة",
      actorRole: "SYSTEM", note: JSON.stringify({
        saleId: sale.id, reference: journal.reference, periodId: period.id,
        journalStatus: "DRAFT", autoPosted: false, vatSplit: false, bankVerified: false,
      }),
    } });
    return { status: "DRAFTED" as const, draftEntryId: journal.id, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
