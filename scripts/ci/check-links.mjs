// Validates relative links and in-page anchors in the tracked Markdown files. External links are not fetched.
// Usage: node scripts/ci/check-links.mjs [--include-untracked]   (run from the repository root; the flag is for local use before a commit)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { error, summary } from './lib.mjs';

const lsArgs = process.argv.includes('--include-untracked') ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'] : ['ls-files', '-z', '--', '*.md'];
const files = execFileSync('git', lsArgs, { encoding: 'utf8' }).split('\0').filter(Boolean).filter((f) => !f.startsWith('archive/'));
const slug = (h) => h.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-');
const anchors = (text) => new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])));
const broken = [];
let links = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const here = anchors(text);
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const url = m[1];
    if (/^(https?:|mailto:)/.test(url)) continue;
    links++;
    const [path, fragment] = url.split('#');
    if (!path) {
      if (fragment && !here.has(fragment)) broken.push(`${file}: #${fragment}`);
      continue;
    }
    const target = resolve(dirname(file), decodeURIComponent(path));
    if (!existsSync(target)) { broken.push(`${file}: ${url}`); continue; }
    if (fragment && target.endsWith('.md') && !anchors(readFileSync(target, 'utf8')).has(fragment)) broken.push(`${file}: ${url} (anchor not found)`);
  }
}
summary(`### Documentation links\n${files.length} Markdown files, ${links} relative links checked, **${broken.length} broken**. External links are not fetched.` + (broken.length ? '\n\n' + broken.map((b) => `- ${b}`).join('\n') : ''));
if (broken.length) { for (const b of broken) error(b); process.exit(1); }
