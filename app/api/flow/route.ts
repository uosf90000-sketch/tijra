import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentBusinessSignals } from "@/lib/business-signals";

const typeSchema = z.enum(["LOW_STOCK","OVERDUE_RECEIVABLE","APPROVAL_WAITING","RFQ_DEADLINE"]);
const ruleSchema = z.object({ signalType: typeSchema, enabled: z.boolean() }).strict();

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const [rules, tasks, signals] = await Promise.all([
    db.automationRule.findMany({ where: { businessId: context.business.id } }),
    db.operatingTask.findMany({
      where: { businessId: context.business.id, status: "OPEN" },
      orderBy: { createdAt: "desc" }, take: 250,
    }),
    currentBusinessSignals(context.business.id),
  ]);
  return NextResponse.json({ rules, tasks, signals: signals.slice(0, 250),
    note: "Recommendations are informational. No purchase, payment, email or WhatsApp message is sent." });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER")
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = ruleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_AUTOMATION_RULE" }, { status: 400 });
  const rule = await db.$transaction(async (tx) => {
    const updated = await tx.automationRule.upsert({
      where: { businessId_signalType: {
        businessId: context.business.id, signalType: parsed.data.signalType,
      } },
      update: { enabled: parsed.data.enabled },
      create: { businessId: context.business.id, ...parsed.data },
    });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "FLOW_RULE_CHANGED",
      actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role,
      note: JSON.stringify({ signalType: rule.signalType, enabled: rule.enabled }),
    } });
    return updated;
  });
  return NextResponse.json({ rule });
}

export async function POST() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const signals = (await currentBusinessSignals(context.business.id)).slice(0, 250);
  try {
    const result = await db.$transaction(async (tx) => {
      const active = await tx.automationRule.findMany({
        where: { businessId: context.business.id, enabled: true },
      });
      const byType = new Map(active.map((rule) => [rule.signalType, rule.id]));
      let created = 0;
      for (const signal of signals) {
        const ruleId = byType.get(signal.type);
        if (!ruleId) continue;
        const exists = await tx.operatingTask.findUnique({
          where: { businessId_ruleId_sourceId: {
            businessId: context.business.id, ruleId, sourceId: signal.sourceId,
          } },
        });
        if (exists) continue; // Do not reopen a decision already manually closed.
        await tx.operatingTask.create({ data: {
          businessId: context.business.id, ruleId, sourceId: signal.sourceId,
          sourceType: signal.type, title: signal.title, description: signal.description,
          dueAt: signal.dueAt, href: signal.href,
        } });
        created++;
      }
      await tx.inventoryAuditEvent.create({ data: {
        businessId: context.business.id, action: "FLOW_SIGNAL_REVIEW_EXECUTED",
        actorUserId: context.user.id, actorName: context.user.name,
        actorRole: context.membership.role,
        note: JSON.stringify({ evaluated: signals.length, tasksCreated: created,
          externalSideEffects: false }),
      } });
      return { evaluated: signals.length, tasksCreated: created, automaticAction: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002","P2034"].includes(error.code))
      return NextResponse.json({ error: "FLOW_CONCURRENT_REVIEW" }, { status: 409 });
    console.error("Workflow evaluation failed", error);
    return NextResponse.json({ error: "FLOW_REVIEW_FAILED" }, { status: 500 });
  }
}
