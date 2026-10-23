import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  action: z.enum(["APPROVE", "MARK_PAID"]),
  reference: z.string().trim().max(160).optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  try {
    const result = await db.$transaction(async (tx) => {
      const [run, policy] = await Promise.all([
        tx.payrollRun.findFirst({ where: { id, businessId: auth.context.business.id } }),
        tx.business.findUniqueOrThrow({
          where: { id: auth.context.business.id },
          select: { payrollDualApprovalEnabled: true },
        }),
      ]);
      if (!run) throw new Error("PAYROLL_RUN_NOT_FOUND");
      const actorId = auth.context.user.id;
      const dual = policy.payrollDualApprovalEnabled;
      if (parsed.data.action === "APPROVE") {
        if (run.status !== "DRAFT") throw new Error("RUN_NOT_DRAFT");
        if (dual && (!run.createdByUserId || run.createdByUserId === actorId)) {
          throw new Error("SECOND_REVIEWER_REQUIRED");
        }
      } else {
        if (run.status !== "APPROVED") throw new Error("RUN_NOT_APPROVED");
        if (dual && auth.context.membership.role !== "OWNER") throw new Error("OWNER_PAYMENT_CONFIRMATION_REQUIRED");
        if (dual && run.approvedByUserId === actorId) throw new Error("SECOND_PAYMENT_CHECKER_REQUIRED");
        if (!parsed.data.reference || parsed.data.reference.length < 4) {
          throw new Error("PAYMENT_REFERENCE_REQUIRED");
        }
      }
      const nextStatus = parsed.data.action === "APPROVE" ? "APPROVED" : "PAID";
      const updated = await tx.payrollRun.updateMany({
        where: { id, businessId: auth.context.business.id, status: run.status },
        data: parsed.data.action === "APPROVE" ? {
          status: nextStatus, approvedAt: new Date(), approvedByUserId: actorId,
        } : {
          status: nextStatus, paidAt: new Date(), paidByUserId: actorId,
        },
      });
      if (updated.count !== 1) throw new Error("CONCURRENT_PAYROLL_CHANGE");
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: parsed.data.action === "APPROVE" ? "PAYROLL_APPROVED" : "PAYROLL_MARKED_PAID",
          orderId: id,
          actorUserId: actorId,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: JSON.stringify({ reference: parsed.data.reference || null, reason: parsed.data.reason || null, before: run.status, after: nextStatus }),
        },
      });
      return { id, status: nextStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ run: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYROLL_TRANSITION_FAILED";
    if (code === "PAYROLL_RUN_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (["SECOND_REVIEWER_REQUIRED", "OWNER_PAYMENT_CONFIRMATION_REQUIRED", "SECOND_PAYMENT_CHECKER_REQUIRED"].includes(code)) {
      return NextResponse.json({ error: code }, { status: 403 });
    }
    if (["RUN_NOT_DRAFT", "RUN_NOT_APPROVED", "CONCURRENT_PAYROLL_CHANGE", "PAYMENT_REFERENCE_REQUIRED"].includes(code) ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    console.error("Payroll governance transition failed", error);
    return NextResponse.json({ error: "PAYROLL_TRANSITION_FAILED" }, { status: 500 });
  }
}
