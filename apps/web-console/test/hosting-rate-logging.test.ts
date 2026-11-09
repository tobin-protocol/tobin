// Hosting hardening: IP-aware rate limits on the trusted forwarded address, the wallet challenge domain, structured logging and its redaction.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { handleAuth, IP_LIMITS, MAX_CONCURRENT_HASHES, challengeDomain, trustedClientIp } from '../lib/auth/http.ts';
import { REQUEST_HEADER } from '../lib/registry/http.ts';
import { CLIENT_IP_HEADER } from '../lib/server/config.ts';
import { log, redact, requestIdOf, routeLabel, scrubText, setLogWriter, withRequestLog } from '../lib/server/log.ts';
import { makeBackend, PASSWORD } from './backend-helpers.ts';

const HOSTED = { TOBIN_DEPLOYMENT_MODE: 'hosted', TOBIN_PUBLIC_ORIGIN: 'https://app.example.org' };
const saved: Record<string, string | undefined> = {};
function hosted(on: boolean): void {
  for (const k of Object.keys(HOSTED)) { if (!(k in saved)) saved[k] = process.env[k]; if (on) process.env[k] = (HOSTED as Record<string, string>)[k]; else delete process.env[k]; }
}
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } setLogWriter(); });

const post = (path: string, body: unknown, ip?: string, extra: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:8787/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', [REQUEST_HEADER]: '1', ...(ip ? { [CLIENT_IP_HEADER]: ip } : {}), ...extra }, body: JSON.stringify(body) });

test('the forwarded client address is trusted only in hosted mode and only when well formed', () => {
  hosted(false);
  assert.equal(trustedClientIp(post('login', {}, '1.2.3.4')), null, 'local mode: a client-supplied header is never trusted');
  hosted(true);
  assert.equal(trustedClientIp(post('login', {}, '1.2.3.4')), '1.2.3.4');
  assert.equal(trustedClientIp(post('login', {}, 'not an ip')), null);
  assert.equal(trustedClientIp(post('login', {})), null);
});

test('login: failed attempts from one address are limited per address, other addresses are unaffected', async () => {
  hosted(true);
  const { b } = makeBackend();
  const deps = { auth: b.auth, secureCookies: true };
  const max = IP_LIMITS.login.max;
  // different emails, so only the per-address limit can trip (the per-user limit is 5 per email)
  for (let i = 0; i < max; i++) {
    const r = await handleAuth(post('login', { email: `nobody${i}@example.test`, password: PASSWORD }, '203.0.113.9'), deps);
    assert.equal(r.status, 401, `attempt ${i}`);
  }
  const blocked = await handleAuth(post('login', { email: 'someone@example.test', password: PASSWORD }, '203.0.113.9'), deps);
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as { error: string }).error, 'RATE_LIMITED');
  const other = await handleAuth(post('login', { email: 'someone@example.test', password: PASSWORD }, '203.0.113.10'), deps);
  assert.equal(other.status, 401, 'a different address is not limited');
  const noIp = await handleAuth(post('login', { email: 'someone@example.test', password: PASSWORD }), deps);
  assert.equal(noIp.status, 401, 'no forwarded address: no shared bucket, no lockout of everyone');
});

test('login: successful sign-ins do not count against the address', async () => {
  hosted(true);
  const { b } = makeBackend();
  await b.auth.register({ email: 'ok@example.test', password: PASSWORD, displayName: 'Ok' });
  const deps = { auth: b.auth, secureCookies: true };
  for (let i = 0; i < IP_LIMITS.login.max + 3; i++) assert.equal((await handleAuth(post('login', { email: 'ok@example.test', password: PASSWORD }, '198.51.100.7'), deps)).status, 200, String(i));
});

test('register: attempts are limited per address, counted whether or not they succeed', async () => {
  hosted(true);
  const { b } = makeBackend();
  const deps = { auth: b.auth, secureCookies: true };
  const max = IP_LIMITS.register.max;
  for (let i = 0; i < max; i++) {
    const r = await handleAuth(post('register', { email: `u${i}@example.test`, password: PASSWORD, displayName: `U${i}` }, '203.0.113.20'), deps);
    assert.ok(r.status === 201 || r.status === 409, `attempt ${i}: ${r.status}`);
  }
  assert.equal((await handleAuth(post('register', { email: 'late@example.test', password: PASSWORD, displayName: 'Late' }, '203.0.113.20'), deps)).status, 429);
  assert.equal((await handleAuth(post('register', { email: 'late@example.test', password: PASSWORD, displayName: 'Late' }, '203.0.113.21'), deps)).status, 201);
});

test('wallet challenges are limited per address and bound to the configured public domain, not the internal Host', async () => {
  hosted(true);
  const { b } = makeBackend();
  const deps = { auth: b.auth, secureCookies: true };
  const key = 'GCDZWEMJZPTA62CFDYNSJPULOZOTU4FAGDSPGO6I2FYUAFDTN34ZAHWS';
  const first = await handleAuth(post('wallet/challenge', { publicKey: key, network: 'testnet' }, '203.0.113.30', { host: 'console.railway.internal:8787' }), deps);
  assert.equal(first.status, 201);
  const c = ((await first.json()) as { challenge: { message: string; domain?: string } }).challenge;
  assert.match(JSON.stringify(c), /app\.example\.org/);
  assert.doesNotMatch(JSON.stringify(c), /railway\.internal/);
  assert.equal(challengeDomain(post('x', {}, undefined, { host: 'console.railway.internal:8787' })), 'app.example.org');
  hosted(false);
  assert.equal(challengeDomain(new Request('http://127.0.0.1:8787/x', { headers: { host: '127.0.0.1:8787' } })), '127.0.0.1:8787', 'local mode is unchanged');
  hosted(true);
  for (let i = 0; i < IP_LIMITS['wallet-challenge'].max; i++) await handleAuth(post('wallet/challenge', { publicKey: key, network: 'testnet' }, '203.0.113.31'), deps);
  assert.equal((await handleAuth(post('wallet/challenge', { publicKey: key, network: 'testnet' }, '203.0.113.31'), deps)).status, 429);
});

