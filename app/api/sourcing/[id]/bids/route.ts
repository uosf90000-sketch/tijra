import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { moneyHalalas } from "@/lib/tijra-360";

const schema = z.object({
  supplierId: z.string().min(1),
  unitPrice: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  deliveryDays: z.number().int().min(0).max(365).optional(),
  note: z.string().trim().max(800).optional(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SUPPLIER_BID" }, { status: 400 });
  if (moneyHalalas(parsed.data.unitPrice) <= 0n)
    return NextResponse.json({ error: "INVALID_SUPPLIER_BID" }, { status: 400 });
  try {
    const bid = await db.$transaction(async (tx) => {
      const rfq = await tx.sourcingRequest.findFirst({
        where: { businessId: auth.context.business.id, id, status: "OPEN" },
      });
      if (!rfq) throw new Error("OPEN_RFQ_NOT_FOUND");
      if (rfq.quoteDeadline && rfq.quoteDeadline < new Date()) throw new Error("RFQ_DEADLINE_PASSED");
      const supplier = await tx.supplier.findFirst({
        where: { id: parsed.data.supplierId, businessId: auth.context.business.id },
      });
      if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
      const created = await tx.sourcingBid.create({ data: {
        requestId: rfq.id, businessId: auth.context.business.id, supplierId: supplier.id,
        unitPrice: parsed.data.unitPrice, deliveryDays: parsed.data.deliveryDays,
        note: parsed.data.note,
      } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "SOURCING_BID_RECORDED",
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, orderId: rfq.id,
        note: JSON.stringify({ supplierId: supplier.id, bidId: created.id,
          unitPrice: parsed.data.unitPrice, deliveryDays: parsed.data.deliveryDays,
          quoteExternallyVerified: false }),
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ bid }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["OPEN_RFQ_NOT_FOUND", "SUPPLIER_NOT_FOUND"].includes(code))
      return NextResponse.json({ error: code }, { status: 404 });
    if (code === "RFQ_DEADLINE_PASSED" ||
        (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)))
      return NextResponse.json({ error: code || "BID_CONFLICT" }, { status: 409 });
    console.error("Sourcing bid failed", error);
    return NextResponse.json({ error: "BID_RECORD_FAILED" }, { status: 500 });
  }
}
