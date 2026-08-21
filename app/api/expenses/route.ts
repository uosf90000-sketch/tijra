import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const expenseSchema = z.object({
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  amount: z.number().positive(),
  expenseDate: z.coerce.date().optional(),
});

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const expenses = await db.expense.findMany({
    where: { businessId: auth.context.business.id },
    orderBy: { expenseDate: "desc" },
    take: 200,
  });
  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = expenseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const expense = await db.expense.create({
    data: {
      businessId: auth.context.business.id,
      category: parsed.data.category,
      description: parsed.data.description || null,
      amount: parsed.data.amount,
      expenseDate: parsed.data.expenseDate ?? new Date(),
    },
  });
  return NextResponse.json({ expense }, { status: 201 });
}
