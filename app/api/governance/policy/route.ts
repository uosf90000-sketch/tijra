import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  locationAccessEnforced: z.boolean(),
  purchaseApprovalEnabled: z.boolean(),
  purchaseApprovalThreshold: z.number().finite().nonnegative().max(999999999),
  payrollDualApprovalEnabled: z.boolean(),
  stockReasonRequired: z.boolean(),
  stockValueReviewThreshold: z.number().finite().nonnegative().max(999999999),
  expenseOwnerThreshold: z.number().finite().nonnegative().max(999999999),
  cashierMaxDiscountPercent: z.number().finite().min(0).max(100),
}).strict();

const fields = {
  locationAccessEnforced: true,
  purchaseApprovalEnabled: true,
  purchaseApprovalThreshold: true,
  payrollDualApprovalEnabled: true,
  stockReasonRequired: true,
  stockValueReviewThreshold: true,
  expenseOwnerThreshold: true,
  cashierMaxDiscountPercent: true,
} as const;

function serialize(policy: {
  locationAccessEnforced: boolean;
  purchaseApprovalEnabled: boolean;
  purchaseApprovalThreshold: { toString(): string };
  payrollDualApprovalEnabled: boolean;
  stockReasonRequired: boolean;
  stockValueReviewThreshold: { toString(): string };
  expenseOwnerThreshold: { toString(): string };
  cashierMaxDiscountPercent: { toString(): string };
}) {
  return {
    locationAccessEnforced: policy.locationAccessEnforced,
    purchaseApprovalEnabled: policy.purchaseApprovalEnabled,
    purchaseApprovalThreshold: Number(policy.purchaseApprovalThreshold),
    payrollDualApprovalEnabled: policy.payrollDualApprovalEnabled,
    stockReasonRequired: policy.stockReasonRequired,
    stockValueReviewThreshold: Number(policy.stockValueReviewThreshold),
    expenseOwnerThreshold: Number(policy.expenseOwnerThreshold),
    cashierMaxDiscountPercent: Number(policy.cashierMaxDiscountPercent),
  };
}

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const policy = await db.business.findUniqueOrThrow({
    where: { id: context.business.id }, select: fields,
  });
  return NextResponse.json({ businessId: context.business.id, policy: serialize(policy) });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_GOVERNANCE_POLICY" }, { status: 400 });

  const updated = await db.$transaction(async (tx) => {
    const before = serialize(await tx.business.findUniqueOrThrow({
      where: { id: context.business.id }, select: fields,
    }));
    const changed = serialize(await tx.business.update({
      where: { id: context.business.id }, data: parsed.data, select: fields,
    }));
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id,
      action: "GOVERNANCE_POLICY_CHANGED",
      actorUserId: context.user.id,
      actorName: context.user.name,
      actorRole: context.membership.role,
      note: JSON.stringify({ before, after: changed }),
    } });
    return changed;
  });
  return NextResponse.json({ policy: updated });
}
