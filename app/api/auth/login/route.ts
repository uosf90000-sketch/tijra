import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptTotpSecret, matchTotpStep } from "@/lib/totp";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
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

  if (user.totpSecretEncrypted) {
    if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) {
      return NextResponse.json({ error: "MFA_LOCKED" }, { status: 429 });
    }
    if (!parsed.data.totpCode) {
      return NextResponse.json({ error: "MFA_REQUIRED" }, { status: 401 });
    }
    const step = matchTotpStep(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.totpCode);
    if (step === null) {
      const attempts = user.mfaLockedUntil && user.mfaLockedUntil.getTime() <= Date.now()
        ? 1 : user.mfaFailedAttempts + 1;
      await db.user.update({ where: { id: user.id }, data: {
        mfaFailedAttempts: attempts,
        mfaLockedUntil: attempts >= 5 ? new Date(Date.now() + 10 * 60_000) : null,
      } });
      return NextResponse.json({ error: "INVALID_MFA_CODE" }, { status: attempts >= 5 ? 429 : 401 });
    }
    // Atomically consume the OTP step to prevent replay, even with parallel login requests.
    const accepted = await db.user.updateMany({
      where: {
        id: user.id,
        OR: [{ mfaLastVerifiedStep: null }, { mfaLastVerifiedStep: { lt: step } }],
      },
      data: { mfaLastVerifiedStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null },
    });
    if (accepted.count !== 1) {
      return NextResponse.json({ error: "MFA_CODE_ALREADY_USED" }, { status: 409 });
    }
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
