import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";

const schema = z.object({
  status: z.enum(["DONE", "CANCELLED"]),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_TASK_DECISION" }, { status: 400 });
  const { id } = await params;
  const status = await db.$transaction(async (tx) => {
    const updated = await tx.operatingTask.updateMany({
      where: { id, businessId: context.business.id, status: "OPEN" },
      data: { status: parsed.data.status, closedByUserId: context.user.id, closedAt: new Date() },
    });
    if (updated.count !== 1) return null;
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "FLOW_TASK_" + parsed.data.status,
      actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role, orderId: id, note: parsed.data.reason,
    } });
    return parsed.data.status;
  });
  if (!status) return NextResponse.json({ error: "TASK_NOT_FOUND_OR_ALREADY_DECIDED" }, { status: 409 });
  return NextResponse.json({ taskId: id, status });
}
