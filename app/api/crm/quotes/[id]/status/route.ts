import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";

const schema = z.object({
  status: z.enum(["SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUOTE_STATUS" }, { status: 400 });
  const { id } = await params;
  try {
    const status = await db.$transaction(async (tx) => {
      const quote = await tx.salesQuote.findFirst({
        where: { id, businessId: auth.context.business.id },
      });
      if (!quote) throw new Error("QUOTE_NOT_FOUND");
      const allowed = {
        DRAFT: ["SENT", "EXPIRED"],
        SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
        ACCEPTED: [], REJECTED: [], EXPIRED: [],
      } as const;
      if (!(allowed[quote.status] as readonly string[]).includes(parsed.data.status))
        throw new Error("QUOTE_TRANSITION_NOT_ALLOWED");
      if (parsed.data.status === "ACCEPTED" && quote.expiresAt && quote.expiresAt < new Date())
        throw new Error("QUOTE_ALREADY_EXPIRED");
      const result = await tx.salesQuote.updateMany({
        where: { id, businessId: auth.context.business.id, status: quote.status },
        data: { status: parsed.data.status },
      });
      if (result.count !== 1) throw new Error("QUOTE_CHANGED_CONCURRENTLY");
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "CRM_QUOTE_" + parsed.data.status,
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, orderId: id,
        note: JSON.stringify({ before: quote.status, after: parsed.data.status, reason: parsed.data.reason,
          sentExternally: false, paymentReceived: false }),
      } });
      return parsed.data.status;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ quoteId: id, status });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "QUOTE_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (["QUOTE_TRANSITION_NOT_ALLOWED", "QUOTE_ALREADY_EXPIRED", "QUOTE_CHANGED_CONCURRENTLY"].includes(code) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Quote status update failed", error);
    return NextResponse.json({ error: "QUOTE_STATUS_FAILED" }, { status: 500 });
  }
}
