import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { calculateQuoteHalalas, halalasToDecimal } from "@/lib/tijra-360";

const line = z.object({
  productId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(2).max(300),
  quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/),
  unitPrice: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
});
const schema = z.object({
  customerId: z.string().min(1),
  quoteNumber: z.string().trim().min(3).max(100),
  expiresAt: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
  lines: z.array(line).min(1).max(200),
}).strict();

export async function GET() {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const quotes = await db.salesQuote.findMany({
    where: { businessId: auth.context.business.id },
    include: { customer: { select: { name: true } }, lines: true },
    orderBy: { createdAt: "desc" }, take: 150,
  });
  return NextResponse.json({ quotes });
}

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "ACCOUNTANT"]);
  if (auth.response) return auth.response;
  if (!(await hasBusinessWideRead(auth.context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUOTE" }, { status: 400 });
  let total: string;
  try { total = halalasToDecimal(calculateQuoteHalalas(parsed.data.lines)); }
  catch { return NextResponse.json({ error: "INVALID_QUOTE_AMOUNT" }, { status: 400 }); }
  if (Number(total) > 999999999999.99) return NextResponse.json({ error: "QUOTE_LIMIT_EXCEEDED" }, { status: 400 });
  if (parsed.data.expiresAt && parsed.data.expiresAt <= new Date())
    return NextResponse.json({ error: "EXPIRY_MUST_BE_FUTURE" }, { status: 400 });
  try {
    const result = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: parsed.data.customerId, businessId: auth.context.business.id },
        select: { id: true },
      });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const ids = [...new Set(parsed.data.lines.map((x) => x.productId).filter((x): x is string => Boolean(x)))];
      if (ids.length) {
        const count = await tx.product.count({ where: { id: { in: ids }, businessId: auth.context.business.id } });
        if (count !== ids.length) throw new Error("PRODUCT_NOT_FOUND");
      }
      const quote = await tx.salesQuote.create({
        data: {
          businessId: auth.context.business.id, customerId: customer.id,
          quoteNumber: parsed.data.quoteNumber, expiresAt: parsed.data.expiresAt,
          note: parsed.data.note, total, createdByUserId: auth.context.user.id,
          lines: { create: parsed.data.lines },
        },
        include: { lines: true },
      });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: auth.context.business.id, action: "CRM_QUOTE_DRAFT_CREATED",
        actorUserId: auth.context.user.id, actorName: auth.context.user.name,
        actorRole: auth.context.membership.role, orderId: quote.id,
        note: JSON.stringify({ quoteNumber: quote.quoteNumber, total }),
      } });
      return quote;
    });
    return NextResponse.json({ quote: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["CUSTOMER_NOT_FOUND","PRODUCT_NOT_FOUND"].includes(error.message))
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ error: "QUOTE_NUMBER_EXISTS" }, { status: 409 });
    console.error("Quote creation failed", error);
    return NextResponse.json({ error: "QUOTE_CREATE_FAILED" }, { status: 500 });
  }
}
