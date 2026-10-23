import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAILURES = 8;

export function loginIdentityHash(email: string) {
  return createHash("sha256")
    .update("tijra-auth-login-v1:" + email.trim().toLowerCase())
    .digest("hex");
}

export function nextLoginThrottle(
  previous: { failedCount: number; windowStartedAt: Date; lockedUntil: Date | null } | null,
  at: Date,
) {
  if (previous?.lockedUntil && previous.lockedUntil > at) {
    return { failedCount: previous.failedCount, windowStartedAt: previous.windowStartedAt, lockedUntil: previous.lockedUntil };
  }
  const restart = !previous || at.getTime() - previous.windowStartedAt.getTime() >= WINDOW_MS;
  const failedCount = restart ? 1 : previous.failedCount + 1;
  return {
    failedCount,
    windowStartedAt: restart ? at : previous!.windowStartedAt,
    lockedUntil: failedCount >= MAX_FAILURES ? new Date(at.getTime() + LOCK_MS) : null,
  };
}

export async function isLoginThrottled(email: string): Promise<boolean> {
  const row = await db.authLoginThrottle.findUnique({
    where: { identityHash: loginIdentityHash(email) },
    select: { lockedUntil: true },
  });
  return Boolean(row?.lockedUntil && row.lockedUntil > new Date());
}

export async function registerFailedLogin(email: string): Promise<boolean> {
  const identityHash = loginIdentityHash(email);
  try {
    return await db.$transaction(async (tx) => {
      const previous = await tx.authLoginThrottle.findUnique({ where: { identityHash } });
      const next = nextLoginThrottle(previous, new Date());
      await tx.authLoginThrottle.upsert({
        where: { identityHash },
        create: { identityHash, ...next },
        update: next,
      });
      return Boolean(next.lockedUntil && next.lockedUntil > new Date());
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    // A simultaneous burst may trigger a serializable conflict. Never allow it
    // to bypass rate limiting; ask the client to try later.
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")) return true;
    throw error;
  }
}

export async function clearFailedLogins(email: string) {
  await db.authLoginThrottle.deleteMany({ where: { identityHash: loginIdentityHash(email) } });
}
