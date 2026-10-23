import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { modelOptions, scaleOptions } from "@/lib/workspace-profile";

const schema = z.object({
  name: z.string().trim().min(2).max(140),
  city: z.string().trim().max(100).optional(),
  businessType: z.enum(["RETAILER", "SUPPLIER", "BOTH"]).default("RETAILER"),
  businessActivity: z.enum([
    "GROCERY", "ELECTRONICS", "PHARMACY", "RESTAURANT", "CAFE",
    "FASHION", "BEAUTY", "HARDWARE", "OFFICE", "OTHER",
  ]).default("OTHER"),
  businessScale: z.enum(scaleOptions.map((item) => item.value) as ["MICRO", "SMALL", "MEDIUM", "ENTERPRISE"]),
  operatingModel: z.enum(modelOptions.map((item) => item.value) as [
    "FOOD_TRUCK", "SHOP", "RESTAURANT", "WHOLESALE", "SERVICES", "MANUFACTURING", "LOGISTICS", "MIXED",
  ]),
});

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const memberships = await db.membership.findMany({
    where: { userId: context.user.id },
    include: { business: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({
    activeBusinessId: context.business.id,
    businesses: memberships.map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      businessScale: membership.business.businessScale,
      operatingModel: membership.business.operatingModel,
      role: membership.role,
      organizationId: membership.business.organizationId,
    })),
  });
}

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_COMPANY" }, { status: 400 });

  try {
    const created = await db.$transaction(async (tx) => {
      const source = await tx.business.findUnique({
        where: { id: context.business.id }, select: { id: true, name: true, organizationId: true },
      });
      if (!source) throw new Error("BUSINESS_NOT_FOUND");
      let organizationId = source.organizationId;
      if (!organizationId) {
        const organization = await tx.organization.create({ data: { name: source.name } });
        organizationId = organization.id;
        await tx.business.update({ where: { id: source.id }, data: { organizationId } });
      }
      const newBusiness = await tx.business.create({
        data: {
          name: parsed.data.name, commercialName: parsed.data.name,
          city: parsed.data.city || null,
          businessType: parsed.data.businessType,
          businessActivity: parsed.data.businessActivity,
          businessScale: parsed.data.businessScale,
          operatingModel: parsed.data.operatingModel,
          purchaseApprovalEnabled: parsed.data.businessScale === "ENTERPRISE",
          payrollDualApprovalEnabled: parsed.data.businessScale === "ENTERPRISE",
          stockReasonRequired: parsed.data.businessScale === "ENTERPRISE",
          cashierMaxDiscountPercent: parsed.data.businessScale === "ENTERPRISE" ? 0 : 100,
          organizationId,
        },
      });
      await tx.membership.create({
        data: { userId: context.user.id, businessId: newBusiness.id, role: "OWNER" },
      });
      await tx.session.update({
        where: { id: context.sessionId },
        data: { activeBusinessId: newBusiness.id },
      });
      return { id: newBusiness.id, name: newBusiness.name, organizationId };
    });
    return NextResponse.json({ business: created, activeBusinessId: created.id }, { status: 201 });
  } catch (error) {
    console.error("Company creation failed", error);
    return NextResponse.json({ error: "CREATE_COMPANY_FAILED" }, { status: 500 });
  }
}
