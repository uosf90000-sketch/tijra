import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { memberships: { include: { business: true } } },
  });

  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const membership = user.memberships[0];
  if (!membership) return NextResponse.json({ error: "NO_BUSINESS_ACCESS" }, { status: 403 });

  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    role: membership.role,
    business: membership.business,
  });
}
