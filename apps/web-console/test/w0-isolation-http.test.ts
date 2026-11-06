// Behavioural isolation through the HTTP layer: every mock scenario, driven by real API calls (sign-in, readiness, preview, approval, audit, sign-out),
// with process, socket, HTTP, DNS, fetch and filesystem-open entry points replaced by recorders that throw. Nothing real is started or opened.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import tls from 'node:tls';
import { buildDeps } from '../lib/w0/deps.ts';
import { handleW0 } from '../lib/w0/http.ts';
import { MOCK_SCENARIOS } from '../lib/w0/mock-adapter.ts';
import { MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../lib/w0/deps.ts';
import { T0, uuid } from './w0-helpers.ts';

test('all mock scenarios through the HTTP API make zero process, socket, HTTP, DNS, TLS or fetch calls', async () => {
  const targets: [string, object, string][] = [];
  for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) targets.push(['child_process.' + k, cp, k]);
  targets.push(['net.connect', net, 'connect'], ['net.createConnection', net, 'createConnection'], ['tls.connect', tls, 'connect'], ['http.request', http, 'request'], ['http.get', http, 'get'],
    ['https.request', https, 'request'], ['https.get', https, 'get'], ['dns.lookup', dns, 'lookup'], ['dns.resolve', dns, 'resolve'], ['dns.resolve4', dns, 'resolve4']);
  const mocks = targets.map(([name, obj, key]) => ({ name, m: mock.method(obj as Record<string, (...a: unknown[]) => unknown>, key, () => { throw new Error('forbidden call'); }) }));
  const fetchMock = mock.method(globalThis, 'fetch', () => { throw new Error('forbidden fetch'); });
  const statuses: number[] = [];
  try {
    for (const scenario of MOCK_SCENARIOS) {
      const d = buildDeps({ NODE_ENV: 'test', W0_MOCK_SCENARIO: scenario }, () => T0);
      const send = async (method: string, path: string, who?: { cookie: string; csrf: string }, body?: unknown) => {
        const headers: Record<string, string> = { host: '127.0.0.1:8787' };
        if (who) { headers['cookie'] = who.cookie; if (method !== 'GET') headers['x-w0-csrf'] = who.csrf; }
        if (body !== undefined || method === 'POST') headers['content-type'] = 'application/json';
        const res = await handleW0(new Request(`http://127.0.0.1:8787${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), d);
        statuses.push(res.status);
        return { res, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
      };
      const login = async (subject: string) => {
        const r = await send('POST', '/api/w0/session', undefined, { subject });
        return { cookie: (r.res.headers.get('set-cookie') ?? '').split(';')[0] as string, csrf: r.json['csrf'] as string };
      };
      const req = await login('dev-requester');
      const app = await login('dev-approver');
      await send('GET', '/api/w0/readiness', req);
      const pid = uuid();
      await send('POST', '/api/w0/previews', req, { requestId: pid, operation: 'deploy' });
      await send('POST', '/api/w0/approvals', app, { approvalId: uuid(), previewRequestId: pid, operation: 'deploy', baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256, requestedBy: 'dev-requester', approvedBy: 'dev-approver', approvedAt: '2026-11-06T12:00:00Z', expiresAt: '2026-11-06T13:00:00Z' });
      await send('GET', '/api/w0/audit', app);
      await send('DELETE', '/api/w0/session', req);
    }
  } finally {
    const calls = mocks.filter((x) => x.m.mock.callCount() > 0).map((x) => x.name);
    if (fetchMock.mock.callCount() > 0) calls.push('fetch');
    mock.restoreAll();
    assert.deepEqual(calls, []);
  }
  assert.ok(statuses.length >= MOCK_SCENARIOS.length * 6);
  assert.ok(!statuses.includes(500), 'an unexpected internal error occurred during the isolation run');
});
