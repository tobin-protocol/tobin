// Development-authentication boundary, sessions, cookies and trusted-hash tests (HTTP level, in memory, mock adapter only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeps, decideDevIdp, HOSTED_ENV_MARKERS, MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../lib/w0/deps.ts';
import { handleW0 } from '../lib/w0/http.ts';
import type { HttpDeps } from '../lib/w0/http.ts';
import { T0, uuid } from './w0-helpers.ts';

interface Client { cookie: string; csrf: string }
async function call(deps: HttpDeps, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; client?: Client } = {}) {
  const headers: Record<string, string> = { host: '127.0.0.1:8787', ...(opts.headers ?? {}) };
  if (opts.client) { headers['cookie'] = opts.client.cookie; if (method !== 'GET') headers['x-w0-csrf'] = opts.client.csrf; }
  if (opts.body !== undefined || method === 'POST') headers['content-type'] = 'application/json';
  const res = await handleW0(new Request(`http://127.0.0.1:8787${path}`, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) }), deps);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* plain text */ }
  return { status: res.status, json, text, headers: res.headers };
}
async function login(deps: HttpDeps, subject: string): Promise<Client> {
  const r = await call(deps, 'POST', '/api/w0/session', { body: { subject } });
  assert.equal(r.status, 200, r.text);
  return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0] as string, csrf: r.json['csrf'] as string };
}
const fresh = (extra: Record<string, string> = {}, now: () => number = () => T0): HttpDeps => buildDeps({ NODE_ENV: 'test', ...extra }, now);

