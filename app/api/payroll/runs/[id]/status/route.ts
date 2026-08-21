import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({ action: z.enum(["APPROVE", "MARK_PAID"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await params;

  const run = await db.payrollRun.findFirst({ where: { id, businessId: auth.context.business.id } });
  if (!run) return NextResponse.json({ error: "PAYROLL_RUN_NOT_FOUND" }, { status: 404 });

  if (parsed.data.action === "APPROVE") {
    if (run.status !== "DRAFT") return NextResponse.json({ error: "RUN_NOT_DRAFT" }, { status: 409 });
    const updated = await db.payrollRun.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
    return NextResponse.json({ run: updated });
  }

  if (run.status !== "APPROVED") return NextResponse.json({ error: "RUN_NOT_APPROVED" }, { status: 409 });
  const updated = await db.payrollRun.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  return NextResponse.json({ run: updated });
}
