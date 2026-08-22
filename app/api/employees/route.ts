import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const permissionSchema = z.enum(["CASHIER", "INVENTORY", "PURCHASES", "ACCOUNTING"]);

const employeeSchema = z.object({
  name: z.string().trim().min(2).max(140),
  phone: z.string().trim().max(30).optional(),
  jobTitle: z.string().trim().max(100).optional(),
  baseSalary: z.number().nonnegative(),
  defaultAllowance: z.number().nonnegative().default(0),
  hiredAt: z.coerce.date().optional(),
  createAccount: z.boolean().default(false),
  accountEmail: z.string().trim().email().max(190).optional(),
  temporaryPassword: z.string().min(8).max(128).optional(),
  permissions: z.array(permissionSchema).max(4).default([]),
}).superRefine((data, ctx) => {
  if (!data.createAccount) return;
  if (!data.accountEmail) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountEmail"], message: "Account email is required" });
  if (!data.temporaryPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["temporaryPassword"], message: "Temporary password is required" });
  if (!data.permissions.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["permissions"], message: "Select at least one permission" });
});

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const employees = await db.employee.findMany({
    where: { businessId: auth.context.business.id, active: true },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          memberships: {
            where: { businessId: auth.context.business.id },
            select: { role: true, permissions: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER"]);
  if (auth.response) return auth.response;
  const parsed = employeeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  if (data.createAccount && auth.context.membership.role !== "OWNER") {
    return NextResponse.json({ error: "OWNER_REQUIRED_FOR_ACCOUNT_ACCESS" }, { status: 403 });
  }

  try {
    const employee = await db.$transaction(async (tx) => {
      let userId: string | null = null;
      if (data.createAccount) {
        const email = data.accountEmail!.toLowerCase();
        const passwordHash = await hashPassword(data.temporaryPassword!);
        const user = await tx.user.create({
          data: {
            name: data.name,
            email,
            phone: data.phone || null,
            passwordHash,
            memberships: {
              create: {
                businessId: auth.context.business.id,
                role: "STAFF",
                permissions: data.permissions,
              },
            },
          },
        });
        userId = user.id;
      }

      return tx.employee.create({
        data: {
          businessId: auth.context.business.id,
          userId,
          name: data.name,
          phone: data.phone || null,
          jobTitle: data.jobTitle || null,
          baseSalary: data.baseSalary,
          defaultAllowance: data.defaultAllowance,
          hiredAt: data.hiredAt,
        },
        include: {
          user: {
            select: {
              email: true,
              memberships: {
                where: { businessId: auth.context.business.id },
                select: { role: true, permissions: true },
              },
            },
          },
        },
      });
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "ACCOUNT_EMAIL_ALREADY_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ error: "EMPLOYEE_CREATE_FAILED" }, { status: 500 });
  }
}
