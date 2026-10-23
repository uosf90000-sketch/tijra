import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashRecoveryCode } from "@/lib/mfa-recovery";
import { decryptTotpSecret, matchTotpStep } from "@/lib/totp";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().trim().max(80).optional(),
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
    if (!parsed.data.totpCode && !parsed.data.recoveryCode) {
      return NextResponse.json({ error: "MFA_REQUIRED" }, { status: 401 });
    }
    let step: number | null = null;
    let recoveryAccepted = false;
    if (parsed.data.recoveryCode) {
      // Consume one recovery code atomically, even for simultaneous requests.
      try {
        const codeHash = hashRecoveryCode(parsed.data.recoveryCode);
        recoveryAccepted = await db.$transaction(async (tx) => {
          const consumed = await tx.mfaRecoveryCode.updateMany({
            where: { userId: user.id, codeHash, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (consumed.count !== 1) return false;
          const membership = user.memberships[0];
          if (!membership) throw new Error("NO_BUSINESS_ACCESS");
          await tx.user.update({ where: { id: user.id }, data: { mfaFailedAttempts: 0, mfaLockedUntil: null } });
          await tx.inventoryAuditEvent.create({ data: {
            businessId: membership.businessId, action: "MFA_RECOVERY_LOGIN",
            actorUserId: user.id, actorName: user.name, actorRole: membership.role,
            note: "A single-use MFA recovery code was consumed during login",
          } });
          return true;
        });
      } catch (error) {
        if (error instanceof Error && error.message === "NO_BUSINESS_ACCESS")
          return NextResponse.json({ error: "NO_BUSINESS_ACCESS" }, { status: 403 });
        recoveryAccepted = false;
      }
    } else if (parsed.data.totpCode) {
      step = matchTotpStep(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.totpCode);
    }
    if (!recoveryAccepted && step === null) {
      const attempts = user.mfaLockedUntil && user.mfaLockedUntil.getTime() <= Date.now()
        ? 1 : user.mfaFailedAttempts + 1;
      await db.user.update({ where: { id: user.id }, data: {
        mfaFailedAttempts: attempts,
        mfaLockedUntil: attempts >= 5 ? new Date(Date.now() + 10 * 60_000) : null,
      } });
      return NextResponse.json({ error: "INVALID_MFA_CODE" }, { status: attempts >= 5 ? 429 : 401 });
    }
    // Atomically consume the OTP step to prevent replay, even with parallel login requests.
    const accepted = recoveryAccepted ? { count: 1 } : await db.user.updateMany({
      where: {
        id: user.id,
        OR: [{ mfaLastVerifiedStep: null }, { mfaLastVerifiedStep: { lt: step! } }],
      },
      data: { mfaLastVerifiedStep: step!, mfaFailedAttempts: 0, mfaLockedUntil: null },
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
