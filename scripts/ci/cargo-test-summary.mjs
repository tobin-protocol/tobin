// Summarizes `cargo test` output: passed / failed / ignored per suite and in total. Fails on any failure or when no results are found.
// Usage: node scripts/ci/cargo-test-summary.mjs <cargo-test-output-file> "<title>" [--expect-passed N]
import { readFileSync } from 'node:fs';
import { error, summary } from './lib.mjs';

const [file, title = 'Rust tests', ...rest] = process.argv.slice(2);
if (!file) { error('usage: cargo-test-summary.mjs <file> [title] [--expect-passed N]'); process.exit(2); }
const expectIdx = rest.indexOf('--expect-passed');
const expected = expectIdx >= 0 ? Number(rest[expectIdx + 1]) : undefined;
const text = readFileSync(file, 'utf8');
let passed = 0, failed = 0, ignored = 0, suites = 0;
const problems = [];
for (const m of text.matchAll(/^test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored;/gm)) {
  suites++; passed += Number(m[2]); failed += Number(m[3]); ignored += Number(m[4]);
  if (m[1] !== 'ok') problems.push(`a suite reported status "${m[1]}"`);
}
if (suites === 0) problems.push('no `test result:` lines found');
if (failed > 0) problems.push(`${failed} failed`);
if (expected !== undefined && passed !== expected) problems.push(`expected ${expected} passed, found ${passed}`);
summary(`### ${title}\n| passed | failed | ignored | suites |\n|---|---|---|---|\n| ${passed} | ${failed} | ${ignored} | ${suites} |` + (problems.length ? `\n\n**Problems:** ${problems.join('; ')}` : ''));
if (problems.length) { for (const p of problems) error(`${title}: ${p}`); process.exit(1); }
