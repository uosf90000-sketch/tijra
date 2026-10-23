import assert from "node:assert/strict";
import test from "node:test";
import { signedAuditExport, verifySignedAuditExport } from "../lib/governance-audit-export.ts";

test("audit export authenticates its payload and detects mutation", () => {
  const before = process.env.AUDIT_EXPORT_SIGNING_KEY;
  process.env.AUDIT_EXPORT_SIGNING_KEY = Buffer.alloc(32, 42).toString("base64url");
  try {
    const payload = {
      schema: "tijra-governance-audit-v1",
      businessId: "business-test",
      exportedAt: "2026-10-23T12:00:00.000Z",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-23T12:00:00.000Z",
      truncated: false,
      events: [{ id: "audit-1", action: "LEDGER_POSTED", actorName: "reviewer" }],
    };
    const signed = signedAuditExport(payload);
    assert.equal(signed.manifest.algorithm, "HMAC-SHA256");
    assert.equal(verifySignedAuditExport(signed), true);
    signed.payload.events[0].actorName = "changed";
    assert.equal(verifySignedAuditExport(signed), false);
    const fresh = signedAuditExport(payload);
    fresh.manifest.signature = "invalid";
    assert.equal(verifySignedAuditExport(fresh), false);
  } finally {
    if (before === undefined) delete process.env.AUDIT_EXPORT_SIGNING_KEY;
    else process.env.AUDIT_EXPORT_SIGNING_KEY = before;
  }
});

test("signed audit export fails closed without configured key", () => {
  const before = process.env.AUDIT_EXPORT_SIGNING_KEY;
  delete process.env.AUDIT_EXPORT_SIGNING_KEY;
  try {
    assert.throws(() => signedAuditExport({
      schema: "tijra-governance-audit-v1", businessId: "a",
      exportedAt: "", from: "", to: "", truncated: false, events: [],
    }), /AUDIT_SIGNING_KEY_NOT_CONFIGURED/);
  } finally {
    if (before !== undefined) process.env.AUDIT_EXPORT_SIGNING_KEY = before;
  }
});
