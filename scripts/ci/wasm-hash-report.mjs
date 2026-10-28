// Reports the SHA-256 and size of the built contract Wasm files next to (a) the hashes recorded on Windows (ci/wasm-hashes-recorded.txt,
// historical, never overwritten) and (b) the Linux reference (ci/wasm-hashes-linux.txt) once one has been recorded.
// REPORT-ONLY by default. The comparison against the Linux reference becomes a hard failure only when that file declares
// `# status: ENFORCED`, which is allowed only after two independent hosted Linux runs matched (see ci/README.md).
// A missing Wasm file always fails. A same-runner rebuild in a different target directory (--rebuild) is reported as evidence only.
// Usage: node scripts/ci/wasm-hash-report.mjs <wasm-directory> [output.txt] [--rebuild <second-wasm-directory>]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { error, summary, warning } from './lib.mjs';

const args = process.argv.slice(2);
const rebuildIdx = args.indexOf('--rebuild');
const rebuildDir = rebuildIdx >= 0 ? args[rebuildIdx + 1] : undefined;
const pos = args.filter((a, i) => !a.startsWith('--') && !(rebuildIdx >= 0 && i === rebuildIdx + 1));
const [dir, outFile] = pos;
if (!dir) { error('usage: wasm-hash-report.mjs <wasm-directory> [output.txt] [--rebuild <dir>]'); process.exit(2); }

const readRef = (path) => {
  if (!existsSync(path)) return { status: 'absent', entries: [] };
  const lines = readFileSync(path, 'utf8').split('\n');
  const status = (lines.find((l) => /^#\s*status:/i.test(l)) || '').replace(/^#\s*status:\s*/i, '').trim().toUpperCase() || 'PENDING';
  const entries = lines.filter((l) => l.trim() && !l.startsWith('#')).map((l) => { const [size, hash, name] = l.trim().split(/\s+/); return { size: Number(size), hash, name }; });
  const runs = lines.filter((l) => /^#\s*run:/i.test(l)).map((l) => l.replace(/^#\s*run:\s*/i, '').trim());
  const commits = lines.filter((l) => /^#\s*commit:/i.test(l)).map((l) => l.replace(/^#\s*commit:\s*/i, '').trim());
  const scope = lines.some((l) => /^#\s*scope:\s*\S/i.test(l));
  return { status, entries, runs, commits, scope };
};
const windows = readRef('ci/wasm-hashes-recorded.txt');
const linux = readRef('ci/wasm-hashes-linux.txt');
if (linux.status === 'ENFORCED') {
  const runOk = linux.runs.length >= 2 && new Set(linux.runs).size === linux.runs.length && linux.runs.every((r) => /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+$/.test(r));
  const commitOk = linux.commits.length >= 1 && new Set(linux.commits).size === 1 && /^[0-9a-f]{40}$/.test(linux.commits[0]);
  if (!runOk || !commitOk || !linux.scope || linux.entries.length < 2) {
    error('ci/wasm-hashes-linux.txt says ENFORCED but does not record two distinct hosted run URLs, one 40-hex commit, a scope statement and the artifact hashes');
    process.exit(1);
  }
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const rows = []; const lines = []; let missing = 0; let enforcedMismatch = 0;
for (const r of windows.entries) {
  const path = join(dir, r.name);
  if (!existsSync(path)) { missing++; rows.push(`| ${r.name} | **missing** | | | | |`); continue; }
  const buf = readFileSync(path); const hash = createHash('sha256').update(buf).digest('hex');
  const win = hash === r.hash ? 'identical' : 'differs';
  const lref = linux.entries.find((e) => e.name === r.name);
  let lin = 'no Linux reference recorded';
  if (lref) { const same = lref.hash === hash && lref.size === buf.length; lin = same ? 'identical' : 'DIFFERS'; if (!same && linux.status === 'ENFORCED') enforcedMismatch++; }
  let reb = '';
  if (rebuildDir) { const p2 = join(rebuildDir, r.name); reb = existsSync(p2) ? (sha(p2) === hash ? 'identical' : 'DIFFERENT') : 'missing'; }
  rows.push(`| ${r.name} | ${buf.length} | \`${hash}\` | ${win} (Windows record \`${r.hash.slice(0, 12)}…\`) | ${lin} | ${reb || 'n/a'} |`);
  lines.push(`${buf.length}  ${hash}  ${r.name}`);
}
const rebuildProblem = rebuildDir && rows.some((r) => /DIFFERENT|\| missing \|$/.test(r));
summary('### Contract Wasm hashes\n| file | bytes | SHA-256 built here | vs Windows record (historical) | vs Linux reference | same-runner rebuild in another directory |\n|---|---|---|---|---|---|\n' + rows.join('\n') +
  `\n\nLinux reference status: **${linux.status}**${linux.entries.length ? '' : ' (no hashes recorded yet)'}. ` +
  (linux.status === 'ENFORCED' ? 'A mismatch against the Linux reference fails this job. ' : 'Report-only: a difference does not fail the job. ') +
  'The Windows values are a historical record and are never overwritten. A matching rebuild on one runner is evidence of determinism on that runner only; it does not establish cross-OS or cross-toolchain reproducibility, and this report is not a release approval.');
if (outFile) writeFileSync(outFile, lines.join('\n') + '\n');
if (rebuildProblem) warning('Wasm same-runner rebuild differs or is missing; investigate build inputs (report-only)');
if (missing) { error(`${missing} expected Wasm file(s) missing in ${dir}`); process.exit(1); }
if (enforcedMismatch) { error(`${enforcedMismatch} Wasm hash(es) differ from the ENFORCED Linux reference`); process.exit(1); }
