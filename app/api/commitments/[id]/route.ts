import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { canCloseManually } from "@/lib/commitment-passport";

const schema = z.object({
  status: z.enum(["FULFILLED", "CANCELLED"]),
  evidenceNote: z.string().trim().min(8).max(500),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_EVIDENCE" }, { status: 400 });
  const { id } = await params;
  const result = await db.$transaction(async (tx) => {
    const item = await tx.businessCommitment.findFirst({ where: { id, businessId: context.business.id } });
    if (!item) return "NOT_FOUND";
    if (!canCloseManually(item.kind, item.status, parsed.data.evidenceNote)) return "SOURCE_CONTROLLED_OR_CLOSED";
    const changed = await tx.businessCommitment.updateMany({
      where: { businessId: context.business.id, id, status: "OPEN", kind: "SERVICE_COMPLETION" },
      data: { status: parsed.data.status, evidenceNote: parsed.data.evidenceNote,
        fulfilledAt: parsed.data.status === "FULFILLED" ? new Date() : null,
        updatedByUserId: context.user.id },
    });
    if (changed.count !== 1) return "CONCURRENT_UPDATE";
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "COMMITMENT_CLOSED",
      orderId: id, actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role, itemName: item.title,
      note: JSON.stringify({ status: parsed.data.status, reason: parsed.data.evidenceNote, externallyVerified: false }),
    } });
    return "OK";
  });
  if (result === "NOT_FOUND") return NextResponse.json({ error: result }, { status: 404 });
  if (result !== "OK") return NextResponse.json({ error: result }, { status: 409 });
  return NextResponse.json({ id, status: parsed.data.status, externallyVerified: false });
}
