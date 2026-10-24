import assert from "node:assert/strict";
import test from "node:test";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "../lib/mfa-recovery.ts";
import { loginIdentityHash, nextLoginThrottle } from "../lib/login-throttle-policy.ts";

test("10 independent MFA backup codes have 128 random bits each and no plaintext storage", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every((code) => /^[A-F0-9]{4}(-[A-F0-9]{4}){7}$/.test(code)));
  for (const code of codes) {
    const hash = hashRecoveryCode(code);
    assert.equal(hash.length, 64);
    assert.ok(!hash.includes(normalizeRecoveryCode(code)));
    assert.equal(hashRecoveryCode(code.replaceAll("-", "").toLowerCase()), hash);
  }
  assert.throws(() => hashRecoveryCode("123"), /INVALID_RECOVERY_CODE_FORMAT/);
});

test("password rate limiting locks after eight failed attempts and resets after the window", () => {
  const at = new Date("2026-10-23T10:00:00Z");
  let current = null;
  for (let i = 0; i < 8; i++) current = nextLoginThrottle(current, at);
  assert.equal(current.failedCount, 8);
  assert.ok(current.lockedUntil > at);
  const still = nextLoginThrottle(current, new Date("2026-10-23T10:05:00Z"));
  assert.equal(still.failedCount, 8);
  const after = nextLoginThrottle(current, new Date("2026-10-23T10:16:00Z"));
  assert.equal(after.failedCount, 1);
  assert.equal(after.lockedUntil, null);
});

test("login identity hashing is normalized without storing a raw email", () => {
  assert.equal(loginIdentityHash("Person@Example.com"), loginIdentityHash(" person@example.com "));
  assert.notEqual(loginIdentityHash("a@example.com"), loginIdentityHash("b@example.com"));
  assert.ok(!loginIdentityHash("a@example.com").includes("@"));
});
