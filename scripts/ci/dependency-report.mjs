// Dependency licence METADATA report (report-only). It compares the current lockfiles with the recorded Stage 2N inventory
// (ci/dependency-baseline.csv) and prints new, removed and changed entries, plus the known unresolved residue.
// It reads manifests from the local Cargo cache (run `cargo fetch --locked` first) and licence fields from package-lock.json.
// It makes no licence-compatibility or compliance finding and never fails because of a licence value; it fails only on a script error.
// Usage: node scripts/ci/dependency-report.mjs [output.csv]   (run from the repository root)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { summary, warning } from './lib.mjs';

const outFile = process.argv[2];
const readCsv = (path) => readFileSync(path, 'utf8').trim().split('\n').slice(1).map((line) => {
  const f = []; let cur = '', q = false;
  for (const c of line.replace(/\r$/, '')) { if (c === '"') q = !q; else if (c === ',' && !q) { f.push(cur); cur = ''; } else cur += c; }
  f.push(cur); return f;
});
const baseline = new Map(readCsv('ci/dependency-baseline.csv').map(([eco, name, ver, lic, status, flag]) => [`${eco}:${name}@${ver}`, { lic, status, flag }]));

// --- current Rust packages from core/Cargo.lock
const lock = readFileSync('core/Cargo.lock', 'utf8');
const rust = [...lock.matchAll(/\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"(?:\r?\nsource = "([^"]+)")?/g)].map((m) => ({ eco: 'rust', name: m[1], ver: m[2], registry: Boolean(m[3] && m[3].startsWith('registry')), source: m[3] || 'path' }));
const cargoHome = (process.env.CARGO_HOME || `${homedir()}/.cargo`).replace(/\\/g, '/');
const regRoot = `${cargoHome}/registry`;
const regNames = existsSync(`${regRoot}/src`) ? readdirSync(`${regRoot}/src`) : [];
const field = (toml, key) => { const m = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm')); return m ? m[1] : ''; };
function tarFind(buf, wanted) { let o = 0; while (o + 512 <= buf.length) { const name = buf.toString('latin1', o, o + 100).replace(/\0.*$/, ''); if (!name) break; const size = parseInt(buf.toString('latin1', o + 124, o + 136).replace(/\0.*$/, '').trim() || '0', 8); if (name === wanted) return buf.subarray(o + 512, o + 512 + size).toString('utf8'); o += 512 + Math.ceil(size / 512) * 512; } return ''; }
function rustManifest(p) {
  const id = `${p.name}-${p.ver}`;
  for (const r of regNames) { const f = `${regRoot}/src/${r}/${id}/Cargo.toml`; if (existsSync(f)) return readFileSync(f, 'utf8'); }
  const cacheDirs = existsSync(`${regRoot}/cache`) ? readdirSync(`${regRoot}/cache`) : [];
  for (const r of cacheDirs) { const f = `${regRoot}/cache/${r}/${id}.crate`; if (existsSync(f)) return tarFind(gunzipSync(readFileSync(f)), `${id}/Cargo.toml`); }
  return '';
}
const current = [];
for (const p of rust) {
  if (!p.registry) { current.push({ ...p, lic: '', where: 'workspace member (project manifest has no license field)' }); continue; }
  const toml = rustManifest(p);
  current.push({ ...p, lic: toml ? field(toml, 'license') || (field(toml, 'license-file') ? `license-file:${field(toml, 'license-file')}` : '') : '', where: toml ? 'cargo cache (exact version)' : 'not found in the local Cargo cache' });
}
// --- current npm packages from ts/package-lock.json
const npm = JSON.parse(readFileSync('ts/package-lock.json', 'utf8'));
for (const [k, v] of Object.entries(npm.packages)) if (k) current.push({ eco: 'npm', name: k.replace(/^node_modules\//, ''), ver: v.version, registry: true, lic: v.license || '', where: 'package-lock.json' });

const key = (p) => `${p.eco}:${p.name}@${p.ver}`;
const cur = new Map(current.map((p) => [key(p), p]));
const added = current.filter((p) => !baseline.has(key(p)));
const removed = [...baseline.keys()].filter((k) => !cur.has(k));
const changed = current.filter((p) => baseline.has(key(p)) && baseline.get(key(p)).status === 'Metadata located' && p.lic !== baseline.get(key(p)).lic);
const lostMetadata = current.filter((p) => p.registry && baseline.has(key(p)) && baseline.get(key(p)).status === 'Metadata located' && !p.lic);
const residueKeys = [...baseline].filter(([, b]) => b.status !== 'Metadata located' || b.flag);
const count = (f) => [...baseline.values()].filter(f).length;
const newlyLocated = current.filter((p) => baseline.has(key(p)) && ['Unassessed', 'Partially assessed'].includes(baseline.get(key(p)).status) && p.lic);
const stillMissing = current.filter((p) => p.registry && !p.lic);

const list = (arr, fmt) => (arr.length ? arr.map((x) => `- ${fmt(x)}`).join('\n') : '- none');
const md = [
  '### Dependency licence metadata report (report-only)',
  '**This is a metadata comparison, not a licence-compatibility or compliance finding, and a clean result does not clear the known open items below.**',
  '',
  `Current lockfiles: ${current.filter((p) => p.eco === 'rust').length} Rust entries, ${current.filter((p) => p.eco === 'npm').length} npm packages. Recorded Stage 2N inventory: ${baseline.size} entries.`,
  '',
  `**New findings (not in the recorded inventory): ${added.length}**`, list(added, (p) => `${key(p)}: ${p.lic ? `licence metadata \`${p.lic}\` (needs review)` : 'NO licence metadata found'} [${p.where}]`),
  '',
  `**Metadata changes for previously located packages: ${changed.length}; located before, missing now: ${lostMetadata.length}**`, list([...changed, ...lostMetadata], (p) => `${key(p)}: was \`${baseline.get(key(p)).lic}\`, now \`${p.lic || '(none)'}\``),
  '',
  `**Removed since the inventory: ${removed.length}**`, list(removed, (k) => k),
  '',
  `**Known open items carried from Stage 2N (still unresolved, not cleared by this report):** ${count((b) => b.status === 'Unassessed')} unassessed, ${count((b) => b.status === 'Partially assessed')} partially assessed, ${count((b) => b.status === 'Flag for review')} workspace crates without a \`license\` field, ${count((b) => b.flag === 'flagged')} located entries flagged for closer interpretation.`,
  `Of the previously unassessed or partial packages, metadata is now locatable for ${newlyLocated.length} (human review still required).`,
  `Registry packages with no locatable licence field in this run: ${stillMissing.length}${stillMissing.length ? ' (' + stillMissing.slice(0, 20).map(key).join(', ') + (stillMissing.length > 20 ? ', …' : '') + ')' : ''}.`,
  '',
  'Not assessed here: licence text, copyright notices, NOTICE obligations, compatibility, or which crates are actually linked into the contract Wasm.',
].join('\n');
summary(md);
if (added.length || changed.length || lostMetadata.length) warning(`dependency report: ${added.length} new, ${changed.length} changed, ${lostMetadata.length} lost metadata (report-only; see the job summary)`);
if (outFile) {
  const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
  const status = (p) => (baseline.has(key(p)) ? 'in-inventory' : 'NEW');
  writeFileSync(outFile, 'ecosystem,package,version,license_expression,metadata_source,inventory_status\n' + current.map((p) => [p.eco, p.name, p.ver, p.lic, p.where, status(p)].map(q).join(',')).join('\n') + '\n');
}
