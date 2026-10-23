import { readFileSync } from "node:fs";
import { verifySignedAuditExport } from "../lib/governance-audit-export.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: AUDIT_EXPORT_SIGNING_KEY=<base64url secret> node scripts/verify-governance-export.mjs <path-to-export.json>");
  process.exit(2);
}
try {
  const document = JSON.parse(readFileSync(file, "utf8"));
  if (!document || document.payload?.schema !== "tijra-governance-audit-v1" ||
      document.manifest?.algorithm !== "HMAC-SHA256") {
    console.error("Audit export schema is not recognized.");
    process.exit(1);
  }
  const valid = verifySignedAuditExport(document);
  if (!valid) {
    console.error("Audit export signature INVALID; reject this file.");
    process.exit(1);
  }
  console.log("Audit export signature VALID.");
  console.log("Business:", document.payload.businessId);
  console.log("Window:", document.payload.from, "to", document.payload.to);
  console.log("Events:", document.payload.events.length, "truncated:", document.payload.truncated);
  if (document.payload.truncated) {
    console.warn("WARNING: The export was truncated; it is not a complete log for this date range.");
  }
} catch (error) {
  console.error("Unable to verify signed audit export:", error instanceof Error ? error.message : "invalid data");
  process.exit(1);
}
