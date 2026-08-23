import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { adjustLocationStock, actorFromContext, ensureDefaultLocation, syncListingForProduct } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive().max(100000000),
  type: z.enum(["CUSTOMER_RETURN", "SUPPLIER_RETURN", "DAMAGED"]),
  locationId: z.string().optional(),
  reason: z.string().trim().max(300).optional(),
  serials: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const businessId = auth.context.business.id;
  const defaultLocation = await ensureDefaultLocation(businessId);
  const locationId = parsed.data.locationId || defaultLocation.id;
  const delta = parsed.data.type === "CUSTOMER_RETURN" ? parsed.data.quantity : -parsed.data.quantity;

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: parsed.data.productId, businessId, active: true } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      if (delta < 0) {
        const updated = await tx.product.updateMany({
          where: { id: product.id, businessId, quantity: { gte: parsed.data.quantity } },
          data: { quantity: { decrement: parsed.data.quantity } },
        });
        if (updated.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${Number(product.quantity)}`);
      } else {
        await tx.product.update({ where: { id: product.id }, data: { quantity: { increment: parsed.data.quantity } } });
      }

      await adjustLocationStock(tx, {
        businessId,
        locationId,
        productId: product.id,
        productName: product.name,
        delta,
      });
      await syncListingForProduct(tx, { businessId, productId: product.id, delta });

      const movementType = parsed.data.type === "CUSTOMER_RETURN" ? "RETURN_IN"
        : parsed.data.type === "SUPPLIER_RETURN" ? "RETURN_OUT"
        : "ADJUSTMENT_OUT";
      await tx.stockMovement.create({
        data: {
          businessId,
          productId: product.id,
          type: movementType,
          quantity: delta,
          unitCost: product.averageCost,
          sourceType: parsed.data.type,
          note: parsed.data.reason || undefined,
        },
      });

      if (parsed.data.serials?.length) {
        for (const serial of parsed.data.serials) {
          const row = await tx.inventoryAuditEvent.findFirst({
            where: { businessId, action: "PRODUCT_SERIAL", listingId: product.id, itemName: serial },
          });
          if (parsed.data.type === "CUSTOMER_RETURN") {
            if (row) {
              await tx.inventoryAuditEvent.update({
                where: { id: row.id },
                data: { quantity: 1, orderId: null, note: JSON.stringify({ status: "IN_STOCK", locationId }), occurredAt: new Date() },
              });
            } else {
              await tx.inventoryAuditEvent.create({
                data: {
                  businessId,
                  action: "PRODUCT_SERIAL",
                  listingId: product.id,
                  itemName: serial,
                  quantity: 1,
                  actorUserId: auth.context.user.id,
                  actorName: auth.context.user.name,
                  actorRole: auth.context.membership.role,
                  note: JSON.stringify({ status: "IN_STOCK", locationId }),
                },
              });
            }
          } else if (row) {
            await tx.inventoryAuditEvent.update({
              where: { id: row.id },
              data: { quantity: 0, note: JSON.stringify({ status: parsed.data.type === "DAMAGED" ? "DAMAGED" : "RETURNED_TO_SUPPLIER", locationId }), occurredAt: new Date() },
            });
          }
        }
      }

      const actor = actorFromContext(auth.context);
      return tx.inventoryAuditEvent.create({
        data: {
          businessId,
          action: parsed.data.type,
          listingId: product.id,
          itemName: product.name,
          quantity: parsed.data.quantity,
          previousQuantity: Number(product.quantity),
          newQuantity: Math.max(0, Number(product.quantity) + delta),
          actorUserId: actor.userId,
          actorName: actor.name,
          actorRole: actor.role,
          note: parsed.data.reason || (parsed.data.type === "CUSTOMER_RETURN" ? "مرتجع من عميل" : parsed.data.type === "SUPPLIER_RETURN" ? "مرتجع إلى المورد" : "تالف/غير صالح للبيع"),
        },
      });
    });

    return NextResponse.json({ event: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RETURN_FAILED";
    const status = code === "PRODUCT_NOT_FOUND" ? 404 : code.startsWith("INSUFFICIENT_STOCK") || code.startsWith("INSUFFICIENT_LOCATION_STOCK") ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
