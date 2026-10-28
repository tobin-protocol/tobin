// The Console's request guards, Content Security Policy and header constants: pure functions, no framework, no bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedHosts, allowedOrigins, buildCsp, checkRequest, configuredPort, DEFAULT_PORT, MAX_BODY_BYTES, readJsonBody, SECURITY_HEADERS } from '../lib/server/guards.ts';
import config from '../next.config.ts';

const base = { method: 'GET', pathname: '/api/bootstrap', host: '127.0.0.1:8787', origin: null, contentType: null, port: 8787 };

test('only 127.0.0.1:PORT and localhost:PORT are accepted as Host, for every path', () => {
  assert.deepEqual([...allowedHosts(8787)].sort(), ['127.0.0.1:8787', 'localhost:8787']);
  for (const pathname of ['/', '/api/bootstrap', '/_next/static/a.js']) {
    assert.equal(checkRequest({ ...base, pathname }), null);
    assert.equal(checkRequest({ ...base, pathname, host: 'localhost:8787' }), null);
  }
  for (const host of [null, '', 'evil.example', 'evil.example:8787', 'localhost.evil.example', '127.0.0.1', '127.0.0.1:8788', '0.0.0.0:8787', '[::1]:8787']) {
    for (const pathname of ['/', '/api/rpc', '/_next/static/a.js']) assert.deepEqual(checkRequest({ ...base, pathname, host }), { status: 403, body: 'forbidden host' }, `${host} ${pathname}`);
  }
});

test('a foreign Origin is refused on the API only; the page itself may be requested by any origin the browser reports', () => {
  assert.deepEqual([...allowedOrigins(8787)].sort(), ['http://127.0.0.1:8787', 'http://localhost:8787']);
  assert.deepEqual(checkRequest({ ...base, origin: 'http://evil.example' }), { status: 403, body: 'forbidden origin' });
  assert.deepEqual(checkRequest({ ...base, origin: 'null' }), { status: 403, body: 'forbidden origin' });
  assert.deepEqual(checkRequest({ ...base, origin: 'https://127.0.0.1:8787' }), { status: 403, body: 'forbidden origin' });
  assert.equal(checkRequest({ ...base, origin: 'http://127.0.0.1:8787' }), null);
  assert.equal(checkRequest({ ...base, origin: 'http://localhost:8787' }), null);
  assert.equal(checkRequest({ ...base, pathname: '/', origin: 'http://evil.example' }), null);
});

test('a POST must declare application/json; the check is case-insensitive and allows parameters', () => {
  const post = { ...base, method: 'POST', pathname: '/api/rpc' };
  assert.deepEqual(checkRequest({ ...post, contentType: null }), { status: 415, body: 'application/json required' });
  assert.deepEqual(checkRequest({ ...post, contentType: 'text/plain' }), { status: 415, body: 'application/json required' });
  assert.deepEqual(checkRequest({ ...post, contentType: 'application/x-www-form-urlencoded' }), { status: 415, body: 'application/json required' });
  assert.equal(checkRequest({ ...post, contentType: 'application/json' }), null);
  assert.equal(checkRequest({ ...post, contentType: 'Application/JSON; charset=utf-8' }), null);
  assert.equal(checkRequest({ ...base, contentType: null }), null); // GET needs no body type
});

test('the host check comes first, then the origin check, then the content-type check', () => {
  const all = { ...base, method: 'POST', pathname: '/api/rpc', host: 'evil.example', origin: 'http://evil.example', contentType: 'text/plain' };
  assert.equal(checkRequest(all)?.status, 403);
  assert.equal(checkRequest(all)?.body, 'forbidden host');
  assert.equal(checkRequest({ ...all, host: '127.0.0.1:8787' })?.body, 'forbidden origin');
  assert.equal(checkRequest({ ...all, host: '127.0.0.1:8787', origin: null })?.status, 415);
});

test('the port comes from PORT, defaults to 8787 and ignores garbage', () => {
  assert.equal(configuredPort({}), DEFAULT_PORT);
  assert.equal(configuredPort({ PORT: '9001' }), 9001);
  for (const bad of ['0', '-1', '70000', 'abc', '8787.5', '']) assert.equal(configuredPort({ PORT: bad }), bad === '' ? DEFAULT_PORT : DEFAULT_PORT, bad);
});

const json = (body: string, headers: Record<string, string> = {}): Request => new Request('http://127.0.0.1:8787/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

test('the body limit is exactly 1,000,000 bytes and is enforced while streaming', async () => {
  assert.equal(MAX_BODY_BYTES, 1_000_000);
  assert.deepEqual(await readJsonBody(json('{"a":1}')), { a: 1 });
  assert.deepEqual(await readJsonBody(json('')), {});
  const exactly = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES - '{"pad":""}'.length) });
  assert.equal(Buffer.byteLength(exactly), MAX_BODY_BYTES);
  assert.equal(((await readJsonBody(json(exactly))) as { pad: string }).pad.length, MAX_BODY_BYTES - 10);
  const over = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES - 9) });
  assert.equal(Buffer.byteLength(over), MAX_BODY_BYTES + 1);
  await assert.rejects(readJsonBody(json(over)), /request too large/);
  // a lying Content-Length cannot hide a large body (the real size is counted), and an honest large one is refused up front
  await assert.rejects(readJsonBody(new Request('http://127.0.0.1:8787/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '5' }, body: over })), /request too large/);
  await assert.rejects(readJsonBody(json('{}', { 'content-length': String(MAX_BODY_BYTES + 1) })), /request too large/);
  await assert.rejects(readJsonBody(json('{not json')), SyntaxError);
});

test('the Content Security Policy carries the nonce, forbids framing, and has no unsafe-inline or (outside development) unsafe-eval', () => {
  const csp = buildCsp('abc123==', false);
  for (const directive of ["default-src 'self'", "script-src 'self' 'nonce-abc123==' 'strict-dynamic'", "style-src 'self' 'nonce-abc123=='", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"]) {
    assert.ok(csp.split('; ').includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  assert.match(buildCsp('n', true), /'unsafe-eval'/);
  assert.doesNotMatch(buildCsp('n', true), /unsafe-inline/);
  assert.notEqual(buildCsp('a', false), buildCsp('b', false));
});

test('the static security headers are exactly the three expected ones and next.config.ts serves the same list on every path', async () => {
  assert.deepEqual(SECURITY_HEADERS.map((h) => `${h.key}: ${h.value}`).sort(), ['Referrer-Policy: no-referrer', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY']);
  const rules = await (config.headers as () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>)();
  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.source, '/:path*');
  assert.deepEqual(rules[0]?.headers, SECURITY_HEADERS);
  assert.deepEqual(config.transpilePackages, ['tobin-mvp1-sdk']);
  assert.equal(config.poweredByHeader, false);
});
