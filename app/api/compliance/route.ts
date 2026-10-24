import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";

const types = z.enum([
  "COMMERCIAL_REGISTRATION", "MUNICIPAL_LICENSE", "FOOD_TRUCK_PERMIT",
  "VAT_CERTIFICATE", "INSURANCE", "SUPPLIER_LICENSE", "OTHER",
]);
const schema = z.object({
  documentType: types,
  title: z.string().trim().min(3).max(180),
  supplierId: z.string().min(1).optional(),
  reference: z.string().trim().max(100).optional(),
  expiresAt: z.coerce.date(),
  note: z.string().trim().max(800).optional(),
}).strict();
const reviewSchema = z.object({
  documentId: z.string().min(1),
  reason: z.string().trim().min(8).max(500),
}).strict();

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const documents = await db.complianceDocument.findMany({
    where: { businessId: context.business.id },
    include: { supplier: { select: { name: true } } },
    orderBy: { expiresAt: "asc" }, take: 300,
  });
  return NextResponse.json({ documents, externallyVerified: false });
}

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DOCUMENT" }, { status: 400 });
  if (parsed.data.supplierId) {
    const supplier = await db.supplier.findFirst({
      where: { businessId: context.business.id, id: parsed.data.supplierId },
      select: { id: true },
    });
    if (!supplier) return NextResponse.json({ error: "SUPPLIER_NOT_FOUND" }, { status: 404 });
  }
  const created = await db.$transaction(async (tx) => {
    const doc = await tx.complianceDocument.create({ data: {
      businessId: context.business.id,
      documentType: parsed.data.documentType,
      title: parsed.data.title, supplierId: parsed.data.supplierId || null,
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      expiresAt: parsed.data.expiresAt,
      createdByUserId: context.user.id,
    } });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "COMPLIANCE_DOCUMENT_RECORDED",
      actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role, orderId: doc.id, itemName: doc.title,
      note: JSON.stringify({ type: doc.documentType, expiresAt: doc.expiresAt,
        reviewStatus: "SELF_REPORTED", officiallyVerified: false }),
    } });
    return doc;
  });
  return NextResponse.json({ document: created }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await hasBusinessWideRead(context))) return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  if (context.membership.role !== "OWNER")
    return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REVIEW" }, { status: 400 });
  const result = await db.$transaction(async (tx) => {
    const changed = await tx.complianceDocument.updateMany({
      where: { id: parsed.data.documentId, businessId: context.business.id,
        reviewStatus: "SELF_REPORTED" },
      data: { reviewStatus: "INTERNALLY_REVIEWED",
        reviewedByUserId: context.user.id, reviewedAt: new Date() },
    });
    if (changed.count !== 1) return null;
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "COMPLIANCE_INTERNAL_REVIEW",
      actorUserId: context.user.id, actorName: context.user.name,
      actorRole: context.membership.role, orderId: parsed.data.documentId,
      note: JSON.stringify({ reason: parsed.data.reason, officialVerification: false }),
    } });
    return { id: parsed.data.documentId, reviewStatus: "INTERNALLY_REVIEWED" };
  });
  if (!result) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND_OR_REVIEWED" }, { status: 409 });
  return NextResponse.json({ document: result, officiallyVerified: false });
}
