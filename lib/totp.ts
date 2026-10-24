import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP, 30-second step, HMAC-SHA1 for authenticator compatibility.
 * Secret is encrypted at rest; MFA_ENCRYPTION_KEY is 32 random bytes base64url.
 * No fallback key; absent/invalid key disables enrollment and blocks protected sign-in.
 */
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function secretKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new Error("MFA_ENCRYPTION_KEY_UNAVAILABLE");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY_INVALID");
  return key;
}

export function base32Encode(data: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const text = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of text) {
    const pos = alphabet.indexOf(char);
    if (pos < 0) throw new Error("INVALID_TOTP_SECRET");
    value = (value << 5) | pos;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits -= 8)) & 255); }
  }
  return Buffer.from(output);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptTotpSecret(encrypted: string): string {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("INVALID_MFA_SECRET");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(parts[1], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]).toString("utf8");
}

export function totpCode(secret: string, step: number): string {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error("INVALID_TOTP_STEP");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function matchTotpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const step of [current, current - 1, current + 1]) {
    if (step < 0) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function authenticatorUri(email: string, secret: string) {
  return "otpauth://totp/" + encodeURIComponent("Tijra:" + email) +
    "?secret=" + encodeURIComponent(secret) +
    "&issuer=Tijra&algorithm=SHA1&digits=6&period=30";
}
