import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { adjustLocationStock, actorFromContext, ensureDefaultLocation, listInventoryLocations } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const schema = z.object({
  sourceLocationId: z.string().min(1),
  destinationLocationId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100000000),
  note: z.string().trim().max(300).optional(),
}).refine((data) => data.sourceLocationId !== data.destinationLocationId, { message: "SAME_LOCATION" });

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const businessId = auth.context.business.id;
  await ensureDefaultLocation(businessId);
  const locations = await listInventoryLocations(businessId);
  const source = locations.find((item) => item.id === parsed.data.sourceLocationId && item.active);
  const destination = locations.find((item) => item.id === parsed.data.destinationLocationId && item.active);
  if (!source || !destination) return NextResponse.json({ error: "LOCATION_NOT_FOUND" }, { status: 404 });

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: parsed.data.productId, businessId, active: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const from = await adjustLocationStock(tx, {
        businessId,
        locationId: source.id,
        productId: product.id,
        productName: product.name,
        delta: -parsed.data.quantity,
      });
      const to = await adjustLocationStock(tx, {
        businessId,
        locationId: destination.id,
        productId: product.id,
        productName: product.name,
        delta: parsed.data.quantity,
      });

      const actor = actorFromContext(auth.context);
      const event = await tx.inventoryAuditEvent.create({
        data: {
          businessId,
          action: "LOCATION_TRANSFER",
          listingId: product.id,
          orderId: source.id,
          itemName: product.name,
          quantity: parsed.data.quantity,
          previousQuantity: from.previous,
          newQuantity: from.next,
          actorUserId: actor.userId,
          actorName: actor.name,
          actorRole: actor.role,
          note: JSON.stringify({
            sourceLocationId: source.id,
            sourceName: source.name,
            destinationLocationId: destination.id,
            destinationName: destination.name,
            destinationPrevious: to.previous,
            destinationNew: to.next,
            note: parsed.data.note || null,
          }),
        },
      });
      return event;
    });
    return NextResponse.json({ transfer: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "TRANSFER_FAILED";
    const status = code === "PRODUCT_NOT_FOUND" ? 404 : code.startsWith("INSUFFICIENT_LOCATION_STOCK") ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
