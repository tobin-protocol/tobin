// Dependency PACKAGE INVENTORY and licence-METADATA report (report-only). It compares the current lockfiles with the recorded inventory
// (ci/dependency-baseline.csv) and prints new, removed and changed entries, the known unresolved Rust residue, and the npm triage flags.
// Rust: manifests are read from the local Cargo cache (run `cargo fetch --locked` first). npm: licence fields come from the root package-lock.json
// (npm workspaces); workspace members are this repository's own code and are listed separately, never as third-party findings.
//
// The report distinguishes four different questions and answers only the first two:
//   1. which packages are in the lockfiles (inventory);
//   2. whether licence metadata exists for each and what it literally says;
//   3. what attribution/notice obligations follow, and 4. whether the licences are compatible with this project's distribution: NOT assessed here.
// A clean report is not a licence clearance, and `npm audit` is a vulnerability check, not a licence check. It never fails because of a licence value.
// Usage: node scripts/ci/dependency-report.mjs [output.csv]   (run from the repository root)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { summary, warning } from './lib.mjs';
import { npmInventory } from './npm-inventory.mjs';

const outFile = process.argv[2];
const parseCsvLine = (line) => {
  const f = []; let cur = '', q = false;
  for (const c of line.replace(/\r$/, '')) { if (c === '"') q = !q; else if (c === ',' && !q) { f.push(cur); cur = ''; } else cur += c; }
  f.push(cur); return f;
};
const baselineLines = readFileSync('ci/dependency-baseline.csv', 'utf8').trim().split('\n');
const cols = parseCsvLine(baselineLines[0]);
const baseline = new Map(baselineLines.slice(1).map((l) => { const f = Object.fromEntries(parseCsvLine(l).map((v, i) => [cols[i], v])); return [`${f.ecosystem}:${f.package}@${f.version}`, f]; }));

// --- current Rust packages from contracts/Cargo.lock
const lock = readFileSync('contracts/Cargo.lock', 'utf8');
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
  if (!p.registry) { current.push({ eco: 'rust', name: p.name, ver: p.ver, registry: false, lic: '', where: 'workspace member (project manifest has no license field)', scope: 'workspace', platform: '', flags: [] }); continue; }
  const toml = rustManifest(p);
  current.push({ eco: 'rust', name: p.name, ver: p.ver, registry: true, lic: toml ? field(toml, 'license') || (field(toml, 'license-file') ? `license-file:${field(toml, 'license-file')}` : '') : '', where: toml ? 'cargo cache (exact version)' : 'not found in the local Cargo cache', scope: 'rust lockfile: build-graph membership not determined', platform: '', flags: [] });
}
// --- current npm packages from the root package-lock.json
const npmCurrent = npmInventory(JSON.parse(readFileSync('package-lock.json', 'utf8')));
for (const p of npmCurrent) current.push({ eco: p.eco, name: p.name, ver: p.ver, registry: p.eco === 'npm', lic: p.lic, where: p.eco === 'npm' ? 'package-lock.json' : "workspace member (this repository's own code)", scope: p.scope, platform: p.platform, flags: p.flags });

const key = (p) => `${p.eco}:${p.name}@${p.ver}`;
const thirdPartyNpm = current.filter((p) => p.eco === 'npm');
const workspaceNpm = current.filter((p) => p.eco === 'npm-workspace');
const cur = new Map(current.map((p) => [key(p), p]));
const added = current.filter((p) => p.eco !== 'npm-workspace' && !baseline.has(key(p)));
const removed = [...baseline.entries()].filter(([k, b]) => !cur.has(k) && b.ecosystem !== 'npm-workspace').map(([k]) => k);
const changed = current.filter((p) => {
  const b = baseline.get(key(p)); if (!b || p.eco === 'npm-workspace') return false;
  if (p.eco === 'npm') return b.license_expression !== p.lic || b.dependency_scope !== p.scope || b.platform_restricted !== p.platform || b.review_flags !== p.flags.join(';');
  return b.metadata_status === 'Metadata located' && b.license_expression !== p.lic;
});
const lostMetadata = current.filter((p) => p.registry && baseline.has(key(p)) && baseline.get(key(p)).metadata_status === 'Metadata located' && !p.lic);
const rustBase = [...baseline.values()].filter((b) => b.ecosystem === 'rust');
const countBase = (f) => rustBase.filter(f).length;
const newlyLocated = current.filter((p) => p.eco === 'rust' && baseline.has(key(p)) && ['Unassessed', 'Partially assessed'].includes(baseline.get(key(p)).metadata_status) && p.lic);
const stillMissing = current.filter((p) => p.registry && !p.lic);

