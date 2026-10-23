import { createHash, randomBytes } from "node:crypto";

const length = 32;
const allowed = /^[A-F0-9]{32}$/;

/**
 * Each code holds 128 unpredictable bits, so SHA-256 storage is not
 * susceptible to realistic offline dictionary attacks. Codes are one-time only.
 */
export function normalizeRecoveryCode(input: string): string {
  const text = input.replace(/[\s-]/g, "").toUpperCase();
  if (!allowed.test(text)) throw new Error("INVALID_RECOVERY_CODE_FORMAT");
  return text;
}

export function hashRecoveryCode(input: string): string {
  const normalized = normalizeRecoveryCode(input);
  return createHash("sha256").update("tijra-mfa-recovery-v1:" + normalized).digest("hex");
}

export function generateRecoveryCodes(count = 10) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new Error("INVALID_RECOVERY_COUNT");
  return Array.from({ length: count }, () => {
    const raw = randomBytes(length / 2).toString("hex").toUpperCase();
    return raw.match(/.{1,4}/g)!.join("-");
  });
}
