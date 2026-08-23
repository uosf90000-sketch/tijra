import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({
  listingId: z.string().trim().min(1),
  countedQuantity: z.coerce.number().nonnegative().max(100000000),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const context = auth.context;

  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_ACCOUNT_REQUIRED" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const { listingId, countedQuantity } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findFirst({
        where: { id: listingId, sellerBusinessId: context.business.id },
      });
      if (!listing) throw new Error("LISTING_NOT_FOUND");

      const previousQuantity = Number(listing.quantity);
      const delta = countedQuantity - previousQuantity;
      const updated = await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { quantity: countedQuantity },
      });

      const event = await tx.inventoryAuditEvent.create({
        data: {
          businessId: context.business.id,
          action: "COUNT",
          listingId: listing.id,
          itemName: listing.name,
          quantity: Math.abs(delta),
          previousQuantity,
          newQuantity: countedQuantity,
          actorUserId: context.user.id,
          actorName: context.user.name,
          actorRole: context.membership.role,
          note: delta === 0
            ? "جرد مطابق للكمية المسجلة"
            : `تسوية جرد ${delta > 0 ? "بالزيادة" : "بالنقص"} بمقدار ${Math.abs(delta)}`,
        },
      });

      return { updated, event, delta };
    });

    return NextResponse.json({
      listing: result.updated,
      event: result.event,
      delta: result.delta,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUDIT_FAILED";
    const status = code === "LISTING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
