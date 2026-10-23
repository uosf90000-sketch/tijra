import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa-recovery";
import {
  authenticatorUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, matchTotpStep,
} from "@/lib/totp";

const beginSchema = z.object({ password: z.string().min(1).max(128) });
const confirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const disableSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().trim().max(80).optional(),
}).refine((data) => Boolean(data.code || data.recoveryCode));

function allowedToEnroll() {
  // Fail closed unless a 32-byte random key has been explicitly configured.
  return Buffer.from(process.env.MFA_ENCRYPTION_KEY || "", "base64url").length === 32;
}

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = await db.user.findUniqueOrThrow({
    where: { id: context.user.id },
    select: { totpEnabledAt: true, totpPendingSecretEncrypted: true, mfaRecoveryCodes: { where: { usedAt: null }, select: { id: true } } },
  });
  return NextResponse.json({
    enabled: Boolean(user.totpEnabledAt),
    pending: Boolean(user.totpPendingSecretEncrypted),
    remainingRecoveryCodes: user.mfaRecoveryCodes.length,
    enrollmentAvailable: allowedToEnroll(),
  });
}

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!allowedToEnroll()) return NextResponse.json({ error: "MFA_NOT_CONFIGURED_BY_OPERATOR" }, { status: 503 });
  const parsed = beginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (user.totpSecretEncrypted) return NextResponse.json({ error: "MFA_ALREADY_ENABLED" }, { status: 409 });
  if (!user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: {
      totpPendingSecretEncrypted: encryptTotpSecret(secret),
      mfaFailedAttempts: 0, mfaLockedUntil: null,
    },
  });
  return NextResponse.json({
    secret, provisioningUri: authenticatorUri(user.email, secret),
    message: "Add the key to an authenticator, then confirm a 6-digit code.",
  });
}

export async function PATCH(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CODE" }, { status: 400 });

  try {
    const outcome = await db.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: context.user.id } });
      if (user.totpSecretEncrypted) throw new Error("MFA_ALREADY_ENABLED");
      if (!user.totpPendingSecretEncrypted) throw new Error("NO_PENDING_MFA_SETUP");
      if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) throw new Error("MFA_LOCKED");
      const verifiedStep = matchTotpStep(decryptTotpSecret(user.totpPendingSecretEncrypted), parsed.data.code);
      if (verifiedStep === null) {
        const failed = user.mfaFailedAttempts + 1;
        // Transactions that throw roll back; this mutation needs to commit.
        await tx.user.update({ where: { id: user.id }, data: {
          mfaFailedAttempts: failed,
          mfaLockedUntil: failed >= 5 ? new Date(Date.now() + 10 * 60_000) : null,
        } });
        return { ok: false as const };
      }
      const recoveryCodes = generateRecoveryCodes();
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map((code) => ({ userId: user.id, codeHash: hashRecoveryCode(code) })) });
      await tx.user.update({ where: { id: user.id }, data: {
        totpSecretEncrypted: user.totpPendingSecretEncrypted,
        totpPendingSecretEncrypted: null,
        totpEnabledAt: new Date(),
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
        mfaLastVerifiedStep: verifiedStep,
      } });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: context.business.id, action: "MFA_ENABLED",
        actorUserId: user.id, actorName: context.user.name,
        actorRole: context.membership.role,
        note: "Authenticator-based second factor enabled after a verified code",
      } });
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: context.sessionId } } });
      return { ok: true as const, recoveryCodes };
    });
    return outcome.ok ? NextResponse.json({ enabled: true, recoveryCodes: outcome.recoveryCodes })
      : NextResponse.json({ error: "INVALID_CODE" }, { status: 401 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MFA_CONFIRM_FAILED";
    if (["MFA_ALREADY_ENABLED", "NO_PENDING_MFA_SETUP"].includes(message))
      return NextResponse.json({ error: message }, { status: 409 });
    if (message === "MFA_LOCKED") return NextResponse.json({ error: message }, { status: 429 });
    console.error("MFA confirmation failed", error);
    return NextResponse.json({ error: "MFA_CONFIRM_FAILED" }, { status: 500 });
  }
}

const rotateSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().trim().max(80).optional(),
}).refine((value) => Boolean(value.code || value.recoveryCode));

