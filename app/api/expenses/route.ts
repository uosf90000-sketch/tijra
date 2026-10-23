import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  amount: z.number().positive(),
  expenseDate: z.coerce.date().optional(),
});

export async function GET() {
  const auth = await requireApiPermission("ACCOUNTING");
  if (auth.response) return auth.response;
  const expenses = await db.expense.findMany({
    where: { businessId: auth.context.business.id },
    orderBy: { expenseDate: "desc" },
    take: 200,
  });
  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("ACCOUNTING");
  if (auth.response) return auth.response;
  const parsed = expenseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const policy = await db.business.findUniqueOrThrow({
    where: { id: auth.context.business.id },
    select: { expenseOwnerThreshold: true },
  });
  if (parsed.data.amount >= Number(policy.expenseOwnerThreshold) &&
      auth.context.membership.role !== "OWNER") {
    return NextResponse.json({ error: "OWNER_REQUIRED_FOR_LARGE_EXPENSE" }, { status: 403 });
  }
  if (parsed.data.amount >= Number(policy.expenseOwnerThreshold) &&
      (!parsed.data.description || parsed.data.description.length < 8)) {
    return NextResponse.json({ error: "EXPENSE_REASON_REQUIRED" }, { status: 400 });
  }
  const expense = await db.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        businessId: auth.context.business.id,
        createdByUserId: auth.context.user.id,
        category: parsed.data.category,
        description: parsed.data.description || null,
        amount: parsed.data.amount,
        expenseDate: parsed.data.expenseDate ?? new Date(),
      },
    });
    await tx.inventoryAuditEvent.create({
      data: {
        businessId: auth.context.business.id, action: "EXPENSE_RECORDED", orderId: created.id,
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({ category: created.category, amount: Number(created.amount), description: created.description }),
      },
    });
    return created;
  });
  return NextResponse.json({ expense }, { status: 201 });
}
