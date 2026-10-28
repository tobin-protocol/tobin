// Rewrites the npm part of ci/dependency-baseline.csv from the root package-lock.json (deterministic; running it twice changes nothing), or with
// --check verifies that the file is already in sync, which CI uses so that a dependency change cannot land without its inventory update.
// The Rust rows are the recorded licence-metadata inventory of core/Cargo.lock (contracts/Cargo.lock): they are carried over unchanged, because that
// metadata was read from a local Cargo cache that is not guaranteed to exist elsewhere; they are only converted to the current column layout.
// This records an inventory. It makes no licence-compatibility, attribution or legal finding.
// Usage: node scripts/ci/update-npm-baseline.mjs [--check]   (run from the repository root)
import { readFileSync, writeFileSync } from 'node:fs';
import { error, summary } from './lib.mjs';
import { npmInventory } from './npm-inventory.mjs';

const HEADER = 'ecosystem,package,version,license_expression,metadata_status,review_flags,dependency_scope,platform_restricted';
const FILE = 'ci/dependency-baseline.csv';

function parseCsvLine(line) {
  const f = []; let cur = '', q = false;
  for (const c of line.replace(/\r$/, '')) { if (c === '"') q = !q; else if (c === ',' && !q) { f.push(cur); cur = ''; } else cur += c; }
  f.push(cur); return f;
}
const quote = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

/** Rust rows in the current layout, whether the file is in the old (6-column) or the current (8-column) layout. */
function rustRows(text) {
  const lines = text.trim().split('\n');
  const wide = lines[0].startsWith('ecosystem,package,version,license_expression,metadata_status');
  return lines.slice(1).map(parseCsvLine).filter((r) => r[0] === 'rust').map((r) => (wide ? r : [r[0], r[1], r[2], r[3], r[4], r[5], 'rust lockfile: build-graph membership not determined', '']));
}

function expectedText(existing, lock) {
  const rows = rustRows(existing);
  for (const p of npmInventory(lock)) {
    rows.push([p.eco, p.name, p.ver, p.lic, p.eco === 'npm-workspace' ? 'workspace member (own code)' : p.lic ? 'Metadata located' : 'Missing metadata', p.flags.join(';'), p.scope, p.platform]);
  }
  return HEADER + '\n' + rows.map((r) => r.map(quote).join(',')).join('\n') + '\n';
}

const check = process.argv.includes('--check');
{
  const existing = readFileSync(FILE, 'utf8');
  const next = expectedText(existing, JSON.parse(readFileSync('package-lock.json', 'utf8')));
  if (check) {
    if (existing.replace(/\r\n/g, '\n') === next) summary('### Dependency baseline\nThe npm part of `ci/dependency-baseline.csv` matches `package-lock.json`.');
    else { error('ci/dependency-baseline.csv is out of sync with package-lock.json: run `node scripts/ci/update-npm-baseline.mjs` and review the diff'); process.exit(1); }
  } else {
    writeFileSync(FILE, next);
    summary(`### Dependency baseline\nWrote ${next.trim().split('\n').length - 1} rows to \`${FILE}\` (Rust rows carried over unchanged).`);
  }
}
