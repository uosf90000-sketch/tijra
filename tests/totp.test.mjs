import assert from "node:assert/strict";
import test from "node:test";
import {
  base32Encode, base32Decode, encryptTotpSecret, decryptTotpSecret,
  totpCode, matchTotpStep,
} from "../lib/totp.ts";

test("RFC6238 SHA1 test vector supports standard 6-digit authenticators", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.deepEqual(base32Decode(secret), Buffer.from("12345678901234567890"));
  assert.equal(totpCode(secret, 1), "287082");
  assert.equal(matchTotpStep(secret, "287082", 59_000), 1);
  assert.equal(matchTotpStep(secret, "287082", 120_000), null);
  assert.equal(matchTotpStep(secret, "nototp", 59_000), null);
});

test("authenticator secret uses authenticated encryption at rest", () => {
  const old = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
  try {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);
    assert.ok(!encrypted.includes(secret));
    assert.equal(decryptTotpSecret(encrypted), secret);
    const tampered = encrypted.slice(0, -1) + (encrypted.endsWith("A") ? "B" : "A");
    assert.throws(() => decryptTotpSecret(tampered));
  } finally {
    if (old == null) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = old;
  }
});

test("MFA fails closed with no encryption key", () => {
  const old = process.env.MFA_ENCRYPTION_KEY;
  delete process.env.MFA_ENCRYPTION_KEY;
  try { assert.throws(() => encryptTotpSecret("JBSWY3DPEHPK3PXP"), /MFA_ENCRYPTION_KEY_UNAVAILABLE/); }
  finally {
    if (old != null) process.env.MFA_ENCRYPTION_KEY = old;
  }
});
