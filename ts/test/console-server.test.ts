// The Console\'s local server and the browser-side HTTP transport, over real HTTP on 127.0.0.1 (no external network). Needs the Rust bridge and the
// compiled page (npm run build:console). This does NOT test the DOM wiring in console/main.ts: there is no browser in this environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpTransport } from '../console/http-transport.ts';
import { TobinClient } from '../src/sdk/index.ts';
import { fromHex } from '../src/amount.ts';
import { BRIDGE_EXE, SKIP } from './bridge-env.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const distMain = join(root, 'console', 'dist', 'console', 'main.js');
const skip = SKIP || (existsSync(distMain) ? false : 'console/dist is missing: run the console build first (tsc -p console/tsconfig.json)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}

async function startServer(port: number): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn(process.execPath, [join(root, 'console', 'server.mjs')], { env: { ...process.env, PORT: String(port), TOBIN_BRIDGE_EXE: BRIDGE_EXE as string }, stdio: ['pipe', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    child.stdout.on('data', (d: Buffer) => {
      if (String(d).includes('127.0.0.1')) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return child;
}

test('the page, the compiled scripts and the sandbox API are served locally; unrelated files are not', { skip, timeout: 60000 }, async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = await startServer(port);
  try {
    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    // hardening headers: no framing by another site, no MIME sniffing, no referrer, and only same-origin resources
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
    assert.match(home.headers.get('content-security-policy') ?? '', /default-src 'self'.*frame-ancestors 'none'/);
    const html = await home.text();
    assert.match(html, /Tobin Console \(local sandbox\)/);
    assert.match(html, /<script type="module" src="\/dist\/console\/main\.js">/);
    assert.match(html, /Everything here runs in a local sandbox on this machine/);
    const js = await fetch(`${base}/dist/console/main.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    assert.equal((await fetch(`${base}/styles.css`)).status, 200);
    // nothing outside the page, its stylesheet and dist is served; Node-only code is not in the browser bundle
    for (const p of ['/server.mjs', '/controller.ts', '/dist/../server.mjs', '/dist/%2e%2e/server.mjs', '/src/digest.ts', '/dist/src/local/bridge.js']) {
      assert.notEqual((await fetch(base + p)).status, 200, p);
    }
    for (const f of walk(join(root, 'console', 'dist'))) {
      const text = readFileSync(f, 'utf8');
      assert.doesNotMatch(text, /node:(child_process|fs|readline|http)/, f);
    }

    // bootstrap: five accounts, two capped tokens, a description that says what this world is
    const boot = (await (await fetch(`${base}/api/bootstrap`)).json()) as { description: string; clearing: string; networkId: string; personas: { name: string; address: string }[]; tokens: { name: string; address: string; cap: string }[] };
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

// ---- security regressions (milestone 3): a web page in the user's browser must not be able to drive the local sandbox ----

import { request } from 'node:http';

function raw(port: number, method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (d: Buffer) => (text += String(d)));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('the local server refuses cross-origin writes, non-JSON bodies and foreign Host headers (CSRF and DNS rebinding)', { skip, timeout: 60000 }, async () => {
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
    // DNS rebinding: the browser sends the attacker's host name
    for (const h of ['evil.example', `evil.example:${port}`, 'localhost.evil.example']) {
      assert.equal((await raw(port, 'GET', '/api/bootstrap', { host: h })).status, 403, h);
      assert.equal((await raw(port, 'GET', '/', { host: h })).status, 403, h);
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
