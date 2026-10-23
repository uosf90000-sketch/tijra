import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const count = await db.$transaction(async (tx) => {
    const result = await tx.session.deleteMany({
      where: { userId: context.user.id, id: { not: context.sessionId } },
    });
    await tx.inventoryAuditEvent.create({
      data: {
        businessId: context.business.id,
        action: "OTHER_SESSIONS_REVOKED",
        actorUserId: context.user.id,
        actorName: context.user.name,
        actorRole: context.membership.role,
        note: "إنهاء " + result.count + " جلسة أخرى للمستخدم نفسه",
      },
    });
    return result.count;
  });
  return NextResponse.json({ revokedSessions: count });
}
