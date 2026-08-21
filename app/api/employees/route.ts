import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const employeeSchema = z.object({
  name: z.string().trim().min(2).max(140),
  phone: z.string().trim().max(30).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  baseSalary: z.number().nonnegative(),
  defaultAllowance: z.number().nonnegative().default(0),
  hiredAt: z.coerce.date().optional(),
});

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const employees = await db.employee.findMany({
    where: { businessId: auth.context.business.id, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER"]);
  if (auth.response) return auth.response;
  const parsed = employeeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const employee = await db.employee.create({
    data: {
      businessId: auth.context.business.id,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      jobTitle: parsed.data.jobTitle || null,
      baseSalary: parsed.data.baseSalary,
      defaultAllowance: parsed.data.defaultAllowance,
      hiredAt: parsed.data.hiredAt,
    },
  });
  return NextResponse.json({ employee }, { status: 201 });
}
