import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { draftSaleJournal } from "@/lib/sale-ledger-automation";

const schema = z.object({ saleId: z.string().min(1) }).strict();

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const businessId = auth.context.business.id;
  const [events, mapping, periods] = await Promise.all([
    db.accountingSourceEvent.findMany({
      where: { businessId }, orderBy: { createdAt: "desc" }, take: 150,
    }),
    db.salesAccountingMap.findUnique({ where: { businessId } }),
    db.fiscalPeriod.findMany({
      where: { businessId, status: "OPEN" },
      select: { id: true, title: true, periodStart: true, periodEnd: true },
    }),
  ]);
  const saleIds = events.map((event) => event.sourceId);
  const sales = saleIds.length ? await db.sale.findMany({
    where: { businessId, id: { in: saleIds } },
    select: { id: true, invoiceNumber: true, soldAt: true, total: true, costTotal: true },
  }) : [];
  const byId = new Map(sales.map((sale) => [sale.id, sale]));
  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id, saleId: event.sourceId, status: event.status,
      draftEntryId: event.draftEntryId, attempts: event.attempts,
      errorCode: event.errorCode, createdAt: event.createdAt,
      sale: byId.get(event.sourceId) || null,
    })),
    mappingEnabled: Boolean(mapping?.enabled),
    openPeriods: periods,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SOURCE" }, { status: 400 });
  const event = await db.accountingSourceEvent.findFirst({
    where: { businessId: auth.context.business.id, sourceType: "SALE", sourceId: parsed.data.saleId },
    select: { id: true },
  });
  if (!event) return NextResponse.json({ error: "ACCOUNTING_SOURCE_NOT_FOUND" }, { status: 404 });
  try {
    const result = await draftSaleJournal({
      businessId: auth.context.business.id, saleId: parsed.data.saleId,
      fallbackCreatorId: auth.context.user.id,
    });
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Manual sale accounting draft failed", error);
    return NextResponse.json({ error: "ACCOUNTING_DRAFT_RETRY_FAILED" }, { status: 409 });
  }
}