const tally = (arr, f) => { const t = new Map(); for (const x of arr) { const k = f(x); t.set(k, (t.get(k) || 0) + 1); } return [...t.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };
const flagged = (flag) => thirdPartyNpm.filter((p) => p.flags.includes(flag));
const lgpl = flagged('lgpl'), cc = flagged('data-or-content-licence'), mpl = flagged('mpl'), missingNpm = flagged('missing-metadata');
const list = (arr, fmt) => (arr.length ? arr.map((x) => `- ${fmt(x)}`).join('\n') : '- none');
const names = (arr) => arr.map((p) => `${p.name}@${p.ver}`).join(', ');

const md = [
  '### Dependency package inventory and licence-metadata report (report-only)',
  '**This is an inventory and a comparison of licence metadata. It is not a licence-compatibility, attribution or legal finding, a clean result does not clear the open items below, and `npm audit` (a vulnerability check) says nothing about licences.**',
  '',
  `Current lockfiles: ${current.filter((p) => p.eco === 'rust').length} Rust entries (including 2 workspace crates), ${thirdPartyNpm.length} third-party npm packages, and ${workspaceNpm.length} npm workspace members (this repository's own code: ${workspaceNpm.map((p) => p.name).join(', ')}), which are listed in the CSV and never counted as findings. Recorded inventory: ${baseline.size} rows.`,
  '',
  `**New findings (not in the recorded inventory): ${added.length}**`, list(added, (p) => `${key(p)}: ${p.lic ? `licence metadata \`${p.lic}\`` : 'NO licence metadata found'} [${p.where}]`),
  '',
  `**Changes to recorded entries: ${changed.length}; located before, missing now: ${lostMetadata.length}**`, list([...changed, ...lostMetadata], (p) => `${key(p)}: now \`${p.lic || '(none)'}\`, scope ${p.scope}${p.platform ? `, ${p.platform}` : ''}`),
  '',
  `**Removed since the recorded inventory: ${removed.length}**`, list(removed, (k) => k),
  '',
  '**npm dependency scope (as recorded by npm in the lockfile):** ' + tally(thirdPartyNpm, (p) => p.scope).map(([k, n]) => `${k} ${n}`).join('; ') + `; platform-restricted packages ${thirdPartyNpm.filter((p) => p.platform).length}.`,
  '**npm licence labels, exactly as supplied:** ' + tally(thirdPartyNpm, (p) => p.lic || '(none)').map(([k, n]) => `${k} ${n}`).join('; ') + '.',
  '',
  `**npm entries needing human review (triage labels, not conclusions):** lgpl ${lgpl.length}; mpl ${mpl.length}; data-or-content-licence ${cc.length}; missing metadata ${missingNpm.length}; compound expressions ${flagged('compound-expression').length}; uncommon labels ${flagged('uncommon-label').length}.`,
  `- LGPL-labelled: ${lgpl.length ? names(lgpl) : 'none'}. ${lgpl.length ? `Of these, ${lgpl.filter((p) => /optional/.test(p.scope)).length} are recorded by npm as optional and ${lgpl.filter((p) => p.platform).length} as platform-restricted (they belong to \`sharp\`, an optional dependency of \`next\`; npm installs only a platform-matching one, if any). This source release publishes the lockfile and source only: it does not bundle or ship these packages, but a deployed Next.js app or a build artifact could involve them, which needs a decision before any deployment or binary release.` : ''}`,
  `- Content licence: ${cc.length ? cc.map((p) => `${p.name}@${p.ver} (${p.lic}; scope ${p.scope})`).join(', ') : 'none'}.`,
  `- MPL-labelled: ${mpl.length ? names(mpl) : 'none'}.`,
  '',
  `**Known open items carried from the Rust inventory (still unresolved, not cleared by this report):** ${countBase((b) => b.metadata_status === 'Unassessed')} unassessed, ${countBase((b) => b.metadata_status === 'Partially assessed')} partially assessed, ${countBase((b) => b.metadata_status === 'Flag for review')} workspace crates without a \`license\` field, ${countBase((b) => b.review_flags === 'flagged')} located entries flagged for closer interpretation.`,
  `Of the previously unassessed or partial Rust packages, metadata is now locatable for ${newlyLocated.length} (human review still required).`,
  `Registry packages with no locatable licence field in this run: ${stillMissing.length}${stillMissing.length ? ' (' + stillMissing.slice(0, 20).map(key).join(', ') + (stillMissing.length > 20 ? ', …' : '') + ')' : ''}.`,
  '',
  'Not assessed here: licence texts, copyright notices, NOTICE or attribution obligations, compatibility with this project\'s licence or distribution, which Rust crates are linked into the contract Wasm, and which npm packages a deployed app would actually include.',
].join('\n');
summary(md);
if (added.length || changed.length || lostMetadata.length) warning(`dependency report: ${added.length} new, ${changed.length} changed, ${lostMetadata.length} lost metadata (report-only; see the job summary)`);
if (outFile) {
  const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
  const status = (p) => (p.eco === 'npm-workspace' ? 'workspace' : baseline.has(key(p)) ? 'in-inventory' : 'NEW');
  writeFileSync(outFile, 'ecosystem,package,version,license_expression,metadata_source,inventory_status,dependency_scope,platform_restricted,review_flags\n' + current.map((p) => [p.eco, p.name, p.ver, p.lic, p.where, status(p), p.scope, p.platform, p.flags.join(';')].map(q).join(',')).join('\n') + '\n');
}
