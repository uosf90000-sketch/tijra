import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { accessibleLocations, locationAuthorized } from "@/lib/location-access";
import { ensureDefaultLocation, listInventoryLocations } from "@/lib/commerce-ops";

const jobSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(1500).optional(),
  customerId: z.string().min(1).optional(),
  assignedEmployeeId: z.string().min(1).optional(),
  scheduledAt: z.coerce.date(),
  quotedAmount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).optional(),
  clientRequestId: z.string().uuid().optional(),
  locationId: z.string().min(1).optional(),
}).strict();

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const role = context.membership.role;
  if (!["OWNER","MANAGER","ACCOUNTANT","STAFF"].includes(role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (role !== "STAFF" && !(await hasBusinessWideRead(context)))
    return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  let assignedEmployeeId: string | undefined;
  let locationIds: string[] | undefined;
  if (role === "STAFF") {
    const employee = await db.employee.findFirst({
      where: { businessId: context.business.id, userId: context.user.id, active: true },
      select: { id: true },
    });
    if (!employee) return NextResponse.json({ jobs: [], limitedTo: 200 });
    assignedEmployeeId = employee.id;
    if (context.business.locationAccessEnforced) {
      locationIds = (await accessibleLocations(context)).filter(loc => loc.active).map(loc => loc.id);
      if (!locationIds.length) return NextResponse.json({ jobs: [], limitedTo: 200 });
    }
  }
  const jobs = await db.serviceJob.findMany({
    where: {
      businessId: context.business.id,
      ...(assignedEmployeeId ? { assignedEmployeeId } : {}),
      ...(locationIds ? { locationId: { in: locationIds } } : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      assignedEmployee: { select: { id: true, name: true, userId: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ jobs, limitedTo: 200, externallyVerified: false });
}

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["OWNER","MANAGER"].includes(context.membership.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await hasBusinessWideRead(context)))
    return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = jobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SERVICE_JOB", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const requestHash = data.clientRequestId
    ? createHash("sha256").update(JSON.stringify([
        data.title, data.description || null, data.customerId || null,
        data.assignedEmployeeId || null, data.scheduledAt.toISOString(),
        data.quotedAmount || null, data.locationId || null,
      ])).digest("hex")
    : null;
  if (data.scheduledAt.getTime() < Date.now() - 60_000)
    return NextResponse.json({ error: "SERVICE_DATE_MUST_BE_FUTURE" }, { status: 400 });
  const businessId = context.business.id;
  const defaultLocation = await ensureDefaultLocation(businessId);
  const locationId = data.locationId || defaultLocation.id;
  const locations = await listInventoryLocations(businessId);
  if (!locations.some(loc => loc.active && loc.id === locationId))
    return NextResponse.json({ error: "LOCATION_NOT_FOUND" }, { status: 404 });
  if (!(await locationAuthorized(context, locationId)))
    return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });
  try {
    const result = await db.$transaction(async (tx) => {
      if (data.clientRequestId) {
        const existing = await tx.serviceJob.findUnique({
          where: { businessId_clientRequestId: { businessId, clientRequestId: data.clientRequestId } },
        });
        if (existing) {
          if (existing.clientRequestHash !== requestHash) throw new Error("SERVICE_IDEMPOTENCY_REUSE");
          return { job: existing, duplicate: true };
        }
      }
      if (data.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: data.customerId, businessId }, select: { id: true },
        });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      }
      if (data.assignedEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: { id: data.assignedEmployeeId, businessId, active: true }, select: { id: true },
        });
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
      }
      const job = await tx.serviceJob.create({
        data: {
          businessId, title: data.title, description: data.description || null,
          customerId: data.customerId || null, assignedEmployeeId: data.assignedEmployeeId || null,
          locationId, scheduledAt: data.scheduledAt, quotedAmount: data.quotedAmount || null,
          status: data.assignedEmployeeId ? "SCHEDULED" : "OPEN",
          createdByUserId: context.user.id,
          clientRequestId: data.clientRequestId || null, clientRequestHash: requestHash,
        },
      });
      await tx.businessCommitment.create({ data: {
        businessId, kind: "SERVICE_COMPLETION", sourceId: job.id,
        title: job.title, customerId: job.customerId, expectedAt: job.scheduledAt,
        expectedAmount: job.quotedAmount, createdByUserId: context.user.id,
      } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId, action: "SERVICE_JOB_CREATED", orderId: job.id, itemName: job.title,
        actorUserId: context.user.id, actorName: context.user.name,
        actorRole: context.membership.role,
        note: JSON.stringify({
          scheduledAt: job.scheduledAt, assignedEmployeeId: job.assignedEmployeeId,
          locationId, customerId: job.customerId, quotedAmount: job.quotedAmount,
          externalAttendanceVerified: false,
        }),
      } });
      return { job, duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ...result, externallyVerified: false }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVICE_CREATE_FAILED";
    if (code === "CUSTOMER_NOT_FOUND" || code === "EMPLOYEE_NOT_FOUND")
      return NextResponse.json({ error: code }, { status: 404 });
    if (code === "SERVICE_IDEMPOTENCY_REUSE")
      return NextResponse.json({ error: code }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && data.clientRequestId) {
      const existing = await db.serviceJob.findUnique({
        where: { businessId_clientRequestId: { businessId, clientRequestId: data.clientRequestId } },
      });
      if (existing && existing.clientRequestHash === requestHash)
        return NextResponse.json({ job: existing, duplicate: true, externallyVerified: false });
      return NextResponse.json({ error: "SERVICE_IDEMPOTENCY_REUSE" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      return NextResponse.json({ error: "SERVICE_CONCURRENT_CHANGE" }, { status: 409 });
    console.error("Service job creation failed", error);
    return NextResponse.json({ error: "SERVICE_CREATE_FAILED" }, { status: 500 });
  }
}
