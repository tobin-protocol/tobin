// API-level tests: direct calls (no UI) must not bypass authentication, roles, CSRF or validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeps, decideDevIdp, HOSTED_ENV_MARKERS, MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../lib/w0/deps.ts';
import { handleW0, RateLimiter } from '../lib/w0/http.ts';
import type { HttpDeps } from '../lib/w0/http.ts';
import { T0, uuid } from './w0-helpers.ts';

const H = { host: '127.0.0.1:8787' };
interface Client { deps: HttpDeps; cookie: string; csrf: string }

async function call(deps: HttpDeps, method: string, path: string, opts: { body?: unknown; raw?: string; headers?: Record<string, string>; client?: Client } = {}) {
  const headers: Record<string, string> = { ...H, ...(opts.headers ?? {}) };
  if (opts.client) { headers['cookie'] = opts.client.cookie; if (method !== 'GET' && !('x-w0-csrf' in headers)) headers['x-w0-csrf'] = opts.client.csrf; }
  const hasBody = opts.body !== undefined || opts.raw !== undefined;
  if (hasBody && !('content-type' in headers)) headers['content-type'] = 'application/json';
  if (method === 'POST' && !('content-type' in headers)) headers['content-type'] = 'application/json';
  const res = await handleW0(new Request(`http://127.0.0.1:8787${path}`, { method, headers, ...(hasBody ? { body: opts.raw ?? JSON.stringify(opts.body) } : {}) }), deps);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* plain-text guard refusal */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(deps: HttpDeps, subject: string): Promise<Client> {
  const r = await call(deps, 'POST', '/api/w0/session', { body: { subject } });
  assert.equal(r.status, 200, r.text);
  const setCookie = r.headers.get('set-cookie') ?? '';
  return { deps, cookie: setCookie.split(';')[0] as string, csrf: r.json['csrf'] as string };
}
const fresh = (extra: Record<string, string> = {}): HttpDeps => buildDeps({ NODE_ENV: 'test', ...extra }, () => T0);

test('every data route requires authentication, including read-only ones', async () => {
  const d = fresh();
  for (const [m, p] of [['GET', '/api/w0/readiness'], ['GET', '/api/w0/previews'], ['POST', '/api/w0/previews'], ['GET', '/api/w0/approvals'], ['POST', '/api/w0/approvals'], ['GET', '/api/w0/audit']] as const) {
    const r = await call(d, m, p, m === 'POST' ? { body: {} } : {});
    assert.equal(r.status, 401, `${m} ${p}`);
  }
  assert.ok(d.service !== undefined);
});
test('the sign-in bootstrap exposes only dev choices, labelled DEVELOPMENT, and sets an HttpOnly SameSite=Strict cookie', async () => {
  const d = fresh();
  const s = await call(d, 'GET', '/api/w0/session');
  assert.equal(s.json['idp'], 'DEVELOPMENT');
  assert.equal(s.json['authenticated'], false);
  const r = await call(d, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' } });
  const c = r.headers.get('set-cookie') ?? '';
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/);
  assert.equal(r.json['idp'], 'DEVELOPMENT');
});
test('sign-in refuses unknown users, extra fields and credentials-shaped input', async () => {
  const d = fresh();
  for (const body of [{ subject: 'root' }, { subject: 'dev-approver', role: 'approver' }, { subject: 'dev-viewer', password: 'x' }, {}, { role: 'approver' }])
    assert.equal((await call(d, 'POST', '/api/w0/session', { body })).status, 401);
});
test('production build without an explicit opt-in has no identity provider: nobody can sign in', async () => {
  const d = buildDeps({ NODE_ENV: 'production' }, () => T0);
  assert.equal((await call(d, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' } })).status, 403);
  assert.equal((await call(d, 'GET', '/api/w0/session')).json['idp'], 'NONE');
  const opted = buildDeps({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '1' }, () => T0);
  assert.equal((await call(opted, 'GET', '/api/w0/session')).json['idp'], 'DEVELOPMENT'); // still labelled development
});
test('direct API calls cannot bypass role restrictions', async () => {
  const d = fresh();
  const viewer = await login(d, 'dev-viewer');
  const approver = await login(d, 'dev-approver');
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: viewer, body: { requestId: uuid(), operation: 'deploy' } })).status, 403);
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: approver, body: { requestId: uuid(), operation: 'deploy' } })).status, 403);
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: viewer, body: {} })).status, 403);
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: viewer })).status, 200);
});
test('requester flow end to end over HTTP; approver records intent bound to the preview; self-approval, replay and transfer refused', async () => {
  const d = fresh({ W0_MOCK_SCENARIO: 'ok' });
  const req = await login(d, 'dev-requester');
  const app = await login(d, 'dev-approver');
  const pid = uuid();
  const pv = await call(d, 'POST', '/api/w0/previews', { client: req, body: { requestId: pid, operation: 'deploy' } });
  assert.equal(pv.status, 201);
  assert.equal(((pv.json['preview'] as { result: { outcome: string } }).result).outcome, 'OK');
  assert.equal(pv.json['origin'], 'mock');
  const intent = { approvalId: uuid(), previewRequestId: pid, operation: 'deploy', baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256, requestedBy: 'dev-requester', approvedBy: 'dev-approver', approvedAt: '2026-11-06T12:00:00Z', expiresAt: '2026-11-06T13:00:00Z' };
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: app, body: { ...intent, requestedBy: 'dev-approver', approvalId: uuid() } })).status, 403);
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: app, body: intent })).status, 201);
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: app, body: intent })).status, 409);
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: app, body: { ...intent, approvalId: uuid() } })).status, 409); // second intent for the same preview
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: app, body: { ...intent, approvalId: uuid(), previewRequestId: uuid() } })).status, 400); // unknown preview
  assert.equal((await call(d, 'GET', '/api/w0/approvals', { client: app })).json['intents'] instanceof Array, true);
  const audit = await call(d, 'GET', '/api/w0/audit?type=approval_intent_recorded', { client: req });
  assert.equal((audit.json['events'] as unknown[]).length, 1);
});
test('CSRF: state-changing calls without the session token are refused', async () => {
  const d = fresh();
  const req = await login(d, 'dev-requester');
  const body = { requestId: uuid(), operation: 'deploy' };
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: req, body, headers: { 'x-w0-csrf': 'wrong' } })).status, 403);
  const noToken = await handleW0(new Request('http://127.0.0.1:8787/api/w0/previews', { method: 'POST', headers: { ...H, cookie: req.cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }), d);
  assert.equal(noToken.status, 403);
  assert.equal((await call(d, 'DELETE', '/api/w0/session', { client: req, headers: { 'x-w0-csrf': 'wrong' } })).status, 403);
  assert.equal((await call(d, 'DELETE', '/api/w0/session', { client: req })).status, 200);
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: req })).status, 401); // the session is gone
});
test('transport guards still apply: host, origin, content type, body size, JSON', async () => {
  const d = fresh();
  const v = await login(d, 'dev-requester');
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: v, headers: { host: 'evil.example' } })).status, 403);
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: v, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: v, raw: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: v, raw: '{not json' })).status, 400);
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: v, raw: JSON.stringify({ pad: 'x'.repeat(1_100_000) }) })).status, 413);
});
test('the route table is closed: forbidden capabilities do not exist as endpoints', async () => {
  const d = fresh();
  const v = await login(d, 'dev-approver');
  for (const p of ['execute', 'init', 'sign', 'submit', 'keys', 'key', 'state', 'config', 'deployment-config', 'baseline', 'approve-baseline', 'pin', 'xdr', 'files', 'file', 'run', 'exec', 'env', 'dpapi', 'shell', 'preview', 'readiness/../execute', '../../etc/passwd'])
    for (const m of ['GET', 'POST', 'DELETE'] as const) {
      const r = await call(d, m, `/api/w0/${p}`, { client: v, ...(m === 'POST' ? { body: {} } : {}) });
      assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`);
    }
  assert.equal((await call(d, 'DELETE', '/api/w0/previews', { client: v })).status, 405);
  assert.equal((await call(d, 'POST', '/api/w0/readiness', { client: v, body: {} })).status, 405);
  assert.equal((await call(d, 'POST', '/api/w0/audit', { client: v, body: {} })).status, 405); // audit has no write route
});
test('audit filters over HTTP: unknown, duplicated and path-like parameters are rejected', async () => {
  const d = fresh();
  const v = await login(d, 'dev-viewer');
  for (const q of ['?file=../../x', '?actor=a&actor=b', '?type=bogus', '?from=today', '?actor=..%2F..%2Fetc'])
    assert.equal((await call(d, 'GET', `/api/w0/audit${q}`, { client: v })).status, 400, q);
  assert.equal((await call(d, 'GET', '/api/w0/audit?operation=deploy', { client: v })).status, 200);
});
test('errors never leak paths, stack frames or environment values', async () => {
  const d = fresh();
  const v = await login(d, 'dev-requester');
  const rs = [await call(d, 'POST', '/api/w0/previews', { client: v, raw: '{' }), await call(d, 'POST', '/api/w0/previews', { client: v, body: { requestId: 'x', operation: 'rm -rf' } }), await call(d, 'GET', '/api/w0/nothing', { client: v })];
  for (const r of rs) assert.ok(!/[A-Za-z]:\\|\/Users\/|\bat \S+ \(|node_modules|LOCALAPPDATA|PATH=/.test(r.text), r.text);
});
test('rate limiting engages', () => {
  const rl = new RateLimiter(3, 1000);
  assert.deepEqual([0, 1, 2, 3].map((i) => rl.allow('k', 100 + i)), [true, true, true, false]);
  assert.equal(rl.allow('other', 100), true);
  assert.equal(rl.allow('k', 5000), true);
});
test('response headers: no store, no CORS', async () => {
  const d = fresh();
  const v = await login(d, 'dev-viewer');
  const r = await call(d, 'GET', '/api/w0/readiness', { client: v });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
test('an expired session is refused', async () => {
  let t = T0;
  const d = buildDeps({ NODE_ENV: 'test' }, () => t);
  const v = await login(d, 'dev-viewer');
  t += 31 * 60_000;
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: v })).status, 401);
});
