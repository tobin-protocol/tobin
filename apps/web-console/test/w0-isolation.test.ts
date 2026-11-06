// Isolation proofs for W0. STATIC (what the source can reach) plus BEHAVIOURAL (what happens at runtime with process/network APIs instrumented).
// Nothing here runs, imports, reads or mutates the real signer or its files; the instrumented APIs are replaced by recorders, not wrapped.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import cp from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { MOCK_SCENARIOS } from '../lib/w0/mock-adapter.ts';
import type { MockScenario } from '../lib/w0/mock-adapter.ts';
import { approver, build, intentFor, requester, uuid, viewer } from './w0-helpers.ts';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const W0_DIRS = ['lib/w0', 'app/w0', 'app/api/w0', 'components/w0'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}
const files = W0_DIRS.flatMap((d) => walk(join(ROOT, d)));
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const rel = (f: string): string => relative(ROOT, f).split(sep).join('/');

test('the scan covers the W0 files', () => {
  assert.ok(files.length >= 14, `only ${files.length} files found`);
  for (const must of ['lib/w0/service.ts', 'lib/w0/mock-adapter.ts', 'lib/w0/http.ts', 'app/api/w0/[...path]/route.ts']) assert.ok(files.map(rel).includes(must), must);
});

const FORBIDDEN_MODULES = /(?:from|import|require)\s*\(?\s*['"](?:node:)?(?:child_process|fs|fs\/promises|net|tls|dgram|dns|http|https|http2|worker_threads|cluster|vm|os|path|module|repl|inspector|v8|process)['"]/;
test('no W0 source imports a process, filesystem, network, vm or OS module', () => {
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    assert.ok(!FORBIDDEN_MODULES.test(src), `${rel(f)} imports a forbidden module`);
  }
});
test('no W0 source reaches the signer: no signer path, module name, key, DPAPI, PowerShell or icacls reference in code', () => {
  const bad = /tst-signer|signer-main|signer-core|pinned\.cjs|baseline\.cjs|dpapi|powershell|icacls|\.cjs['"]/i;
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    const m = bad.exec(src);
    assert.ok(!m, `${rel(f)} references ${m?.[0]}`);
  }
});
test('no W0 source can execute code or commands dynamically', () => {
  const bad = /\b(?:eval|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(|new\s+Function\b|\bFunction\s*\(|\bimport\s*\(|require\s*\(|child_process|process\.(?:binding|dlopen|kill|chdir)|WebSocket|XMLHttpRequest|EventSource|sendBeacon/;
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    const m = bad.exec(src);
    assert.ok(!m, `${rel(f)}: ${m?.[0]}`);
  }
});
test('server-side W0 code makes no outbound request; browser code fetches only same-origin /api/w0', () => {
  for (const f of files.filter((x) => !rel(x).startsWith('components/w0'))) {
    assert.ok(!/\bfetch\s*\(/.test(stripComments(readFileSync(f, 'utf8'))), `${rel(f)} calls fetch`);
  }
  const ui = readFileSync(join(ROOT, 'components/w0/w0-app.tsx'), 'utf8');
  const calls = [...ui.matchAll(/fetch\(([^,)]*)/g)].map((m) => m[1]);
  assert.deepEqual(calls, ['path']);
  const paths = [...ui.matchAll(/api(?:<[^>]*>)?\('(?:GET|POST|DELETE)', ['`](\/api\/w0\/[a-z]+)/g)].map((m) => m[1]);
  assert.ok(paths.length > 0 && paths.every((p) => /^\/api\/w0\/(session|readiness|previews|approvals|audit)$/.test(p as string)));
  assert.ok(!/https?:\/\//.test(ui));
});
test('process.env is read only in the wiring module, and no secret-bearing variable is referenced', () => {
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    if (rel(f) === 'lib/w0/deps.ts') {
      const names = [...src.matchAll(/env\['([A-Z0-9_]+)'\]/g)].map((m) => m[1]).sort();
      assert.deepEqual(names, ['NODE_ENV', 'W0_ALLOW_DEV_IDP', 'W0_MOCK_SCENARIO']);
    } else assert.ok(!/process\.env/.test(src), `${rel(f)} reads process.env`);
  }
});
test('the browser bundle source never mentions a baseline pin, confirmation phrase, key or XDR field', () => {
  const ui = readFileSync(join(ROOT, 'components/w0/w0-app.tsx'), 'utf8');
  assert.ok(!/secret|privateKey|seed|xdr|dpapi|approved-baseline/i.test(stripComments(ui)));
  // explanatory text may say that a typed confirmation exists locally; no state, field or variable may carry one
  assert.ok(!/\b\w*(?:confirm|phrase)\w*\s*[:=]/i.test(stripComments(ui)));
});
test('the adapter interface is exactly the four contract methods; no execute/init/sign/submit/key/state/file call exists', () => {
  const types = readFileSync(join(ROOT, 'lib/w0/types.ts'), 'utf8');
  const body = /export interface SignerAdapter \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
  const methods = [...body.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]);
  assert.deepEqual(methods, ['getReadiness', 'requestPreview', 'recordApprovalIntent', 'listAuditEvents']);
  const all = files.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
  for (const name of ['execute', 'init', 'sign', 'submit', 'loadKey', 'readState', 'writeFile']) {
    assert.ok(!new RegExp(`\\b${name}\\s*\\(`).test(all), `a ${name}() call or definition exists`);
  }
});
test('app/api/w0 contains only the one catch-all route and it exports only GET, POST and DELETE', () => {
  const routeFiles = files.filter((f) => rel(f).startsWith('app/api/w0'));
  assert.deepEqual(routeFiles.map(rel), ['app/api/w0/[...path]/route.ts']);
  const exported = [...readFileSync(routeFiles[0] as string, 'utf8').matchAll(/export const (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(exported, ['DELETE', 'GET', 'POST', 'dynamic', 'runtime']);
});
test('W0 does not modify signer or baseline files: no W0 source path or write call refers to scripts/', () => {
  for (const f of files) assert.ok(!/scripts[\\/]/.test(stripComments(readFileSync(f, 'utf8'))), rel(f));
});

// ---------- behavioural ----------
test('running every mock scenario through the whole service starts no process, opens no socket, makes no request and does no DNS lookup', async () => {
  const targets: [string, object, string][] = [];
  for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) targets.push(['child_process.' + k, cp, k]);
  targets.push(['net.connect', net, 'connect'], ['net.createConnection', net, 'createConnection'], ['http.request', http, 'request'], ['http.get', http, 'get'], ['https.request', https, 'request'], ['dns.lookup', dns, 'lookup'], ['dns.resolve', dns, 'resolve']);
  const mocks = targets.map(([name, obj, key]) => ({ name, m: mock.method(obj as Record<string, (...a: unknown[]) => unknown>, key, () => { throw new Error('forbidden call'); }) }));
  const fetchMock = mock.method(globalThis, 'fetch', () => { throw new Error('forbidden fetch'); });
  try {
    for (const scenario of MOCK_SCENARIOS as readonly MockScenario[]) {
      const b = build({ scenario });
      await b.service.getReadiness(viewer);
      await b.service.requestPreview(requester, { requestId: uuid(), operation: 'deploy' });
      await b.service.recordApprovalIntent(approver, intentFor()).catch(() => undefined);
      await b.service.listAuditEvents(viewer, {});
      await b.adapter.getReadiness();
    }
  } finally {
    const calls = mocks.filter((x) => x.m.mock.callCount() > 0).map((x) => x.name);
    if (fetchMock.mock.callCount() > 0) calls.push('fetch');
    mock.restoreAll();
    assert.deepEqual(calls, []);
  }
});
