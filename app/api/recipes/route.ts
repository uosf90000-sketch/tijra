import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { isFoodActivity } from "@/lib/business-experience";
import { db } from "@/lib/db";
import { convertRecipeQuantity, decodeRecipeNote } from "@/lib/recipes";

const unitSchema = z.enum(["غرام", "كيلو", "مل", "لتر", "حبة", "قطعة", "شريحة", "رغيف"]);

const recipeSchema = z.object({
  saleProductId: z.string().min(1),
  ingredientProductId: z.string().min(1).optional(),
  ingredientName: z.string().trim().min(2).max(160).optional(),
  quantity: z.coerce.number().positive().max(1000000),
  unit: unitSchema,
  canRemove: z.boolean().default(false),
  canExtra: z.boolean().default(false),
  replacesComponentId: z.string().min(1).optional(),
  extraPrice: z.coerce.number().nonnegative().max(100000).default(0),
  yieldPercent: z.coerce.number().min(1).max(100).default(100),
}).refine((value) => Boolean(value.ingredientProductId || value.ingredientName), { message: "INGREDIENT_REQUIRED" })
  .refine((value) => !value.replacesComponentId || value.canExtra, { message: "ALTERNATIVE_MUST_BE_OPTIONAL" });

function requireOwner(role: string) {
  return role === "OWNER" ? null : NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
}

function requireFoodActivity(activity: string) {
  return isFoodActivity(activity) ? null : NextResponse.json({ error: "RECIPES_NOT_AVAILABLE_FOR_ACTIVITY" }, { status: 403 });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const ownerError = requireOwner(auth.context.membership.role);
  if (ownerError) return ownerError;
  const activityError = requireFoodActivity(auth.context.business.businessActivity);
  if (activityError) return activityError;

  const parsed = recipeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  const saleProduct = await db.product.findFirst({
    where: { businessId: auth.context.business.id, id: data.saleProductId, active: true },
    select: { id: true },
  });
  if (!saleProduct) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  let replacementTarget: { id: string; note: string | null } | null = null;
  if (data.replacesComponentId) {
    replacementTarget = await db.inventoryAuditEvent.findFirst({
      where: {
        id: data.replacesComponentId,
        businessId: auth.context.business.id,
        action: "RECIPE_COMPONENT",
        listingId: data.saleProductId,
      },
      select: { id: true, note: true },
    });
    if (!replacementTarget || decodeRecipeNote(replacementTarget.note).extraOnly) {
      return NextResponse.json({ error: "REPLACEMENT_TARGET_NOT_FOUND" }, { status: 404 });
    }
  }

  let ingredient = data.ingredientProductId
    ? await db.product.findFirst({
        where: { businessId: auth.context.business.id, id: data.ingredientProductId, active: true },
        select: { id: true, name: true, unit: true },
      })
    : null;

  if (!ingredient && data.ingredientName) {
    ingredient = await db.product.findFirst({
      where: { businessId: auth.context.business.id, name: { equals: data.ingredientName, mode: "insensitive" }, active: true },
      select: { id: true, name: true, unit: true },
    });
  }

  if (!ingredient && data.ingredientName) {
    ingredient = await db.product.create({
      data: {
        businessId: auth.context.business.id,
        name: data.ingredientName,
        category: "مكوّن",
        unit: data.unit,
        salePrice: 0,
        averageCost: 0,
        quantity: 0,
        reorderPoint: 0,
        targetCoverageDays: 7,
      },
      select: { id: true, name: true, unit: true },
    });
  }

  if (!ingredient) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  if (saleProduct.id === ingredient.id) return NextResponse.json({ error: "SAME_PRODUCT_NOT_ALLOWED" }, { status: 409 });

  try {
    convertRecipeQuantity(data.quantity, data.unit, ingredient.unit);
  } catch {
    return NextResponse.json({ error: "INCOMPATIBLE_RECIPE_UNITS", ingredientUnit: ingredient.unit }, { status: 409 });
  }

  const extraOnly = data.canExtra;
  const note = JSON.stringify({
    unit: data.unit,
    canRemove: extraOnly ? true : data.canRemove,
    canExtra: data.canExtra,
    extraOnly,
    replacesComponentId: data.replacesComponentId || null,
  });
  const existing = await db.inventoryAuditEvent.findFirst({
    where: {
      businessId: auth.context.business.id,
      action: "RECIPE_COMPONENT",
      listingId: data.saleProductId,
      orderId: ingredient.id,
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
          orderId: ingredient.id,
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

  if (replacementTarget) {
    const targetConfig = decodeRecipeNote(replacementTarget.note);
    await db.inventoryAuditEvent.update({
      where: { id: replacementTarget.id },
      data: {
        note: JSON.stringify({
          unit: targetConfig.unit,
          canRemove: true,
          canExtra: targetConfig.canExtra,
          extraOnly: targetConfig.extraOnly,
          replacesComponentId: targetConfig.replacesComponentId,
        }),
        actorUserId: auth.context.user.id,
        actorName: auth.context.user.name,
        actorRole: auth.context.membership.role,
        occurredAt: new Date(),
      },
    });
  }

  await db.inventoryAuditEvent.create({
    data: {
      businessId: auth.context.business.id,
      action: "RECIPE_CHANGE",
      listingId: data.saleProductId,
      orderId: ingredient.id,
      itemName: ingredient.name,
      quantity: data.quantity,
      actorUserId: auth.context.user.id,
      actorName: auth.context.user.name,
      actorRole: auth.context.membership.role,
      note: replacementTarget
        ? `حفظ بديل: ${ingredient.name} +${data.extraPrice} ر.س`
        : extraOnly
          ? `حفظ إضافة اختيارية: ${ingredient.name} +${data.extraPrice} ر.س`
          : `حفظ مكوّن: ${data.quantity} ${data.unit}`,
    },
  });

  return NextResponse.json({ component, ingredient });
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  const ownerError = requireOwner(auth.context.membership.role);
  if (ownerError) return ownerError;
  const activityError = requireFoodActivity(auth.context.business.businessActivity);
  if (activityError) return activityError;

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
