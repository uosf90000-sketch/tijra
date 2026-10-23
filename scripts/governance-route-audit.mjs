/**
 * Governance CI gate: a mutation endpoint must explicitly prove an authenticated
 * user/permission or a cryptographically verified public supplier token.
 * This is a source-level baseline, not a replacement for runtime authorization tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = join(root, "app", "api");
const publicAuthRoutes = new Set([
  "app/api/auth/login/route.ts",
  "app/api/auth/register/route.ts",
  "app/api/auth/logout/route.ts",
]);
const verbs = /export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\s*\(/;
const guards = /(?:requireApiPermission|requireApiAnyPermission|requireApiRoles|getSessionContext|verifySupplierOrderToken)\s*\(/;
const failures = [];
let checked = 0;

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { scan(full); continue; }
    if (entry.name !== "route.ts") continue;
    const path = relative(root, full).replaceAll("\\", "/");
    const source = readFileSync(full, "utf8");
    if (!verbs.test(source)) continue;
    checked += 1;
    if (!guards.test(source) && !publicAuthRoutes.has(path)) {
      failures.push(path);
    }
  }
}
scan(api);
if (failures.length > 0) {
  console.error("Mutation API routes without recognized server-side authorization:");
  for (const name of failures) console.error("- " + name);
  process.exitCode = 1;
} else {
  console.log("Governance guard scan: " + checked + " mutating API routes have an explicit authorization/token-check pattern or a reviewed authentication-route exception.");
}
