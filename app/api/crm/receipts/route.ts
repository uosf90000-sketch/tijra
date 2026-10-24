import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { halalasToDecimal, moneyHalalas, outstandingHalalas } from "@/lib/tijra-360";

const schema = z.object({
  receivableId: z.string().min(1),
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  reference: z.string().trim().min(4).max(120),
  receivedAt: z.coerce.date().optional(),
}).strict();

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_RECEIPT" }, { status: 400 });
  if (moneyHalalas(parsed.data.amount) <= 0n)
    return NextResponse.json({ error: "INVALID_RECEIPT" }, { status: 400 });
  if (parsed.data.receivedAt && parsed.data.receivedAt.getTime() > Date.now() + 60_000)
    return NextResponse.json({ error: "FUTURE_RECEIPT_NOT_ALLOWED" }, { status: 400 });
  try {
    const result = await db.$transaction(async (tx) => {
      const row = await tx.receivable.findFirst({
        where: { id: parsed.data.receivableId, businessId: auth.context.business.id },
        include: { receipts: { select: { amount: true } } },
      });
      if (!row) throw new Error("RECEIVABLE_NOT_FOUND");
      if (row.status === "VOID" || row.status === "PAID") throw new Error("RECEIVABLE_CLOSED");
      const remaining = outstandingHalalas(row.amount.toFixed(2),
        row.receipts.map((receipt) => receipt.amount.toFixed(2)));
      const receiving = moneyHalalas(parsed.data.amount);
      if (receiving > remaining) throw new Error("RECEIPT_EXCEEDS_BALANCE");
      const existingRef = await tx.customerReceipt.count({
        where: { businessId: auth.context.business.id, reference: parsed.data.reference },
      });
      if (existingRef) throw new Error("RECEIPT_REFERENCE_EXISTS");
      const receipt = await tx.customerReceipt.create({ data: {
        businessId: auth.context.business.id, customerId: row.customerId,
        receivableId: row.id, amount: parsed.data.amount,
        reference: parsed.data.reference, receivedAt: parsed.data.receivedAt || new Date(),
        createdByUserId: auth.context.user.id,
      } });
      const outstanding = remaining - receiving;
      const updated = await tx.receivable.updateMany({
        where: { businessId: auth.context.business.id, id: row.id, status: row.status },
        data: { status: outstanding === 0n ? "PAID" : "PARTIALLY_PAID" },
      });
      if (updated.count !== 1) throw new Error("CONCURRENT_RECEIPT");
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "CRM_RECEIPT_RECORDED",
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, orderId: row.id,
        note: JSON.stringify({ reference: receipt.reference, amount: parsed.data.amount,
          remaining: halalasToDecimal(outstanding), bankVerified: false, actualTransferInitiated: false }),
      } });
      return { receiptId: receipt.id, outstanding: halalasToDecimal(outstanding) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "RECEIVABLE_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
    if (["RECEIVABLE_CLOSED", "RECEIPT_EXCEEDS_BALANCE", "RECEIPT_REFERENCE_EXISTS","CONCURRENT_RECEIPT"].includes(code) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002","P2034"].includes(error.code)))
      return NextResponse.json({ error: code || "RECEIPT_CONFLICT" }, { status: 409 });
    console.error("Receipt registration failed", error);
    return NextResponse.json({ error: "RECEIPT_REGISTRATION_FAILED" }, { status: 500 });
  }
}
