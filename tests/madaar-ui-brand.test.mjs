import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("Madaar public branding has a single source of truth", () => {
  const b = read("lib/brand.ts");
  const layout = read("app/layout.tsx");
  const manifest = read("app/manifest.ts");
  assert.match(b, /name: "مدار"/);
  assert.match(b, /english: "Madaar"/);
  assert.match(layout, /import \{ BRAND \} from "@\/lib\/brand"/);
  assert.match(manifest, /import \{ BRAND \} from "@\/lib\/brand"/);
  assert.match(layout, /applicationName: BRAND\.english/);
  assert.match(manifest, /short_name: BRAND\.name/);
  assert.doesNotMatch(layout, /تِجرا|TIJRA/);
  assert.doesNotMatch(manifest, /تِجرا|TIJRA/);
});

test("Madaar CSS overrides legacy styles last and remains mobile/accessibility aware", () => {
  const layout = read("app/layout.tsx");
  const styles = read("app/madaar-design-system.css");
  const at = layout.indexOf('import "./madaar-design-system.css"');
  assert.ok(at > layout.indexOf('import "./offline.css"'));
  assert.ok(styles.includes("--madaar-primary:"));
  assert.ok(styles.includes(".staffFrame"));
  assert.ok(styles.includes(".posCatalog"));
  assert.ok(styles.includes(".dataTable"));
  assert.ok(styles.includes(".madaarPageSignature"));
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /max-width:640px/);
  assert.match(styles, /focus-visible/);
});

test("logo stays Madaar across sidebar, staff and login without changing route/API ids", () => {
  const logo = read("components/madaar-logo.tsx");
  const shim = read("components/tijra-logo.tsx");
  const shell = read("components/app-shell.tsx");
  const auth = read("components/auth-form.tsx");
  const login = read("app/login/page.tsx");
  assert.match(logo, /<strong>مدار<\/strong>/);
  assert.match(logo, /MADAAR/);
  assert.match(shim, /MadaarLogo as TijraLogo/);
  assert.match(shell, /<TijraLogo/);
  assert.match(auth, /TijraLogo/);
  assert.doesNotMatch(shell, /جاري فتح تِجرا/);
  assert.match(login, /الدخول إلى مدار/);
});
