// The two API endpoints as functions of (Request, dependencies), with a fake sandbox: no Next.js, no bridge, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBootstrap, handleRpc } from '../lib/server/api.ts';
import type { ApiDeps } from '../lib/server/api.ts';
import * as bootstrapRoute from '../app/api/bootstrap/route.ts';
import * as rpcRoute from '../app/api/rpc/route.ts';

const CLEARING = 'C'.repeat(56);
const TOKEN = 'D'.repeat(56);
const OUTSIDER = 'G'.repeat(56);
const info = { description: 'LOCAL SANDBOX (test double)', clearing: CLEARING, networkId: '00'.repeat(32), personas: [{ name: 'Alice', address: OUTSIDER }], tokens: [{ name: 'TTT-A', address: TOKEN, cap: '1000000' }] };

function deps(opts: { fail?: Error } = {}): ApiDeps & { calls: { call: unknown; options: unknown }[]; boots: number } {
  const calls: { call: unknown; options: unknown }[] = [];
  const state = { boots: 0 };
  const d = {
    port: 8787,
    calls,
    get boots() { return state.boots; },
    sandbox: async () => {
      state.boots++;
      if (opts.fail) throw opts.fail;
      return { sb: { transport: { invoke: async (call: unknown, options?: unknown) => { calls.push({ call, options }); return { ok: true, echoed: call }; } } }, info } as unknown as Awaited<ReturnType<ApiDeps['sandbox']>>;
    },
  };
  return d as unknown as ApiDeps & { calls: { call: unknown; options: unknown }[]; boots: number };
}

const rpc = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request('http://127.0.0.1:8787/api/rpc', { method: 'POST', headers: { host: '127.0.0.1:8787', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const boot = (headers: Record<string, string> = {}): Request => new Request('http://127.0.0.1:8787/api/bootstrap', { headers: { host: '127.0.0.1:8787', ...headers } });

test('bootstrap returns the sandbox description once the guards pass', async () => {
  const d = deps();
  const res = await handleBootstrap(boot(), d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), info);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('the guards run before the sandbox is touched: a refused request never boots it', async () => {
  const d = deps();
  const cases: [Request, number, string][] = [
    [boot({ host: 'evil.example' }), 403, 'forbidden host'],
    [boot({ origin: 'http://evil.example' }), 403, 'forbidden origin'],
    [rpc({}, { host: 'evil.example:8787' }), 403, 'forbidden host'],
    [rpc({}, { origin: 'http://evil.example' }), 403, 'forbidden origin'],
    [rpc({}, { 'content-type': 'text/plain' }), 415, 'application/json required'],
  ];
  for (const [req, status, text] of cases) {
    const res = await (req.url.endsWith('bootstrap') ? handleBootstrap(req, d) : handleRpc(req, d));
    assert.equal(res.status, status);
    assert.equal(await res.text(), text);
    assert.equal(res.headers.get('content-type'), 'text/plain');
  }
  assert.equal(d.boots, 0);
});

test('rpc only accepts calls to the known contracts, and passes the simulated authorization list through unchanged', async () => {
  const d = deps();
  const unknown = await handleRpc(rpc({ call: { contract: OUTSIDER, fn: 'x', args: [], auths: [] }, authorize: null }), d);
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), { ok: false, errorType: 'Protocol', code: null, detail: 'unknown contract' });
  const missing = await handleRpc(rpc({ authorize: null }), d);
  assert.equal(missing.status, 400);
  assert.equal(d.calls.length, 0);

  const call = { contract: CLEARING, fn: 'config', args: [], auths: [] };
  const ok = await handleRpc(rpc({ call, authorize: null }), d);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, echoed: call });
  assert.deepEqual(d.calls[0], { call, options: undefined });

  await handleRpc(rpc({ call: { ...call, contract: TOKEN }, authorize: ['Alice', 'Bob'] }), d);
  assert.deepEqual(d.calls[1]?.options, { authorize: ['Alice', 'Bob'] });
});

test('errors keep the earlier server\'s shape: 500 with ok:false, errorType Server and the message', async () => {
  const failing = deps({ fail: new Error('TOBIN_BRIDGE_EXE is not set') });
  const a = await handleBootstrap(boot(), failing);
  assert.equal(a.status, 500);
  assert.deepEqual(await a.json(), { ok: false, errorType: 'Server', code: null, detail: 'Error: TOBIN_BRIDGE_EXE is not set' });
  const b = await handleRpc(rpc({ call: { contract: CLEARING, fn: 'config', args: [], auths: [] } }), failing);
  assert.equal(b.status, 500);
  const badJson = await handleRpc(rpc('{not json'), deps());
  assert.equal(badJson.status, 500);
  assert.equal(((await badJson.json()) as { errorType: string }).errorType, 'Server');
  const huge = await handleRpc(rpc(JSON.stringify({ pad: 'x'.repeat(1_000_001) })), deps());
  assert.equal(huge.status, 500);
  assert.match(((await huge.json()) as { detail: string }).detail, /request too large/);
});

test('the route modules export only the intended methods, on the Node.js runtime, never cached', () => {
  assert.deepEqual(Object.keys(bootstrapRoute).sort(), ['GET', 'dynamic', 'runtime']);
  assert.deepEqual(Object.keys(rpcRoute).sort(), ['POST', 'dynamic', 'runtime']);
  for (const m of [bootstrapRoute, rpcRoute]) {
    assert.equal(m.runtime, 'nodejs');
    assert.equal(m.dynamic, 'force-dynamic');
  }
});
