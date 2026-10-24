import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type SignedAuditPayload = {
  schema: "tijra-governance-audit-v1";
  businessId: string;
  exportedAt: string;
  from: string;
  to: string;
  truncated: boolean;
  events: unknown[];
};

function signingKey() {
  const value = process.env.AUDIT_EXPORT_SIGNING_KEY;
  if (!value) throw new Error("AUDIT_SIGNING_KEY_NOT_CONFIGURED");
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("AUDIT_SIGNING_KEY_INVALID");
  return key;
}

export function signedAuditExport(payload: SignedAuditPayload) {
  const serialized = JSON.stringify(payload);
  const digest = createHash("sha256").update(serialized).digest("hex");
  const signature = createHmac("sha256", signingKey()).update(serialized).digest("base64url");
  return {
    manifest: {
      algorithm: "HMAC-SHA256",
      keyId: process.env.AUDIT_EXPORT_SIGNING_KEY_ID || "tijra-audit-default",
      payloadSha256: digest,
      signature,
    },
    payload,
  };
}

export function verifySignedAuditExport(value: ReturnType<typeof signedAuditExport>) {
  const serialized = JSON.stringify(value.payload);
  const digest = createHash("sha256").update(serialized).digest("hex");
  if (digest !== value.manifest.payloadSha256) return false;
  const expected = createHmac("sha256", signingKey()).update(serialized).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(value.manifest.signature, "base64url"); }
  catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
