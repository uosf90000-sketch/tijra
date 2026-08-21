import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateNetSalary, calculatePayrollRun } from "@/lib/payroll";

const employeeSchema = z.object({
  employeeId: z.string().min(1),
  baseSalary: z.number().nonnegative(),
  allowances: z.number().nonnegative().optional(),
  deductions: z.number().nonnegative().optional(),
  advances: z.number().nonnegative().optional(),
});

const bodySchema = z.object({ employees: z.array(employeeSchema).max(1000) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const items = parsed.data.employees.map((employee: z.infer<typeof employeeSchema>) => ({
    employeeId: employee.employeeId,
    ...calculateNetSalary(employee),
  }));

  return NextResponse.json({
    items,
    summary: calculatePayrollRun(parsed.data.employees),
  });
}
