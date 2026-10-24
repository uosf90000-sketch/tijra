import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]).default("BUSINESS"),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(180).optional().or(z.literal("")),
  taxNumber: z.string().trim().max(30).optional(),
  creditLimit: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).default("0"),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
}).strict();

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const customers = await db.customer.findMany({
    where: { businessId: auth.context.business.id },
    orderBy: { createdAt: "desc" }, take: 300,
    select: { id: true, name: true, phone: true, email: true, customerType: true,
      creditLimit: true, paymentTermsDays: true, createdAt: true },
  });
  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CUSTOMER" }, { status: 400 });
  if (auth.context.membership.role !== "OWNER" && Number(parsed.data.creditLimit) > 0)
    return NextResponse.json({ error: "OWNER_REQUIRED_FOR_CREDIT_LIMIT" }, { status: 403 });
  const { email, phone, taxNumber, ...data } = parsed.data;
  const customer = await db.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: { businessId: auth.context.business.id, ...data,
        email: email || null, phone: phone || null, taxNumber: taxNumber || null },
    });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: auth.context.business.id, action: "CRM_CUSTOMER_CREATED",
      actorUserId: auth.context.user.id, actorName: auth.context.user.name,
      actorRole: auth.context.membership.role, itemName: created.name,
      note: JSON.stringify({ customerId: created.id, creditLimit: String(created.creditLimit) }),
    } });
    return created;
  });
  return NextResponse.json({ customer }, { status: 201 });
}
