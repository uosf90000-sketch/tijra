import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { locationAuthorized } from "@/lib/location-access";
import { db } from "@/lib/db";
import { nextServiceJobStatus } from "@/lib/service-workflows";

const schema = z.object({
  action: z.enum(["ASSIGN", "START", "COMPLETE", "CANCEL"]),
  assignedEmployeeId: z.string().min(1).optional(),
  note: z.string().trim().max(1000).default(""),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const role = context.membership.role;
  if (!["OWNER","MANAGER","STAFF"].includes(role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (role !== "STAFF" && !(await hasBusinessWideRead(context)))
    return NextResponse.json({ error: "BRANCH_SCOPED_REPORT_UNAVAILABLE" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_SERVICE_ACTION", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const businessId = context.business.id;
  try {
    const outcome = await db.$transaction(async (tx) => {
      // A row lock serializes all staff/manager updates to the same service order.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ServiceJob"
        WHERE "id" = ${id} AND "businessId" = ${businessId}
        FOR UPDATE
      `;
      if (!locked.length) throw new Error("SERVICE_JOB_NOT_FOUND");
      const job = await tx.serviceJob.findFirst({
        where: { id, businessId },
        include: { assignedEmployee: { select: { userId: true } } },
      });
      if (!job) throw new Error("SERVICE_JOB_NOT_FOUND");
      if (context.business.locationAccessEnforced && role !== "OWNER") {
        if (!job.locationId || !(await locationAuthorized(context, job.locationId)))
          throw new Error("LOCATION_ACCESS_DENIED");
      }
      const isAssignedTechnician = role === "STAFF" && job.assignedEmployee?.userId === context.user.id;
      const next = nextServiceJobStatus({
        status: job.status, action: parsed.data.action, role,
        isAssignedTechnician, assignedEmployeeId: job.assignedEmployeeId,
        note: parsed.data.note, targetEmployeeId: parsed.data.assignedEmployeeId,
      });
      let newEmployee = job.assignedEmployeeId;
      if (parsed.data.action === "ASSIGN") {
        const employee = await tx.employee.findFirst({
          where: { id: parsed.data.assignedEmployeeId!, businessId, active: true },
          select: { id: true },
        });
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
        newEmployee = employee.id;
      }
      const changed = await tx.serviceJob.updateMany({
        where: { id, businessId, status: job.status, assignedEmployeeId: job.assignedEmployeeId },
        data: {
          status: next, assignedEmployeeId: newEmployee, updatedByUserId: context.user.id,
          ...(next === "COMPLETED" ? { completedAt: new Date(), completionNote: parsed.data.note } :
            next === "CANCELLED" ? { completionNote: parsed.data.note } : {}),
        },
      });
      if (changed.count !== 1) throw new Error("SERVICE_JOB_CONFLICT");
      if (next === "COMPLETED" || next === "CANCELLED") {
        await tx.businessCommitment.updateMany({
          where: { businessId, kind: "SERVICE_COMPLETION", sourceId: job.id, status: "OPEN" },
          data: {
            status: next === "COMPLETED" ? "FULFILLED" : "CANCELLED",
            fulfilledAt: next === "COMPLETED" ? new Date() : null,
            evidenceNote: parsed.data.note, updatedByUserId: context.user.id,
          },
        });
      }
      await tx.inventoryAuditEvent.create({ data: {
        businessId, action: "SERVICE_JOB_" + parsed.data.action,
        orderId: job.id, itemName: job.title, actorUserId: context.user.id,
        actorName: context.user.name, actorRole: role,
        note: JSON.stringify({
          from: job.status, to: next, assignedEmployeeId: newEmployee,
          note: parsed.data.note || null, externallyVerified: false, locationId: job.locationId,
        }),
      } });
      return { id: job.id, status: next, assignedEmployeeId: newEmployee };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ job: outcome, externallyVerified: false });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVICE_ACTION_FAILED";
    if (code === "SERVICE_JOB_NOT_FOUND" || code === "EMPLOYEE_NOT_FOUND")
      return NextResponse.json({ error: code }, { status: 404 });
    if (code === "SERVICE_ACCESS_DENIED" || code === "SERVICE_CANCEL_DENIED" ||
        code === "SERVICE_ASSIGN_DENIED" || code === "LOCATION_ACCESS_DENIED")
      return NextResponse.json({ error: code }, { status: 403 });
    if (code.startsWith("SERVICE_") || error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002","P2034"].includes(error.code))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Service job action failed", error);
    return NextResponse.json({ error: "SERVICE_ACTION_FAILED" }, { status: 500 });
  }
}
