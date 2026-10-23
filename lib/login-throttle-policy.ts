import { createHash } from "node:crypto";

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
