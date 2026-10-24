import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { moneyHalalas, milliUnits, halalasToDecimal } from "@/lib/tijra-360";
import { needsPurchaseApproval } from "@/lib/purchase-approval";

const schema = z.object({
  bidId: z.string().min(1),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoles(["OWNER", "MANAGER"]);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_AWARD" }, { status: 400 });
  try {
    const awarded = await db.$transaction(async (tx) => {
      const [rfq, policy] = await Promise.all([
        tx.sourcingRequest.findFirst({
          where: { id, businessId: auth.context.business.id },
          include: { bids: true },
        }),
        tx.business.findUniqueOrThrow({
          where: { id: auth.context.business.id },
          select: { purchaseApprovalEnabled: true, purchaseApprovalThreshold: true },
        }),
      ]);
      if (!rfq) throw new Error("RFQ_NOT_FOUND");
      if (rfq.status !== "OPEN") throw new Error("RFQ_NOT_OPEN");
      const bid = rfq.bids.find((x) => x.id === parsed.data.bidId && x.status === "SUBMITTED");
      if (!bid) throw new Error("BID_NOT_FOUND");
      const totalCents = (moneyHalalas(bid.unitPrice.toFixed(2)) *
        milliUnits(rfq.quantity.toFixed(3)) + 500n) / 1000n;
      if (totalCents <= 0n || totalCents > 99999999999999n) throw new Error("INVALID_RFQ_TOTAL");
      const total = halalasToDecimal(totalCents);
      const gated = needsPurchaseApproval(Number(total), {
        enabled: policy.purchaseApprovalEnabled,
        threshold: Number(policy.purchaseApprovalThreshold),
      });
      // Do not falsely mark this as sent: no external supplier contact occurs.
      const po = await tx.purchaseOrder.create({ data: {
        businessId: auth.context.business.id, supplierId: bid.supplierId,
        orderNumber: "RFQ-" + rfq.id,
        requestedByUserId: auth.context.user.id,
        expectedTotal: total,
        status: gated ? "PENDING_APPROVAL" : "DRAFT",
        notes: "فائز RFQ داخلي " + rfq.id + "؛ السبب: " + parsed.data.reason +
          ". لم يتم إرسال أمر الشراء للمورد آليًا.",
        items: { create: [{
          productId: rfq.productId, orderedQty: rfq.quantity, unitCost: bid.unitPrice,
        }] },
      } });
      const changed = await tx.sourcingRequest.updateMany({
        where: { id, businessId: auth.context.business.id, status: "OPEN" },
        data: { status: "AWARDED" },
      });
      if (changed.count !== 1) throw new Error("RFQ_AWARDED_CONCURRENTLY");
      await tx.sourcingBid.updateMany({
        where: { requestId: rfq.id, businessId: auth.context.business.id, status: "SUBMITTED" },
        data: { status: "REJECTED" },
      });
      await tx.sourcingBid.update({ where: { id: bid.id }, data: { status: "AWARDED" } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "SOURCING_BID_AWARDED",
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, orderId: po.id,
        note: JSON.stringify({ rfqId: rfq.id, bidId: bid.id, supplierId: bid.supplierId,
          total, reason: parsed.data.reason, supplierNotified: false, status: po.status }),
      } });
      return { requestId: rfq.id, purchaseOrderId: po.id, purchaseStatus: po.status, supplierNotified: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(awarded);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["RFQ_NOT_FOUND", "BID_NOT_FOUND"].includes(code))
      return NextResponse.json({ error: code }, { status: 404 });
    if (["RFQ_NOT_OPEN","INVALID_RFQ_TOTAL","RFQ_AWARDED_CONCURRENTLY"].includes(code) ||
      (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)))
      return NextResponse.json({ error: code || "RFQ_AWARD_CONFLICT" }, { status: 409 });
    console.error("Sourcing award failed", error);
    return NextResponse.json({ error: "RFQ_AWARD_FAILED" }, { status: 500 });
  }
}
