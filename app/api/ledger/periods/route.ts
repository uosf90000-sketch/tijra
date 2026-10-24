import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
}).refine((row) =>
  row.periodStart.getTime() < row.periodEnd.getTime() &&
  row.periodEnd.getTime() - row.periodStart.getTime() <= 366 * 3 * 86_400_000,
  { message: "INVALID_PERIOD_DATES" });

const closeSchema = z.object({
  periodId: z.string().min(1),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const periods = await db.fiscalPeriod.findMany({
    where: { businessId: auth.context.business.id },
    orderBy: { periodStart: "desc" }, take: 120,
  });
  return NextResponse.json({ periods });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PERIOD" }, { status: 400 });
  try {
    const period = await db.$transaction(async (tx) => {
      const overlap = await tx.fiscalPeriod.findFirst({
        where: {
          businessId: auth.context.business.id,
          periodStart: { lte: parsed.data.periodEnd },
          periodEnd: { gte: parsed.data.periodStart },
        },
      });
      if (overlap) throw new Error("OVERLAPPING_FISCAL_PERIOD");
      const created = await tx.fiscalPeriod.create({ data: {
        businessId: auth.context.business.id,
        title: parsed.data.title,
        periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd,
      } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "FISCAL_PERIOD_CREATED",
        orderId: created.id, itemName: created.title,
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({ start: created.periodStart, end: created.periodEnd }),
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ period }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "OVERLAPPING_FISCAL_PERIOD")
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      return NextResponse.json({ error: "PERIOD_CONCURRENCY_CONFLICT" }, { status: 409 });
    console.error("Fiscal period creation failed", error);
    return NextResponse.json({ error: "PERIOD_CREATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiRoles(["OWNER"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = closeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CLOSE_REQUEST" }, { status: 400 });
  try {
    const closed = await db.$transaction(async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({
        where: { id: parsed.data.periodId, businessId: auth.context.business.id },
      });
      if (!period) throw new Error("PERIOD_NOT_FOUND");
      if (period.status !== "OPEN") throw new Error("PERIOD_ALREADY_CLOSED");
      const drafts = await tx.journalEntry.count({
        where: { businessId: auth.context.business.id, periodId: period.id, status: "DRAFT" },
      });
      if (drafts) throw new Error("UNPOSTED_JOURNALS_REMAIN");
      const result = await tx.fiscalPeriod.updateMany({
        where: { id: period.id, businessId: auth.context.business.id, status: "OPEN" },
        data: { status: "CLOSED", closedAt: new Date(), closedByUserId: auth.context.user.id },
      });
      if (result.count !== 1) throw new Error("PERIOD_ALREADY_CLOSED");
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id,
        action: "FISCAL_PERIOD_CLOSED", orderId: period.id, itemName: period.title,
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, note: parsed.data.reason,
      } });
      return { id: period.id, status: "CLOSED" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ period: closed });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PERIOD_CLOSE_FAILED";
    if (code === "PERIOD_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (["PERIOD_ALREADY_CLOSED", "UNPOSTED_JOURNALS_REMAIN"].includes(code) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Fiscal period close failed", error);
    return NextResponse.json({ error: "PERIOD_CLOSE_FAILED" }, { status: 500 });
  }
}
