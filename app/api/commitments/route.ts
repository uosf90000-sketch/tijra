import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";

const kinds = z.enum(["SUPPLIER_DELIVERY", "CUSTOMER_PAYMENT", "SERVICE_COMPLETION"]);
const schema = z.object({
  kind: z.enum(["SERVICE_COMPLETION", "SUPPLIER_DELIVERY"]),
  title: z.string().trim().min(3).max(180).optional(),
  sourceId: z.string().min(1).optional(),
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
  const { customerId, kind, expectedAt, expectedAmount, sourceId } = parsed.data;
  if (kind === "SERVICE_COMPLETION" && (!parsed.data.title || sourceId))
    return NextResponse.json({ error: "INVALID_SERVICE_PROMISE" }, { status: 400 });
  if (kind === "SUPPLIER_DELIVERY" && (!sourceId || customerId || expectedAmount))
    return NextResponse.json({ error: "INVALID_SUPPLIER_PROMISE" }, { status: 400 });
  let title = parsed.data.title || "";
  let supplierId: string | null = null;
  let validatedSource: string | null = null;
  let amount: string | null = expectedAmount || null;
  if (kind === "SUPPLIER_DELIVERY") {
    const po = await db.purchaseOrder.findFirst({
      where: { businessId: context.business.id, id: sourceId,
        status: { notIn: ["CANCELLED", "RECEIVED"] } },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!po) return NextResponse.json({ error: "PURCHASE_ORDER_NOT_OPEN" }, { status: 404 });
    supplierId = po.supplierId;
    validatedSource = po.id;
    title = `توريد طلب ${po.orderNumber || po.id.slice(-8)} — ${po.supplier.name}`;
    amount = po.expectedTotal.toFixed(2);
  }
  if (customerId) {
    const valid = await db.customer.findFirst({ where: { businessId: context.business.id, id: customerId }, select: { id: true } });
    if (!valid) return NextResponse.json({ error: "CUSTOMER_NOT_FOUND" }, { status: 404 });
  }
  try {
  const record = await db.$transaction(async (tx) => {
    // Lock the purchase order row against concurrent cancellation/receipt.
    // Outside-transaction validation above is only for a helpful error response.
    if (kind === "SUPPLIER_DELIVERY") {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${validatedSource} AND "businessId" = ${context.business.id}
        FOR UPDATE
      `;
      if (!locked.length) throw new Error("PURCHASE_ORDER_NOT_OPEN");
      const current = await tx.purchaseOrder.findFirst({
        where: { id: validatedSource!, businessId: context.business.id,
          status: { notIn: ["CANCELLED", "RECEIVED"] } },
        select: { id: true },
      });
      if (!current) throw new Error("PURCHASE_ORDER_NOT_OPEN");
    }
    const item = await tx.businessCommitment.create({ data: {
      businessId: context.business.id, title, kind, expectedAt,
      customerId: customerId || null, supplierId, sourceId: validatedSource, expectedAmount: amount,
      createdByUserId: context.user.id,
    } });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "COMMITMENT_CREATED",
      orderId: item.id, actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role, itemName: title,
      note: JSON.stringify({ kind, expectedAt, customerId, supplierId, sourceId: validatedSource, expectedAmount: amount, externallyVerified: false }),
    } });
    return item;
  });
  return NextResponse.json({ commitment: record }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PURCHASE_ORDER_NOT_OPEN")
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))
      return NextResponse.json({ error: "COMMITMENT_DUPLICATE_OR_CONCURRENT" }, { status: 409 });
    console.error("Commitment creation failed", error);
    return NextResponse.json({ error: "COMMITMENT_CREATION_FAILED" }, { status: 500 });
  }
}
