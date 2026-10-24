import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const { id } = await params;
  const response = await db.$transaction(async (tx) => {
    const rfq = await tx.sourcingRequest.findFirst({
      where: { businessId: auth.context.business.id, id },
    });
    if (!rfq) return { error: "RFQ_NOT_FOUND", status: 404 };
    if (rfq.status !== "DRAFT") return { error: "RFQ_NOT_DRAFT", status: 409 };
    if (rfq.quoteDeadline && rfq.quoteDeadline <= new Date())
      return { error: "RFQ_DEADLINE_PAST", status: 409 };
    const updated = await tx.sourcingRequest.updateMany({
      where: { businessId: auth.context.business.id, id, status: "DRAFT" },
      data: { status: "OPEN" },
    });
    if (updated.count !== 1) return { error: "RFQ_CHANGED_CONCURRENTLY", status: 409 };
    await tx.inventoryAuditEvent.create({ data: {
      businessId: auth.context.business.id, action: "SOURCING_RFQ_OPENED",
      actorUserId: auth.context.user.id, actorName: auth.context.user.name,
      actorRole: auth.context.membership.role, orderId: id,
      note: "RFQ is open internally; suppliers are NOT externally notified by this action",
    } });
    return { status: 200 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if ("error" in response) return NextResponse.json({ error: response.error }, { status: response.status as 404 | 409 });
  return NextResponse.json({ requestId: id, status: "OPEN", supplierNotified: false });
}
