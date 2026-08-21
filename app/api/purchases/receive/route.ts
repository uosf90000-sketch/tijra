import { NextResponse } from "next/server";
import { z } from "zod";
import { receivePurchaseOrder } from "@/lib/stock-operations";

const receiptSchema = z.object({
  businessId: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(100).optional(),
  issuedAt: z.coerce.date().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      receivedQty: z.number().positive(),
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
  const parsed = receiptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await receivePurchaseOrder(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIPT_FAILED";
    const notFound = message === "PURCHASE_ORDER_NOT_FOUND" || message === "PRODUCT_NOT_IN_PURCHASE_ORDER";
    const conflict = message.startsWith("RECEIVED_QTY_EXCEEDS_ORDER") || message.includes("CANCELLED") || message.includes("ALREADY_RECEIVED");
    return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
  }
}
