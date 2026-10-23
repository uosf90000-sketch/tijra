import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  productId: z.string().min(1),
  newSalePrice: z.number().positive().max(999999999),
  expectedSalePrice: z.number().nonnegative(),
  expectedAverageCost: z.number().nonnegative(),
  reason: z.string().trim().min(8).max(600),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  if (auth.context.membership.role !== "OWNER") {
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }
  const { productId, newSalePrice, expectedSalePrice, expectedAverageCost, reason } = parsed.data;

  try {
    const updated = await db.$transaction(async (tx) => {
      const old = await tx.product.findFirst({
        where: { id: productId, businessId: auth.context.business.id, active: true },
        select: { id: true, name: true, salePrice: true, averageCost: true },
      });
      if (!old) throw new Error("PRODUCT_NOT_FOUND");
      if (Math.abs(Number(old.salePrice) - expectedSalePrice) > 0.009 ||
          Math.abs(Number(old.averageCost) - expectedAverageCost) > 0.009) {
        throw new Error("STALE_PRICE_OR_COST");
      }
      if (Math.abs(Number(old.salePrice) - newSalePrice) < 0.009) {
        throw new Error("UNCHANGED_PRICE");
      }
      const product = await tx.product.update({
        where: { id: old.id },
        data: { salePrice: newSalePrice },
      });
      await tx.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "OWNER_SALE_PRICE_CHANGE",
          listingId: old.id,
          itemName: old.name,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          note: JSON.stringify({
            previousSalePrice: Number(old.salePrice),
            newSalePrice,
            averageCostAtApproval: Number(old.averageCost),
            reason,
          }),
        },
      });
      return product;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ product: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PRODUCT_NOT_FOUND") return NextResponse.json({ error: message }, { status: 404 });
    if (["STALE_PRICE_OR_COST", "UNCHANGED_PRICE"].includes(message) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: message === "UNCHANGED_PRICE" ? message : "STALE_PRICE_OR_COST" }, { status: 409 });
    }
    console.error("Price approval failed", error);
    return NextResponse.json({ error: "PRICE_UPDATE_FAILED" }, { status: 500 });
  }
}