test('password hashing is bounded: only a few at once', () => { assert.ok(MAX_CONCURRENT_HASHES >= 1 && MAX_CONCURRENT_HASHES <= 8); });

test('redaction: sensitive field names, tokens, secrets, emails and long text never reach a log line', () => {
  const lines: string[] = [];
  setLogWriter((_l, line) => lines.push(line));
  const secretKey = 'S' + 'A'.repeat(55);
  log('warn', 'test.event', {
    password: 'hunter2hunter2', token: 'abc', sessionToken: 'zzz', cookie: 'tobin_session=abcdef', authorization: 'Bearer abcdef', signature: 'c2lnbmF0dXJl', rawSignature: 'x',
    privateKey: secretKey, seedPhrase: 'one two three', invitationCode: 'inv_ABCDEF', email: 'person@example.org', nested: { deep: { apiKey: 'k', ok: 'visible' } },
    message: `failed for person@example.org with ${secretKey} and token ${'t'.repeat(40)}`, status: 401, longText: 'x'.repeat(500),
  });
  const line = lines[0] as string;
  const o = JSON.parse(line) as Record<string, any>;
  for (const needle of ['hunter2', 'abcdef', 'c2lnbmF0', secretKey, 'one two three', 'inv_ABCDEF', 'person@example.org', 'zzz', 'tttttttttttttttt']) assert.ok(!line.includes(needle), `leaked: ${needle}`);
  assert.equal(o.password, '[redacted]'); assert.equal(o.cookie, '[redacted]'); assert.equal(o.privateKey, '[redacted]'); assert.equal(o.nested.deep.apiKey, '[redacted]');
  assert.equal(o.nested.deep.ok, 'visible');
  assert.equal(o.status, 401);
  assert.ok(o.longText.length <= 203);
  assert.match(o.message, /redacted/);
  assert.equal(o.event, 'test.event'); assert.equal(o.level, 'warn'); assert.ok(o.ts);
  assert.equal(scrubText('hello'), 'hello');
  assert.deepEqual(redact(new Error('bad token ' + 'q'.repeat(40))), { name: 'Error', message: 'bad token [redacted-long-token]' });
});

test('a UUID request id survives redaction, a malformed one does not', () => {
  const lines: string[] = [];
  setLogWriter((_l, line) => lines.push(line));
  const id = '7abaa172-b86d-41bd-8496-c5f26e3d831b';
  log('info', 'x', { requestId: id });
  log('info', 'x', { requestId: 'a b c ' + 'q'.repeat(60) });
  assert.equal(JSON.parse(lines[0] as string).requestId, id);
  assert.notEqual(JSON.parse(lines[1] as string).requestId, 'a b c ' + 'q'.repeat(60));
});

test('a failing log writer never breaks the request', () => {
  setLogWriter(() => { throw new Error('disk full'); });
  assert.doesNotThrow(() => log('info', 'x', {}));
});

test('route labels mask identifiers', () => {
  assert.equal(routeLabel('/api/registry/orgs/org_abc/sessions/' + 'a'.repeat(64) + '/calculate'), '/api/registry/orgs/:id/sessions/:id/calculate');
  assert.equal(routeLabel('/api/auth/login'), '/api/auth/login');
  assert.doesNotMatch(routeLabel('/api/registry/orgs/org_secret1/invitations/i_9/revoke'), /secret1|i_9/);
});

test('request logging records id, route, status, duration and the error code, never the body, and echoes the request id', async () => {
  const lines: string[] = [];
  setLogWriter((_l, line) => lines.push(line));
  const handler = withRequestLog(async (req: Request) => {
    await req.text();
    return new Response(JSON.stringify({ error: 'FORBIDDEN', message: 'nope' }), { status: 403, headers: { 'content-type': 'application/json' } });
  });
  const res = await handler(new Request('http://x/api/registry/orgs/org_1/members/u9/role', { method: 'POST', headers: { 'x-request-id': 'req-12345678' }, body: JSON.stringify({ password: 'hunter2hunter2', role: 'admin' }) }), undefined);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('x-request-id'), 'req-12345678');
  assert.equal(((await res.json()) as { error: string }).error, 'FORBIDDEN', 'the response body is intact after logging');
  const o = JSON.parse(lines[0] as string) as Record<string, any>;
  assert.deepEqual([o.event, o.level, o.status, o.failure, o.requestId, o.method, o.route], ['http.refused', 'warn', 403, 'FORBIDDEN', 'req-12345678', 'POST', '/api/registry/orgs/:id/members/:id/role']);
  assert.equal(typeof o.durationMs, 'number');
  assert.ok(!lines[0]!.includes('hunter2'));
  assert.notEqual(requestIdOf(new Request('http://x', { headers: { 'x-request-id': 'bad id!' } })), 'bad id!');
});

test('an unhandled handler error is logged without its stack and answered with a plain 500', async () => {
  const lines: string[] = [];
  setLogWriter((_l, line) => lines.push(line));
  const res = await withRequestLog(async () => { throw new Error('db exploded for person@example.org'); })(new Request('http://x/api/auth/me'), undefined);
  assert.equal(res.status, 500);
  const o = JSON.parse(lines[0] as string) as Record<string, any>;
  assert.equal(o.event, 'http.unhandled'); assert.equal(o.level, 'error');
  assert.ok(!lines[0]!.includes('person@example.org') && !lines[0]!.includes('stack'));
});
