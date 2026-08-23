import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { isFoodActivity } from "@/lib/business-experience";
import { db } from "@/lib/db";

const schema = z.object({
  productId: z.string().min(1),
  saleMode: z.enum(["STANDARD", "WEIGHT", "SERIAL", "RECIPE", "SERVICE"]),
  size: z.string().trim().max(60).optional(),
  color: z.string().trim().max(60).optional(),
  variantGroup: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  if (auth.context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.saleMode === "RECIPE" && !isFoodActivity(auth.context.business.businessActivity)) {
    return NextResponse.json({ error: "RECIPES_NOT_AVAILABLE_FOR_ACTIVITY" }, { status: 403 });
  }
  const product = await db.product.findFirst({ where: { id: parsed.data.productId, businessId: auth.context.business.id, active: true } });
  if (!product) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const existing = await db.inventoryAuditEvent.findFirst({
    where: { businessId: auth.context.business.id, action: "PRODUCT_CONFIG", listingId: product.id },
  });
  const data = {
    itemName: product.name,
    actorUserId: auth.context.user.id,
    actorName: auth.context.user.name,
    actorRole: auth.context.membership.role,
    note: JSON.stringify({
      saleMode: parsed.data.saleMode,
      size: parsed.data.size || null,
      color: parsed.data.color || null,
      variantGroup: parsed.data.variantGroup || null,
    }),
    occurredAt: new Date(),
  };
  const config = existing
    ? await db.inventoryAuditEvent.update({ where: { id: existing.id }, data })
    : await db.inventoryAuditEvent.create({ data: { businessId: auth.context.business.id, action: "PRODUCT_CONFIG", listingId: product.id, ...data } });
  return NextResponse.json({ config });
}