test('decideDevIdp: local development allowed; production refused by default; override only for non-hosted production', () => {
  assert.equal(decideDevIdp({ NODE_ENV: 'development' }).allowed, true);
  assert.equal(decideDevIdp({ NODE_ENV: 'test' }).allowed, true);
  assert.equal(decideDevIdp({ NODE_ENV: 'production' }).allowed, false);
  assert.equal(decideDevIdp({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '0' }).allowed, false);
  assert.equal(decideDevIdp({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: 'true' }).allowed, false); // only the exact value 1
  assert.equal(decideDevIdp({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '1' }).allowed, true);
});
test('a hosted environment refuses the development identity provider in every mode, even with the override', () => {
  for (const marker of HOSTED_ENV_MARKERS) {
    for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '1' }, { W0_ALLOW_DEV_IDP: '1' }]) {
      const d = decideDevIdp({ ...env, [marker]: '1' });
      assert.equal(d.allowed, false, `${marker} ${JSON.stringify(env)}`);
      assert.match(d.reason, /hosted/);
    }
  }
});
test('hosted deployment: nobody can sign in and the sign-in page says why', async () => {
  const d = buildDeps({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '1', VERCEL: '1' }, () => T0);
  assert.equal((await call(d, 'POST', '/api/w0/session', { body: { subject: 'dev-approver' } })).status, 403);
  const s = await call(d, 'GET', '/api/w0/session');
  assert.equal(s.json['idp'], 'NONE');
  assert.match(String(s.json['idpNote']), /hosted/);
  assert.deepEqual(s.json['choices'], []);
});
test('production without the override: no identity provider, no sign-in', async () => {
  const d = buildDeps({ NODE_ENV: 'production' }, () => T0);
  assert.equal((await call(d, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' } })).status, 403);
  assert.equal((await call(d, 'GET', '/api/w0/readiness')).status, 401);
});
test('the development provider is always labelled DEVELOPMENT, also when explicitly enabled in a production build', async () => {
  const d = buildDeps({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '1' }, () => T0);
  assert.equal((await call(d, 'GET', '/api/w0/session')).json['idp'], 'DEVELOPMENT');
  const r = await call(d, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' } });
  assert.equal(r.json['idp'], 'DEVELOPMENT');
});
test('cookie attributes: production Secure+HttpOnly+SameSite=Strict; local development over plain HTTP omits only Secure', async () => {
  const prod = buildDeps({ NODE_ENV: 'production', W0_ALLOW_DEV_IDP: '1' }, () => T0);
  const c = (await call(prod, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' } })).headers.get('set-cookie') ?? '';
  for (const a of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/', 'Max-Age=1800']) assert.ok(c.includes(a), `${a} missing in ${c}`);
  const dev = buildDeps({ NODE_ENV: 'development' }, () => T0);
  const cd = (await call(dev, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' } })).headers.get('set-cookie') ?? '';
  assert.ok(cd.includes('HttpOnly') && cd.includes('SameSite=Strict') && !cd.includes('Secure'));
  const out = await login(prod, 'dev-viewer');
  const del = (await call(prod, 'DELETE', '/api/w0/session', { client: out })).headers.get('set-cookie') ?? '';
  assert.ok(del.includes('Secure') && del.includes('Max-Age=0') && del.includes('HttpOnly'));
});
test('session ids are unpredictable and unique; sign-in always issues a fresh session (no fixation)', async () => {
  const d = fresh();
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const r = await call(d, 'POST', '/api/w0/session', { body: { subject: 'dev-viewer' }, headers: { cookie: 'w0_session=attacker-chosen' } });
    const id = (r.headers.get('set-cookie') ?? '').split(';')[0]?.split('=')[1] ?? '';
    assert.match(id, /^[0-9a-f]{64}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 20);
});
test('forged, empty or malformed session cookies are not sessions', async () => {
  const d = fresh();
  for (const cookie of ['w0_session=' + 'a'.repeat(64), 'w0_session=', 'w0_session=../../x', 'other=1']) assert.equal((await call(d, 'GET', '/api/w0/readiness', { headers: { cookie } })).status, 401);
});
test('session expiry is enforced server side', async () => {
  let t = T0;
  const d = fresh({}, () => t);
  const c = await login(d, 'dev-viewer');
  t += 29 * 60_000;
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: c })).status, 200);
  t += 2 * 60_000;
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: c })).status, 401);
});
test('logout invalidates the session server side: the old cookie stops working even if replayed', async () => {
  const d = fresh();
  const c = await login(d, 'dev-requester');
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: c })).status, 200);
  assert.equal((await call(d, 'DELETE', '/api/w0/session', { client: c })).status, 200);
  assert.equal((await call(d, 'GET', '/api/w0/readiness', { client: c })).status, 401);
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: c, body: { requestId: uuid(), operation: 'deploy' } })).status, 401);
});
test('CSRF: a valid session cookie without (or with a wrong or another session\'s) token cannot change state', async () => {
  const d = fresh();
  const a = await login(d, 'dev-requester');
  const b = await login(d, 'dev-requester-2');
  const body = { requestId: uuid(), operation: 'deploy' };
  for (const csrf of ['', 'wrong', b.csrf]) {
    const r = await handleW0(new Request('http://127.0.0.1:8787/api/w0/previews', { method: 'POST', headers: { host: '127.0.0.1:8787', cookie: a.cookie, 'content-type': 'application/json', 'x-w0-csrf': csrf }, body: JSON.stringify(body) }), d);
    assert.equal(r.status, 403);
  }
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: a, body })).status, 201);
});
test('unknown identities and roles fail closed at sign-in', async () => {
  const d = fresh();
  for (const body of [{ subject: 'root' }, { subject: 'dev-approver', role: 'admin' }, { subject: ['dev-viewer'] }, { subject: 'DEV-VIEWER' }, { subject: 'operator' }])
    assert.equal((await call(d, 'POST', '/api/w0/session', { body })).status, 401);
});
test('authentication is separate from authorization: a valid viewer session is denied write routes and the denial is audited', async () => {
  const d = fresh();
  const v = await login(d, 'dev-viewer');
  assert.equal((await call(d, 'POST', '/api/w0/previews', { client: v, body: { requestId: uuid(), operation: 'deploy' } })).status, 403);
  assert.equal((await call(d, 'POST', '/api/w0/approvals', { client: v, body: {} })).status, 403);
  const a = await call(d, 'GET', '/api/w0/audit?type=auth_denied', { client: v });
  assert.equal((a.json['events'] as unknown[]).length, 2);
});
test('anonymous traffic is capped before it can write audit events', async () => {
  const d = fresh();
  let last = 0;
  for (let i = 0; i < 40; i++) last = (await call(d, 'GET', '/api/w0/readiness')).status;
  assert.equal(last, 429);
  const v = await login(d, 'dev-viewer');
  assert.ok(((await call(d, 'GET', '/api/w0/audit?type=auth_denied', { client: v })).json['events'] as unknown[]).length <= 30);
});
test('every data response is labelled mock', async () => {
  const d = fresh({ W0_MOCK_SCENARIO: 'ok' });
  const r = await login(d, 'dev-requester');
  for (const p of ['/api/w0/readiness', '/api/w0/previews', '/api/w0/approvals', '/api/w0/audit']) assert.equal((await call(d, 'GET', p, { client: r })).json['origin'], 'mock', p);
  const pv = await call(d, 'POST', '/api/w0/previews', { client: r, body: { requestId: uuid(), operation: 'mint-D' } });
  assert.equal(pv.json['origin'], 'mock');
  assert.equal((pv.json['preview'] as { origin: string }).origin, 'mock');
  assert.equal(((await call(d, 'GET', '/api/w0/readiness', { client: r })).json['report'] as { source: string }).source, 'mock');
});
test('the browser cannot influence the trusted expected hashes: they are claims, compared exactly, lowercase only, extra fields rejected', async () => {
  const d = fresh({ W0_MOCK_SCENARIO: 'ok' });
  const r = await login(d, 'dev-requester');
  const a = await login(d, 'dev-approver');
  const pid = uuid();
  await call(d, 'POST', '/api/w0/previews', { client: r, body: { requestId: pid, operation: 'deploy' } });
  const evil = 'e'.repeat(64);
  const base = { approvalId: uuid(), previewRequestId: pid, operation: 'deploy', requestedBy: 'dev-requester', approvedBy: 'dev-approver', approvedAt: '2026-11-06T12:00:00Z', expiresAt: '2026-11-06T13:00:00Z' };
  const post = (extra: Record<string, unknown>) => call(d, 'POST', '/api/w0/approvals', { client: a, body: { ...base, ...extra } });
  assert.equal((await post({ baselineHash: evil, configSha256: MOCK_CONFIG_SHA256, expectedBaselineHash: evil })).status, 400);
  assert.equal((await post({ baselineHash: evil, configSha256: MOCK_CONFIG_SHA256 })).status, 400);
  assert.equal((await post({ baselineHash: MOCK_BASELINE_HASH.toUpperCase(), configSha256: MOCK_CONFIG_SHA256 })).status, 400);
  assert.equal((await post({ baselineHash: MOCK_BASELINE_HASH, configSha256: evil })).status, 400);
  assert.equal((await post({ baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256 })).status, 201);
});
