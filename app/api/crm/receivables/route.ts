import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { creditExposureViolation, halalasToDecimal, moneyHalalas, outstandingHalalas } from "@/lib/tijra-360";

const schema = z.object({
  customerId: z.string().min(1),
  quoteId: z.string().min(1).optional(),
  invoiceRef: z.string().trim().min(3).max(120),
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  dueAt: z.coerce.date(),
  description: z.string().trim().max(500).optional(),
}).strict();

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const list = await db.receivable.findMany({
    where: { businessId: auth.context.business.id },
    include: { customer: { select: { id: true, name: true } },
      receipts: { select: { amount: true, receivedAt: true, reference: true } } },
    orderBy: { dueAt: "asc" }, take: 250,
  });
  const receivables = list.map((row) => ({
    id: row.id, invoiceRef: row.invoiceRef, customerId: row.customerId,
    customerName: row.customer.name, amount: row.amount.toFixed(2),
    outstanding: halalasToDecimal(outstandingHalalas(row.amount.toFixed(2),
      row.receipts.map((x) => x.amount.toFixed(2)))),
    dueAt: row.dueAt, status: row.status, description: row.description,
    receipts: row.receipts.map((x) => ({
      reference: x.reference, amount: x.amount.toFixed(2), receivedAt: x.receivedAt,
    })),
  }));
  return NextResponse.json({ receivables });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || moneyHalalas(parsed.data?.amount || "0") <= 0n)
    return NextResponse.json({ error: "INVALID_RECEIVABLE" }, { status: 400 });
  try {
    const created = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: parsed.data.customerId, businessId: auth.context.business.id },
      });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      if (parsed.data.quoteId) {
        const quote = await tx.salesQuote.findFirst({
          where: { id: parsed.data.quoteId, businessId: auth.context.business.id,
            customerId: customer.id, status: "ACCEPTED" },
        });
        if (!quote) throw new Error("ACCEPTED_QUOTE_NOT_FOUND");
        if (moneyHalalas(parsed.data.amount) > moneyHalalas(quote.total.toFixed(2)))
          throw new Error("AMOUNT_EXCEEDS_QUOTE");
        const previous = await tx.receivable.count({
          where: { businessId: auth.context.business.id, quoteId: quote.id },
        });
        if (previous > 0) throw new Error("QUOTE_ALREADY_BILLED_INTERNALLY");
      }
      const open = await tx.receivable.findMany({
        where: { businessId: auth.context.business.id, customerId: customer.id,
          status: { in: ["OPEN", "PARTIALLY_PAID"] } },
        select: { amount: true, receipts: { select: { amount: true } } },
      });
      const existing = open.map((row) => halalasToDecimal(outstandingHalalas(
        row.amount.toFixed(2), row.receipts.map((receipt) => receipt.amount.toFixed(2)))));
      const violation = creditExposureViolation({
        limit: customer.creditLimit.toFixed(2), existingOutstanding: existing, proposed: parsed.data.amount,
      });
      if (violation) throw new Error(violation);
      const receivable = await tx.receivable.create({ data: {
        businessId: auth.context.business.id, customerId: customer.id,
        quoteId: parsed.data.quoteId || null, invoiceRef: parsed.data.invoiceRef,
        amount: parsed.data.amount, dueAt: parsed.data.dueAt,
        description: parsed.data.description, createdByUserId: auth.context.user.id,
      } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "CRM_RECEIVABLE_RECORDED",
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, orderId: receivable.id,
        note: JSON.stringify({ customerId: customer.id, invoiceRef: receivable.invoiceRef,
          amount: parsed.data.amount, taxInvoiceIssued: false }),
      } });
      return receivable;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ receivable: created }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["CUSTOMER_NOT_FOUND", "ACCEPTED_QUOTE_NOT_FOUND"].includes(code))
      return NextResponse.json({ error: code }, { status: 404 });
    if (["AMOUNT_EXCEEDS_QUOTE", "CUSTOMER_CREDIT_LIMIT_EXCEEDED", "QUOTE_ALREADY_BILLED_INTERNALLY"].includes(code) ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)))
      return NextResponse.json({ error: code || "RECEIVABLE_CONFLICT" }, { status: 409 });
    console.error("Receivable create failed", error);
    return NextResponse.json({ error: "RECEIVABLE_CREATE_FAILED" }, { status: 500 });
  }
}
