// The Console as a running Next.js production server (`next start`), over real HTTP on 127.0.0.1 (no external network), plus the browser-side HTTP
// transport against it. Needs the Rust bridge and a production build (`npm run build` in this app). This does NOT test the React/DOM wiring in
// components/console-app.tsx: that is covered by the browser journey (test/browser/journey.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpTransport } from '../lib/console/http-transport.ts';
import { TobinClient } from 'tobin-mvp1-sdk/sdk';
import { fromHex } from 'tobin-mvp1-sdk/amount';
import { BRIDGE_EXE, SKIP } from '../../../packages/mvp1-sdk/test/bridge-env.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const nextBin = join(root, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const built = existsSync(join(root, '.next', 'BUILD_ID'));
const skip = SKIP || (built ? false : '.next is missing: run the production build first (npm run build in apps/web-console)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}

async function startServer(port: number): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, PORT: String(port), TOBIN_BRIDGE_EXE: BRIDGE_EXE as string, NODE_ENV: 'production' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 30000);
    child.stdout.on('data', (d: Buffer) => {
      if (String(d).includes('Ready')) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return child;
}

function raw(port: number, method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (d: Buffer) => (text += String(d)));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('the page, its scripts and the sandbox API are served locally with the security headers; unrelated files are not', { skip, timeout: 120000 }, async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = await startServer(port);
  try {
    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    // hardening headers: no framing by another site, no MIME sniffing, no referrer, and a per-request nonce policy that allows only same-origin resources
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
    const csp = home.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    assert.ok(nonce, 'the policy carries a nonce');
    const html = await home.text();
    assert.match(html, /<title>Tobin Console \(local sandbox\)<\/title>/);
    assert.match(html, /Everything here runs in a local sandbox on this machine/);
    assert.match(html, /id="app"/);
    assert.match(html, /id="error"[^>]*role="alert"/);
    assert.ok(html.includes(`nonce="${nonce}"`), 'Next.js applied the nonce to its inline scripts');
    // a fresh nonce for every document request
    const again = await fetch(`${base}/`);
    assert.notEqual(/'nonce-([^']+)'/.exec(again.headers.get('content-security-policy') ?? '')?.[1], nonce);
    await again.text();
    // a script of the page is served, as JavaScript, with the same static headers
    const scriptPath = /<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/.exec(html)?.[1];
    assert.ok(scriptPath, 'the page references its compiled scripts');
    const js = await fetch(base + (scriptPath as string));
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
    await js.arrayBuffer();
    // nothing outside the page and its build assets is served
    for (const p of ['/server.mjs', '/controller.ts', '/proxy.ts', '/next.config.ts', '/package.json', '/lib/console/controller.ts', '/lib/server/sandbox.ts', '/test/next-server.test.ts', '/_next/../package.json']) {
      assert.notEqual((await fetch(base + p)).status, 200, p);
    }
    // the browser bundles contain no Node-only code and no bridge configuration
    for (const f of walk(join(root, '.next', 'static')).filter((x) => x.endsWith('.js'))) {
      const text = readFileSync(f, 'utf8');
      assert.doesNotMatch(text, /node:(child_process|fs|readline|http)|TOBIN_BRIDGE_EXE/, f);
    }
    // only POST exists on /api/rpc
    assert.equal((await fetch(`${base}/api/rpc`)).status, 405);

    // bootstrap: five accounts, two capped tokens, a description that says what this world is
    const bootRes = await fetch(`${base}/api/bootstrap`);
    assert.equal(bootRes.headers.get('x-frame-options'), 'DENY');
    const boot = (await bootRes.json()) as { description: string; clearing: string; networkId: string; personas: { name: string; address: string }[]; tokens: { name: string; address: string; cap: string }[] };
    assert.equal(boot.personas.length, 5);
    assert.equal(boot.tokens.length, 2);
    assert.match(boot.description, /LOCAL SANDBOX/);
    assert.match(boot.description, /no network, no wallet/);

    // the browser transport: a full create / read / reject round trip through HTTP to the real contract
    const client = new TobinClient({ transport: new HttpTransport(`${base}/api/rpc`, boot.description), clearing: boot.clearing, networkId: fromHex(boot.networkId) });
    const alice = (boot.personas[0] as { address: string }).address;
    const bob = (boot.personas[1] as { address: string }).address;
    const sessionId = '5e'.repeat(32);
    const receipt = await client.createSession({ creator: alice, sessionId, token: (boot.tokens[0] as { address: string }).address, maxParticipants: 4, maxObligations: 16 });
    assert.match(receipt.ranOn, /LOCAL SANDBOX/);
    assert.equal((await client.getSession(sessionId)).state, 'Open');
    await assert.rejects(client.joinSession({ sessionId, participant: bob }, { authorize: [bob] }), /auth/i);
    await client.joinSession({ sessionId, participant: bob });
    assert.equal((await client.getSession(sessionId)).participants.length, 2);

    // an unknown contract address is refused by the server before it reaches the sandbox
    const bad = await fetch(`${base}/api/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ call: { contract: alice, fn: 'x', args: [], auths: [] }, authorize: null }) });
    assert.equal(bad.status, 400);
  } finally {
    server.kill();
  }
});

// ---- security regressions: a web page in the user's browser must not be able to drive the local sandbox ----

test('the local server refuses cross-origin writes, non-JSON bodies and foreign Host headers (CSRF and DNS rebinding)', { skip, timeout: 120000 }, async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = await startServer(port);
  try {
    const host = `127.0.0.1:${port}`;
    const boot = JSON.parse((await raw(port, 'GET', '/api/bootstrap', { host })).text) as { clearing: string };
    const body = JSON.stringify({ call: { contract: boot.clearing, fn: 'config', args: [], auths: [] }, authorize: null });
    // the legitimate request works
    const good = await raw(port, 'POST', '/api/rpc', { host, 'content-type': 'application/json', origin: `http://${host}`, 'content-length': String(Buffer.byteLength(body)) }, body);
    assert.equal(good.status, 200, good.text);
    // a "simple" cross-site request: text/plain needs no CORS preflight, so the server itself must refuse it
    const plain = await raw(port, 'POST', '/api/rpc', { host, 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(body)) }, body);
    assert.equal(plain.status, 415);
    // a request that names another origin
    const foreign = await raw(port, 'POST', '/api/rpc', { host, 'content-type': 'application/json', origin: 'http://evil.example', 'content-length': String(Buffer.byteLength(body)) }, body);
    assert.equal(foreign.status, 403);
    // refusals carry the static security headers too
    assert.equal(foreign.headers['x-frame-options'], 'DENY');
    assert.equal(foreign.headers['x-content-type-options'], 'nosniff');
    // an oversized body is refused (1,000,000 bytes at most)
    const huge = JSON.stringify({ call: { contract: boot.clearing, fn: 'config', args: ['x'.repeat(1_100_000)], auths: [] }, authorize: null });
    const big = await raw(port, 'POST', '/api/rpc', { host, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(huge)) }, huge);
    assert.equal(big.status, 500);
    assert.match(big.text, /request too large/);
    // DNS rebinding: the browser sends the attacker's host name
    for (const h of ['evil.example', `evil.example:${port}`, 'localhost.evil.example']) {
      assert.equal((await raw(port, 'GET', '/api/bootstrap', { host: h })).status, 403, h);
      assert.equal((await raw(port, 'GET', '/', { host: h })).status, 403, h);
      assert.equal((await raw(port, 'GET', '/_next/static/anything.js', { host: h })).status, 403, h);
    }
    // localhost under its own name is fine
    assert.equal((await raw(port, 'GET', '/api/bootstrap', { host: `localhost:${port}` })).status, 200);
    // no CORS headers are ever granted
    const probe = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
    assert.equal(probe.headers.get('access-control-allow-origin'), null);
  } finally {
    server.kill();
  }
});
