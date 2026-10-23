import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { receivePurchaseOrder } from "@/lib/stock-operations";

const receiptSchema = z.object({
  purchaseOrderId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(100).optional(),
  issuedAt: z.coerce.date().optional(),
  declaredTotal: z.number().nonnegative().optional(),
  declaredVat: z.number().nonnegative().optional(),
  acknowledgeVariance: z.boolean().optional(),
  reviewNote: z.string().trim().max(1000).optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      receivedQty: z.number().positive(),
      invoicedQty: z.number().positive().optional(),
      unitCost: z.number().nonnegative(),
    }),
  ).min(1).max(500),
}).superRefine((data, ctx) => {
  const ids = data.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Duplicate products are not allowed" });
  }
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;

  if (auth.context.business.locationAccessEnforced && auth.context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED_FOR_UNSCOPED_RECEIPT" }, { status: 403 });
  const parsed = receiptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await receivePurchaseOrder({ ...parsed.data, businessId: auth.context.business.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIPT_FAILED";
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "DUPLICATE_SUPPLIER_INVOICE" }, { status: 409 });
    }
    const notFound = message === "PURCHASE_ORDER_NOT_FOUND" || message === "PRODUCT_NOT_IN_PURCHASE_ORDER";
    const conflict = message.startsWith("RECEIVED_QTY_EXCEEDS_ORDER") ||
      message.startsWith("PURCHASE_REVIEW_REQUIRED") ||
      message === "DUPLICATE_SUPPLIER_INVOICE" ||
      message.includes("CANCELLED") || message.includes("ALREADY_RECEIVED") || message === "PURCHASE_ORDER_NOT_APPROVED";
    return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
  }
}
