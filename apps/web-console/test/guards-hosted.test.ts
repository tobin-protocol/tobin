// Hosted-mode request guards: configurable, fail-closed Host and Origin allow-lists, the served-path allow-list, the shared proxy secret, and startup validation.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { clientIpFromForwarded, hostedProblems, isHosted, parseHostList, parseOriginList, PROXY_AUTH_HEADER, proxySecretMatches, securityPolicy } from '../lib/server/config.ts';
import { checkRequest } from '../lib/server/guards.ts';

const SECRET = 's'.repeat(40);
const env = {
  TOBIN_DEPLOYMENT_MODE: 'hosted', NODE_ENV: 'production', TOBIN_ALLOWED_HOSTS: 'console.railway.internal:8787', TOBIN_HEALTH_HOSTS: 'healthcheck.railway.app',
  TOBIN_PROXY_SECRET: SECRET, TOBIN_PUBLIC_ORIGIN: 'https://app.example.org', TOBIN_DB_PATH: '/data/tobin.sqlite',
};
const policy = securityPolicy(env, 8787);
const base = { method: 'GET', pathname: '/api/registry/orgs', host: 'console.railway.internal:8787', origin: null, contentType: null, port: 8787, policy, proxyAuth: SECRET };

test('local mode is unchanged: loopback only, no policy needed', () => {
  assert.equal(isHosted({}), false);
  const local = securityPolicy({}, 8787);
  assert.deepEqual([...local.hosts].sort(), ['127.0.0.1:8787', 'localhost:8787']);
  assert.equal(checkRequest({ method: 'GET', pathname: '/', host: '127.0.0.1:8787', origin: null, contentType: null, port: 8787, policy: local }), null);
  assert.equal(checkRequest({ method: 'GET', pathname: '/', host: 'console.railway.internal:8787', origin: null, contentType: null, port: 8787, policy: local })?.status, 403);
});

test('hosted: only the configured host is accepted; loopback and unknown hosts are refused', () => {
  assert.equal(checkRequest(base), null);
  for (const host of ['127.0.0.1:8787', 'localhost:8787', 'evil.example', 'console.railway.internal', 'console.railway.internal:9999', null]) {
    assert.deepEqual(checkRequest({ ...base, host }), { status: 403, body: 'forbidden host' }, String(host));
  }
  assert.equal(checkRequest({ ...base, host: 'Console.Railway.Internal:8787' }), null, 'host comparison is case-insensitive');
});

test('hosted: an unset or empty allow-list accepts nothing', () => {
  const empty = securityPolicy({ TOBIN_DEPLOYMENT_MODE: 'hosted' }, 8787);
  assert.equal(empty.hosts.size, 0);
  assert.equal(checkRequest({ ...base, policy: empty })?.status, 403);
});

test('hosted: the platform probe host is accepted for probe paths only', () => {
  for (const pathname of ['/api/health', '/api/live', '/api/ready']) assert.equal(checkRequest({ ...base, pathname, host: 'healthcheck.railway.app', proxyAuth: null }), null, pathname);
  assert.deepEqual(checkRequest({ ...base, pathname: '/api/registry/orgs', host: 'healthcheck.railway.app' }), { status: 403, body: 'forbidden host' });
  assert.deepEqual(checkRequest({ ...base, pathname: '/api/auth/me', host: 'healthcheck.railway.app' }), { status: 403, body: 'forbidden host' });
  assert.equal(checkRequest({ ...base, pathname: '/api/live/extra', host: 'healthcheck.railway.app' })?.status, 403);
});

test('hosted: only the institutional API and the probes are served; every development surface is refused', () => {
  for (const pathname of ['/api/auth/me', '/api/registry/orgs', '/api/health', '/api/live', '/api/ready']) assert.equal(checkRequest({ ...base, pathname }), null, pathname);
  for (const pathname of ['/', '/w0', '/api/rpc', '/api/bootstrap', '/api/w0/anything', '/api/stellar/run', '/api/stellar/cosign', '/api/stellar/validation', '/wallet-check', '/settle-run', '/sign-in', '/_next/static/a.js', '/api/authx', '/api/registryx']) {
    assert.deepEqual(checkRequest({ ...base, pathname }), { status: 404, body: 'not found' }, pathname);
  }
});

test('hosted: every route handler in app/api is either served on purpose or refused', () => {
  const root = new URL('../app/api', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const routes: string[] = [];
  const walk = (d: string): void => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === 'route.ts') routes.push('/' + relative(join(root, '..'), join(p, '..')).split('\\').join('/').replace(/\/\[\.\.\.path\]$/, '/x')); } };
  walk(root);
  const served = new Set(['/api/auth/x', '/api/public/x', '/api/registry/x', '/api/health', '/api/live', '/api/ready']);
  assert.ok(routes.length >= 9, 'found the route handlers: ' + routes.join(', '));
  for (const r of routes) {
    const refusal = checkRequest({ ...base, pathname: r });
    if (served.has(r)) assert.equal(refusal, null, r); else assert.deepEqual(refusal, { status: 404, body: 'not found' }, r);
  }
});

