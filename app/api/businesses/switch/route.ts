import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ businessId: z.string().trim().min(8).max(120) });

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BUSINESS" }, { status: 400 });
  const membership = await db.membership.findUnique({
    where: { userId_businessId: { userId: context.user.id, businessId: parsed.data.businessId } },
    include: { business: { select: { id: true, name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP_FOR_COMPANY" }, { status: 403 });

  await db.$transaction(async (tx) => {
    // The membership was verified above. Update the current session, not all
    // sessions, and add traceability in the destination company's audit log.
    const currentMembership = await tx.membership.findUnique({
      where: { userId_businessId: { userId: context.user.id, businessId: membership.businessId } },
    });
    if (!currentMembership) throw new Error("NO_MEMBERSHIP_FOR_COMPANY");
    await tx.session.update({
      where: { id: context.sessionId },
      data: { activeBusinessId: currentMembership.businessId },
    });
    await tx.inventoryAuditEvent.create({
      data: {
        businessId: currentMembership.businessId,
        action: "COMPANY_SWITCH",
        actorUserId: context.user.id,
        actorName: context.user.name,
        actorRole: currentMembership.role,
        note: "تبديل المنشأة النشطة من " + context.business.id,
      },
    });
  });
  return NextResponse.json({ business: membership.business, role: membership.role });
}
