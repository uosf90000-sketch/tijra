import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const adjustmentSchema = z.object({
  employeeId: z.string().min(1),
  allowances: z.number().nonnegative().optional(),
  deductions: z.number().nonnegative().optional(),
  advances: z.number().nonnegative().optional(),
  note: z.string().trim().max(500).optional(),
});

const bodySchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  approve: z.boolean().default(false),
  adjustments: z.array(adjustmentSchema).max(1000).default([]),
}).refine((value) => value.periodEnd >= value.periodStart, { message: "periodEnd must be after periodStart" });

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;

  const runs = await db.payrollRun.findMany({
    where: { businessId: auth.context.business.id },
    include: { items: { include: { employee: true } } },
    orderBy: { periodEnd: "desc" },
    take: 24,
  });
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const employees = await db.employee.findMany({
    where: { businessId: auth.context.business.id, active: true },
  });
  if (!employees.length) return NextResponse.json({ error: "NO_ACTIVE_EMPLOYEES" }, { status: 409 });

  const adjustments = new Map(parsed.data.adjustments.map((item) => [item.employeeId, item]));
  const now = new Date();

  const run = await db.payrollRun.create({
    data: {
      businessId: auth.context.business.id,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      status: parsed.data.approve ? "APPROVED" : "DRAFT",
      approvedAt: parsed.data.approve ? now : null,
      items: {
        create: employees.map((employee) => {
          const override = adjustments.get(employee.id);
          const baseSalary = Number(employee.baseSalary);
          const allowances = override?.allowances ?? Number(employee.defaultAllowance);
          const deductions = override?.deductions ?? 0;
          const advances = override?.advances ?? 0;
          return {
            employeeId: employee.id,
            baseSalary,
            allowances,
            deductions,
            advances,
            netSalary: Math.max(0, baseSalary + allowances - deductions - advances),
            note: override?.note || null,
          };
        }),
      },
    },
    include: { items: { include: { employee: true } } },
  });

  return NextResponse.json({ run }, { status: 201 });
}
