// Reports passed / failed / skipped from the default (spec) output of `npm test` (Node 24.x) and enforces an explicit skip allow-list.
// Any skipped test that is not on the allow-list fails the check; so does any failure, and an allowed skip that no longer occurs
// is reported (it may mean the allow-list is stale). Skips are never silently accepted.
// Usage: node scripts/ci/test-skip-report.mjs <test-output-file> --allow "<exact test name>=<required reason prefix>" [--allow ...]
import { readFileSync } from 'node:fs';
import { error, summary, warning } from './lib.mjs';

const args = process.argv.slice(2);
const file = args[0];
const allow = [];
for (let i = 1; i < args.length; i++) if (args[i] === '--allow') { const [name, ...reason] = String(args[++i]).split('='); allow.push({ name, reason: reason.join('='), seen: 0 }); }
if (!file) { error('usage: test-skip-report.mjs <test-output-file> [--allow "name=reason prefix"]'); process.exit(2); }

const text = readFileSync(file, 'utf8');
const num = (label) => { const m = text.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'm')); return m ? Number(m[1]) : undefined; };
const total = { tests: num('tests'), pass: num('pass'), fail: num('fail'), cancelled: num('cancelled'), skipped: num('skipped'), todo: num('todo') };
const problems = [];
if (total.tests === undefined) problems.push('no node:test summary found (expected the default spec reporter of Node 24)');
if (total.fail) problems.push(`${total.fail} failed`);
if (total.cancelled) problems.push(`${total.cancelled} cancelled`);
if (total.todo) problems.push(`${total.todo} todo`);

const skips = [...text.matchAll(/^\s*﹣ (.+?) \([\d.]+ms\)(?: # (.*))?$/gm)].map((m) => ({ name: m[1].trim(), reason: (m[2] ?? '').trim() }));
if (total.skipped !== undefined && skips.length !== total.skipped) problems.push(`summary says ${total.skipped} skipped but ${skips.length} skip lines were parsed`);
const rows = [];
for (const s of skips) {
  const a = allow.find((x) => x.name === s.name && s.reason.startsWith(x.reason));
  if (a) { a.seen++; rows.push(`| ${s.name} | ${s.reason} | allowed |`); } else { rows.push(`| ${s.name} | ${s.reason} | **NOT ALLOWED** |`); problems.push(`unexpected skip: "${s.name}" (${s.reason})`); }
}
for (const a of allow) if (a.seen === 0) warning(`allow-listed skip no longer occurs: "${a.name}"; review the allow-list`);
for (const a of allow) if (a.seen > 1) problems.push(`allow-listed skip "${a.name}" occurred ${a.seen} times`);

summary(`### TypeScript tests (node:test)\n| tests | passed | failed | skipped | cancelled |\n|---|---|---|---|---|\n| ${total.tests} | ${total.pass} | ${total.fail} | ${total.skipped} | ${total.cancelled} |\n\n` +
  (rows.length ? `Skipped tests (explicit allow-list):\n\n| test | reason | status |\n|---|---|---|\n${rows.join('\n')}\n` : 'No skipped tests.\n') +
  (problems.length ? `\n**Problems:** ${problems.join('; ')}` : ''));
if (problems.length) { for (const p of problems) error(p); process.exit(1); }
