import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRoles } from "@/lib/api-auth";
import { recordSale } from "@/lib/stock-operations";

const saleSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
    }),
  ).min(1).max(200),
}).superRefine((data, ctx) => {
  const ids = data.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Duplicate products are not allowed" });
  }
});

export async function POST(request: Request) {
  const auth = await requireApiRoles(["OWNER", "MANAGER", "CASHIER"]);
  if (auth.response) return auth.response;

  const parsed = saleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const sale = await recordSale({ ...parsed.data, businessId: auth.context.business.id });
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALE_FAILED";
    const status = message.startsWith("INSUFFICIENT_STOCK") ? 409 : message === "PRODUCT_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
