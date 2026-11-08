import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Source check for the owner's rule: no screen can render a Confirmed state unless the backend reports a verified read-back (today: never).
// The Confirmed stage is produced ONLY by lib/stages.ts (stageView, which needs verifiedReadBack). Components render stages through STAGE_LABEL and
// must not contain the Confirmed label or a 'confirmed' status of their own. Allowed: lib/stages.ts, the tests, and the component gallery's labelled demo.

const root = join(import.meta.dirname, "..");
const SCAN = ["app", "components", "lib"];
const ALLOWED = new Set(["lib/stages.ts", "app/dev/components/page.tsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next"]);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("no source file outside the allow-list renders a Confirmed state", () => {
  const offenders: string[] = [];
  for (const d of SCAN) {
    for (const f of files(join(root, d))) {
      const rel = relative(root, f).split("\\").join("/");
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (/\bConfirmed\b/.test(text) || /["'`]confirmed["'`]/i.test(text)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], "only lib/stages.ts may produce the Confirmed state; render stages through STAGE_LABEL");
});

test("the HTTP adapter never reports a verified read-back (the backend does not provide one)", () => {
  const client = readFileSync(join(root, "lib/tobin/client.ts"), "utf8");
  assert.ok(!/verifiedReadBack\s*:\s*true/.test(client));
  assert.ok(!/verifiedReadBack/.test(client), "no endpoint reports a read-back, so the adapter does not mention one");
});
