import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";

const kinds = z.enum(["SUPPLIER_DELIVERY", "CUSTOMER_PAYMENT", "SERVICE_COMPLETION"]);
const schema = z.object({
  kind: z.literal("SERVICE_COMPLETION"),
  title: z.string().trim().min(3).max(180),
  customerId: z.string().min(1).optional(),
  expectedAt: z.coerce.date(),
  expectedAmount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).optional(),
}).strict();

export async function GET(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const requestedKind = new URL(request.url).searchParams.get("kind");
  const kind = requestedKind ? kinds.safeParse(requestedKind) : null;
  if (kind && !kind.success) return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
  const items = await db.businessCommitment.findMany({
    where: { businessId: context.business.id, ...(kind?.success ? { kind: kind.data } : {}) },
    include: { supplier: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } } },
    orderBy: { expectedAt: "asc" }, take: 250,
  });
  return NextResponse.json({ items, maxResults: 250, bankVerified: false, deliveryVerifiedExternally: false });
}

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_COMMITMENT", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.expectedAt.getTime() < Date.now() - 60_000)
    return NextResponse.json({ error: "EXPECTED_DATE_IN_PAST" }, { status: 400 });
  const { customerId, title, kind, expectedAt, expectedAmount } = parsed.data;
  if (customerId) {
    const valid = await db.customer.findFirst({ where: { businessId: context.business.id, id: customerId }, select: { id: true } });
    if (!valid) return NextResponse.json({ error: "CUSTOMER_NOT_FOUND" }, { status: 404 });
  }
  const record = await db.$transaction(async (tx) => {
    const item = await tx.businessCommitment.create({ data: {
      businessId: context.business.id, title, kind, expectedAt,
      customerId: customerId || null, expectedAmount: expectedAmount || null,
      createdByUserId: context.user.id,
    } });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "COMMITMENT_CREATED",
      orderId: item.id, actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role, itemName: title,
      note: JSON.stringify({ kind, expectedAt, customerId, expectedAmount, externallyVerified: false }),
    } });
    return item;
  });
  return NextResponse.json({ commitment: record }, { status: 201 });
}