export async function PUT(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = rotateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (!user.totpSecretEncrypted) return NextResponse.json({ error: "MFA_NOT_ENABLED" }, { status: 409 });
  if (!user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash)))
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  if (user.mfaLockedUntil && user.mfaLockedUntil > new Date())
    return NextResponse.json({ error: "MFA_LOCKED" }, { status: 429 });

  const step = parsed.data.code
    ? matchTotpStep(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.code) : null;
  let recoveryHash: string | null = null;
  if (parsed.data.recoveryCode) {
    try { recoveryHash = hashRecoveryCode(parsed.data.recoveryCode); } catch { recoveryHash = null; }
  }
  if (step === null && recoveryHash === null)
    return NextResponse.json({ error: "INVALID_CODE" }, { status: 401 });

  const recoveryCodes = generateRecoveryCodes();
  try {
    await db.$transaction(async (tx) => {
      if (step !== null) {
        const accepted = await tx.user.updateMany({
          where: { id: user.id, OR: [
            { mfaLastVerifiedStep: null }, { mfaLastVerifiedStep: { lt: step } },
          ] },
          data: { mfaLastVerifiedStep: step },
        });
        if (accepted.count !== 1) throw new Error("MFA_CODE_ALREADY_USED");
      } else {
        const used = await tx.mfaRecoveryCode.updateMany({
          where: { userId: user.id, codeHash: recoveryHash!, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (used.count !== 1) throw new Error("RECOVERY_CODE_INVALID_OR_USED");
      }
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ userId: user.id, codeHash: hashRecoveryCode(code) })),
      });
      await tx.inventoryAuditEvent.create({ data: {
        businessId: context.business.id, action: "MFA_RECOVERY_ROTATED",
        actorUserId: user.id, actorName: context.user.name,
        actorRole: context.membership.role,
        note: "All prior MFA backup codes revoked and replaced after password + second-factor validation",
      } });
    });
    return NextResponse.json({ recoveryCodes });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["MFA_CODE_ALREADY_USED", "RECOVERY_CODE_INVALID_OR_USED"].includes(code))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("Recovery code rotation failed", error);
    return NextResponse.json({ error: "RECOVERY_ROTATION_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = disableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const user = await db.user.findUniqueOrThrow({ where: { id: context.user.id } });
  if (!user.totpSecretEncrypted) return NextResponse.json({ error: "MFA_NOT_ENABLED" }, { status: 409 });
  if (!user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  const step = parsed.data.code
    ? matchTotpStep(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.code) : null;
  let recoveryHash: string | null = null;
  if (parsed.data.recoveryCode) {
    try { recoveryHash = hashRecoveryCode(parsed.data.recoveryCode); } catch { recoveryHash = null; }
  }
  if (step === null && recoveryHash === null)
    return NextResponse.json({ error: "INVALID_CODE" }, { status: 401 });

  try {
    await db.$transaction(async (tx) => {
      if (step !== null) {
        const consumed = await tx.user.updateMany({
          where: { id: user.id, OR: [
            { mfaLastVerifiedStep: null },
            { mfaLastVerifiedStep: { lt: step } },
          ] },
          data: { mfaLastVerifiedStep: step },
        });
        if (consumed.count !== 1) throw new Error("MFA_CODE_ALREADY_USED");
      } else {
        const consumed = await tx.mfaRecoveryCode.updateMany({
          where: { userId: user.id, codeHash: recoveryHash!, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw new Error("RECOVERY_CODE_INVALID_OR_USED");
      }
      await tx.user.update({ where: { id: user.id }, data: {
        totpSecretEncrypted: null, totpPendingSecretEncrypted: null,
        totpEnabledAt: null, mfaFailedAttempts: 0, mfaLockedUntil: null, mfaLastVerifiedStep: null,
      } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id, id: { not: context.sessionId } } });
    await tx.inventoryAuditEvent.create({ data: {
      businessId: context.business.id, action: "MFA_DISABLED",
      actorUserId: user.id, actorName: context.user.name,
      actorRole: context.membership.role,
      note: "Authenticator second factor disabled with password and current TOTP code",
    } });
    });
    return NextResponse.json({ enabled: false });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["MFA_CODE_ALREADY_USED", "RECOVERY_CODE_INVALID_OR_USED"].includes(code))
      return NextResponse.json({ error: code }, { status: 409 });
    console.error("MFA disable failed", error);
    return NextResponse.json({ error: "MFA_DISABLE_FAILED" }, { status: 500 });
  }
}
