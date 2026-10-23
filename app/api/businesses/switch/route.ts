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

  await db.session.update({
    where: { id: context.sessionId },
    data: { activeBusinessId: membership.businessId },
  });
  return NextResponse.json({ business: membership.business, role: membership.role });
}
