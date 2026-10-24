import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9._-]{2,24}$/),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
});

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const accounts = await db.financialAccount.findMany({
    where: { businessId: auth.context.business.id },
    orderBy: { code: "asc" },
    take: 2000,
  });
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_ACCOUNT" }, { status: 400 });
  try {
    const account = await db.$transaction(async (tx) => {
      const created = await tx.financialAccount.create({
        data: { businessId: auth.context.business.id, ...parsed.data },
      });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id,
        action: "LEDGER_ACCOUNT_CREATED", itemName: created.code,
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: JSON.stringify({ name: created.name, kind: created.kind }),
      } });
      return created;
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ error: "DUPLICATE_ACCOUNT_CODE" }, { status: 409 });
    console.error("Ledger account create failed", error);
    return NextResponse.json({ error: "ACCOUNT_CREATE_FAILED" }, { status: 500 });
  }
}