test('hosted: the proxy secret is required for every non-probe request and compared exactly', () => {
  for (const proxyAuth of [null, '', 'wrong', SECRET + 'x', SECRET.slice(1)]) assert.deepEqual(checkRequest({ ...base, proxyAuth }), { status: 403, body: 'forbidden' }, String(proxyAuth));
  assert.equal(proxySecretMatches(SECRET, SECRET), true);
  assert.equal(proxySecretMatches('x', null), false);
  assert.equal(PROXY_AUTH_HEADER, 'x-tobin-proxy-auth');
  assert.equal(checkRequest({ ...base, pathname: '/api/live', proxyAuth: null }), null);
});

test('hosted: Origin and content type', () => {
  assert.deepEqual(checkRequest({ ...base, origin: 'https://evil.example' }), { status: 403, body: 'forbidden origin' });
  assert.deepEqual(checkRequest({ ...base, origin: 'null' }), { status: 403, body: 'forbidden origin' });
  const withOrigin = securityPolicy({ ...env, TOBIN_ALLOWED_ORIGINS: 'https://app.example.org' }, 8787);
  assert.equal(checkRequest({ ...base, policy: withOrigin, origin: 'https://app.example.org' }), null);
  assert.equal(checkRequest({ ...base, policy: withOrigin, origin: 'https://app.example.org.evil.example' })?.status, 403);
  assert.deepEqual(checkRequest({ ...base, method: 'POST', contentType: 'text/plain' }), { status: 415, body: 'application/json required' });
  assert.equal(checkRequest({ ...base, method: 'POST', contentType: 'application/json' }), null);
});

test('parsing: hosts and origins are exact; wildcards, schemes and paths are invalid', () => {
  assert.deepEqual(parseHostList(' A.example:8787 , b.internal ,,').hosts, ['a.example:8787', 'b.internal']);
  assert.deepEqual(parseHostList('*.example, https://x, a/b, a b').invalid.length, 4);
  assert.deepEqual(parseOriginList('https://app.example.org, https://x.example:8443/').origins, ['https://app.example.org', 'https://x.example:8443']);
  assert.equal(parseOriginList('*, https://*.example, https://a/path, ftp://x, app.example, https://u:p@a.example').invalid.length, 6);
});

test('hosted startup validation names every missing or malformed setting and never prints a value', () => {
  assert.deepEqual(hostedProblems(env), []);
  assert.deepEqual(hostedProblems({}), [], 'local mode needs nothing');
  const problems = hostedProblems({ TOBIN_DEPLOYMENT_MODE: 'hosted', TOBIN_PROXY_SECRET: 'short-secret-value', TOBIN_ALLOWED_HOSTS: '*.bad', TOBIN_PUBLIC_ORIGIN: 'http://insecure.example' });
  const text = problems.join('\n');
  for (const needle of ['NODE_ENV', 'TOBIN_ALLOWED_HOSTS', 'TOBIN_PROXY_SECRET', 'TOBIN_PUBLIC_ORIGIN', 'TOBIN_DB_PATH']) assert.match(text, new RegExp(needle), needle);
  assert.doesNotMatch(text, /short-secret-value|insecure\.example|\*\.bad/);
  assert.ok(hostedProblems({ ...env, NODE_ENV: 'development' }).some((p) => /NODE_ENV/.test(p)));
  assert.ok(hostedProblems({ ...env, TOBIN_ALLOWED_ORIGINS: '*' }).some((p) => /TOBIN_ALLOWED_ORIGINS/.test(p)));
});

test('the trusted forwarded address is the last X-Forwarded-For entry, and only with exactly one trusted hop', () => {
  assert.equal(clientIpFromForwarded('1.2.3.4', 1), '1.2.3.4');
  assert.equal(clientIpFromForwarded('6.6.6.6, 1.2.3.4', 1), '1.2.3.4', 'client-supplied earlier entries are ignored');
  assert.equal(clientIpFromForwarded('1.2.3.4', 0), null, 'no trusted hop: nothing forwarded is trusted');
  assert.equal(clientIpFromForwarded('1.2.3.4', 2), null);
  assert.equal(clientIpFromForwarded(null, 1), null);
  assert.equal(clientIpFromForwarded('not an ip!', 1), null);
  assert.equal(clientIpFromForwarded('2001:DB8::1', 1), '2001:db8::1');
});
