import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

import { loginIdentityHash, nextLoginThrottle } from "@/lib/login-throttle-policy";
export { loginIdentityHash, nextLoginThrottle } from "@/lib/login-throttle-policy";

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
