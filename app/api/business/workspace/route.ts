import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { moduleKeys, modelOptions, scaleOptions, resolveWorkspaceModules } from "@/lib/workspace-profile";

const moduleSchema = z.enum(moduleKeys as [string, ...string[]]);
const updateSchema = z.object({
  businessScale: z.enum(scaleOptions.map((item) => item.value) as ["MICRO", "SMALL", "MEDIUM", "ENTERPRISE"]),
  operatingModel: z.enum(modelOptions.map((item) => item.value) as [
    "FOOD_TRUCK", "SHOP", "RESTAURANT", "WHOLESALE", "SERVICES", "MANUFACTURING", "LOGISTICS", "MIXED",
  ]),
  workspaceModules: z.array(moduleSchema).max(moduleKeys.length),
});

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const business = context.business;
  return NextResponse.json({
    businessId: business.id,
    businessScale: business.businessScale,
    operatingModel: business.operatingModel,
    workspaceModules: business.workspaceModules,
    effectiveModules: resolveWorkspaceModules(business.businessScale, business.operatingModel, business.workspaceModules),
  });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400 });
  const updated = await db.$transaction(async (tx) => {
    const before = await tx.business.findUniqueOrThrow({
      where: { id: context.business.id },
      select: { businessScale: true, operatingModel: true, workspaceModules: true },
    });
    const business = await tx.business.update({
      where: { id: context.business.id },
      data: {
        businessScale: parsed.data.businessScale,
        operatingModel: parsed.data.operatingModel,
        workspaceModules: [...new Set(parsed.data.workspaceModules)],
      },
      select: { id: true, businessScale: true, operatingModel: true, workspaceModules: true },
    });
    await tx.inventoryAuditEvent.create({
      data: {
        businessId: context.business.id,
        action: "WORKSPACE_PROFILE_UPDATED",
        actorUserId: context.user.id,
        actorName: context.user.name,
        actorRole: context.membership.role,
        note: JSON.stringify({
          previous: before,
          current: {
            businessScale: business.businessScale,
            operatingModel: business.operatingModel,
            workspaceModules: business.workspaceModules,
          },
        }),
      },
    });
    return business;
  });
  return NextResponse.json({
    profile: updated,
    effectiveModules: resolveWorkspaceModules(updated.businessScale, updated.operatingModel, updated.workspaceModules),
  });
}
