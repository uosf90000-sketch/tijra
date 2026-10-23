import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { approvalDecisionTarget, canDecidePurchaseApproval } from "@/lib/purchase-approval";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(600).optional(),
}).superRefine((data, ctx) => {
  if (data.decision === "REJECT" && (!data.reason || data.reason.length < 8)) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason of 8 characters is required." });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });

  try {
    const result = await db.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, businessId: auth.context.business.id },
        select: { id: true, status: true, requestedByUserId: true, expectedTotal: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (!canDecidePurchaseApproval({
        requesterId: order.requestedByUserId,
        reviewerId: auth.context.user.id,
        reviewerRole: auth.context.membership.role,
        status: order.status,
      })) throw new Error("INELIGIBLE_REVIEWER");

      const nextStatus = approvalDecisionTarget(parsed.data.decision);
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, businessId: auth.context.business.id, status: "PENDING_APPROVAL" },
        data: { status: nextStatus, ...(nextStatus === "SENT" ? { orderedAt: new Date() } : {}) },
      });
      if (updated.count !== 1) throw new Error("ORDER_ALREADY_DECIDED");
      await tx.purchaseOrderApproval.create({
        data: {
          businessId: auth.context.business.id,
          purchaseOrderId: id,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          decision: parsed.data.decision,
          reason: parsed.data.reason,
        },
      });
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "PURCHASE_APPROVAL_" + parsed.data.decision,
          orderId: id,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: JSON.stringify({ reason: parsed.data.reason ?? "", amount: Number(order.expectedTotal) }),
        },
      });
      return { id, status: nextStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ order: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "ORDER_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (code === "INELIGIBLE_REVIEWER") return NextResponse.json({ error: code }, { status: 403 });
    if (code === "ORDER_ALREADY_DECIDED" ||
       (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: "ORDER_ALREADY_DECIDED" }, { status: 409 });
    }
    console.error("Purchase approval error", error);
    return NextResponse.json({ error: "APPROVAL_FAILED" }, { status: 500 });
  }
}
