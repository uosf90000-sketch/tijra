import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { milliUnits } from "@/lib/tijra-360";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/),
  quoteDeadline: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
}).strict();

export async function GET() {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const requests = await db.sourcingRequest.findMany({
    where: { businessId: auth.context.business.id },
    include: { product: { select: { name: true, unit: true } },
      bids: { include: { supplier: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" }, take: 150,
  });
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_RFQ" }, { status: 400 });
  try { milliUnits(parsed.data.quantity); }
  catch { return NextResponse.json({ error: "INVALID_QUANTITY" }, { status: 400 }); }
  if (parsed.data.quoteDeadline && parsed.data.quoteDeadline <= new Date())
    return NextResponse.json({ error: "RFQ_DEADLINE_PAST" }, { status: 400 });
  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, businessId: auth.context.business.id, active: true },
    select: { id: true },
  });
  if (!product) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  const created = await db.$transaction(async (tx) => {
    const rfq = await tx.sourcingRequest.create({ data: {
      businessId: auth.context.business.id, productId: product.id,
      quantity: parsed.data.quantity, quoteDeadline: parsed.data.quoteDeadline,
      note: parsed.data.note, createdByUserId: auth.context.user.id,
    } });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: auth.context.business.id, action: "SOURCING_RFQ_DRAFT_CREATED",
      actorUserId: auth.context.user.id, actorName: auth.context.user.name,
      actorRole: auth.context.membership.role, orderId: rfq.id,
      note: JSON.stringify({ productId: product.id, quantity: parsed.data.quantity,
        supplierInvited: false }),
    } });
    return rfq;
  });
  return NextResponse.json({ request: created }, { status: 201 });
}
