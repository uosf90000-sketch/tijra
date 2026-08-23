import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { convertRecipeQuantity } from "@/lib/recipes";

const unitSchema = z.enum(["غرام", "كيلو", "مل", "لتر", "حبة", "قطعة", "شريحة", "رغيف"]);

const recipeSchema = z.object({
  saleProductId: z.string().min(1),
  ingredientProductId: z.string().min(1),
  quantity: z.coerce.number().positive().max(1000000),
  unit: unitSchema,
  canRemove: z.boolean().default(false),
  canExtra: z.boolean().default(false),
  extraPrice: z.coerce.number().nonnegative().max(100000).default(0),
  yieldPercent: z.coerce.number().min(1).max(100).default(100),
});

function requireOwner(role: string) {
  return role === "OWNER" ? null : NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const ownerError = requireOwner(auth.context.membership.role);
  if (ownerError) return ownerError;

  const parsed = recipeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  if (data.saleProductId === data.ingredientProductId) {
    return NextResponse.json({ error: "SAME_PRODUCT_NOT_ALLOWED" }, { status: 409 });
  }

  const products = await db.product.findMany({
    where: { businessId: auth.context.business.id, id: { in: [data.saleProductId, data.ingredientProductId] }, active: true },
    select: { id: true, name: true, unit: true },
  });
  if (products.length !== 2) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  const ingredient = products.find((item) => item.id === data.ingredientProductId)!;

  try {
    convertRecipeQuantity(data.quantity, data.unit, ingredient.unit);
  } catch {
    return NextResponse.json({ error: "INCOMPATIBLE_RECIPE_UNITS", ingredientUnit: ingredient.unit }, { status: 409 });
  }

  const note = JSON.stringify({ unit: data.unit, canRemove: data.canRemove, canExtra: data.canExtra });
  const existing = await db.inventoryAuditEvent.findFirst({
    where: {
      businessId: auth.context.business.id,
      action: "RECIPE_COMPONENT",
      listingId: data.saleProductId,
      orderId: data.ingredientProductId,
    },
  });

  const component = existing
    ? await db.inventoryAuditEvent.update({
        where: { id: existing.id },
        data: {
          itemName: ingredient.name,
          quantity: data.quantity,
          previousQuantity: data.extraPrice,
          newQuantity: data.yieldPercent,
          note,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
          occurredAt: new Date(),
        },
      })
    : await db.inventoryAuditEvent.create({
        data: {
          businessId: auth.context.business.id,
          action: "RECIPE_COMPONENT",
          listingId: data.saleProductId,
          orderId: data.ingredientProductId,
          itemName: ingredient.name,
          quantity: data.quantity,
          previousQuantity: data.extraPrice,
          newQuantity: data.yieldPercent,
          note,
          actorUserId: auth.context.user.id,
          actorName: auth.context.user.name,
          actorRole: auth.context.membership.role,
        },
      });

  await db.inventoryAuditEvent.create({
    data: {
      businessId: auth.context.business.id,
      action: "RECIPE_CHANGE",
      listingId: data.saleProductId,
      orderId: data.ingredientProductId,
      itemName: ingredient.name,
      quantity: data.quantity,
      actorUserId: auth.context.user.id,
      actorName: auth.context.user.name,
      actorRole: auth.context.membership.role,
      note: `حفظ مكوّن وصفة: ${data.quantity} ${data.unit} · فاقد التحضير ${100 - data.yieldPercent}%`,
    },
  });

  return NextResponse.json({ component });
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const ownerError = requireOwner(auth.context.membership.role);
  if (ownerError) return ownerError;

  const url = new URL(request.url);
  const saleProductId = url.searchParams.get("saleProductId") || "";
  const ingredientProductId = url.searchParams.get("ingredientProductId") || "";
  if (!saleProductId || !ingredientProductId) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const existing = await db.inventoryAuditEvent.findFirst({
    where: {
      businessId: auth.context.business.id,
      action: "RECIPE_COMPONENT",
      listingId: saleProductId,
      orderId: ingredientProductId,
    },
  });
  if (!existing) return NextResponse.json({ error: "RECIPE_COMPONENT_NOT_FOUND" }, { status: 404 });

  await db.$transaction([
    db.inventoryAuditEvent.delete({ where: { id: existing.id } }),
    db.inventoryAuditEvent.create({
      data: {
        businessId: auth.context.business.id,
        action: "RECIPE_CHANGE",
        listingId: saleProductId,
        orderId: ingredientProductId,
        itemName: existing.itemName,
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        note: "حذف مكوّن من الوصفة",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
