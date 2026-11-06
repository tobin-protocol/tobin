// W1 reusable ADAPTER CONTRACT SUITE. Any implementation of SignerAdapter must pass it. It is run against the W0 mock adapter now
// (w1-adapter-contract.test.ts). A future adapter is NOT authorised by this file's existence: a real adapter needs the separate written authorisation and
// prerequisites listed in W0-ENTRY-READINESS.md section 8, and would add its own tests on top of this suite.
//
// The suite checks the contract in tst-signer-web-console-integration-contract.md section 4 and the fail-closed rules the service layer relies on:
// the exact four-method surface, readiness semantics (never implies execution permission), preview result shape and exit-code consistency, redaction
// stability, intent commit semantics (reserve -> commit), audit listing as a read-only copy, and (for the mock) zero process/network activity.
import test, { mock } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { outcomeFromExitCode } from '../lib/w0/mock-adapter.ts';
import { redact } from '../lib/w0/redact.ts';
import { OPERATIONS, READINESS_CHECK_IDS, SIGNER_OUTCOMES } from '../lib/w0/types.ts';
import type { AuditEvent, OperatorApprovalIntent, SignerAdapter } from '../lib/w0/types.ts';
import type { AuditStore, IntentStore } from '../lib/w0/stores.ts';

export interface AdapterUnderTest {
  adapter: SignerAdapter;
  /** The console-side stores the adapter writes to / reads from (the contract: the adapter stores intents and lists audit events through them). */
  intents: IntentStore;
  audit: AuditStore;
  /** True for the W0 mock: it must label itself, perform no I/O, and be deterministic. */
  isMock: boolean;
}

export const FORBIDDEN_ADAPTER_METHODS = [
  'execute', 'init', 'sign', 'signTransaction', 'signAuthEntry', 'submit', 'broadcast', 'loadKey', 'readKey', 'getKey', 'readState', 'writeState', 'writeFile', 'readFile',
  'exec', 'run', 'spawn', 'shell', 'deploy', 'mint', 'transfer', 'pin', 'setBaseline', 'approveBaseline', 'createConfig', 'rpc', 'fetch',
] as const;
const ALLOWED_SURFACE = ['getReadiness', 'listAuditEvents', 'recordApprovalIntent', 'requestPreview'];
const LEAK = /[A-Za-z]:[\\/]|\/(?:home|Users|root|tmp)\/|S[A-Z2-7]{55}|PRIVATE KEY|LOCALAPPDATA|NODE_OPTIONS|\bat \S+ \(/;

const UUID = (n: number): string => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
let seq = 0;

function methodNames(o: object): string[] {
  const names = new Set<string>();
  for (let p: object | null = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) if (k !== 'constructor') names.add(k);
  return [...names].filter((k) => typeof (o as Record<string, unknown>)[k] === 'function').sort();
}
function intent(over: Partial<OperatorApprovalIntent> = {}): OperatorApprovalIntent {
  return {
    approvalId: UUID(++seq), previewRequestId: UUID(++seq), operation: 'deploy', baselineHash: 'a'.repeat(64), configSha256: 'b'.repeat(64),
    requestedBy: 'requester', approvedBy: 'approver', approvedAt: '2026-11-06T12:00:00Z', expiresAt: '2026-11-06T13:00:00Z', ...over,
  };
}
function event(over: Partial<AuditEvent> = {}): AuditEvent {
  return { eventId: UUID(++seq), timestamp: '2026-11-06T12:00:00Z', actor: 'contract-actor', role: 'viewer', requestId: UUID(++seq), type: 'readiness_checked', adapterVersion: 'contract-test', origin: 'mock', ...over };
}

export function runAdapterContract(name: string, make: () => AdapterUnderTest): void {
  const t = (title: string, fn: (c: TestContext) => Promise<void> | void) => test(`adapter contract [${name}]: ${title}`, fn);

  t('the surface is exactly getReadiness, requestPreview, recordApprovalIntent, listAuditEvents; no execute/init/sign/submit/key/state/file/command method exists', () => {
    const { adapter } = make();
    assert.deepEqual(methodNames(adapter), ALLOWED_SURFACE);
    for (const f of FORBIDDEN_ADAPTER_METHODS) assert.equal((adapter as unknown as Record<string, unknown>)[f], undefined, `forbidden member ${f}`);
    assert.equal(typeof adapter.adapterVersion, 'string');
    assert.ok(adapter.adapterVersion.length > 0);
  });

  t('a mock identifies itself by its version string; a non-mock must not claim to be a mock', () => {
    const { adapter, isMock } = make();
    assert.equal(/mock/i.test(adapter.adapterVersion), isMock);
  });

  t('getReadiness: eight known checks exactly once, valid statuses, overall never says ready unless every check is PASS, no leaks', async () => {
    const { adapter, isMock } = make();
    const r = await adapter.getReadiness();
    assert.deepEqual(r.checks.map((c) => c.id), [...READINESS_CHECK_IDS]);
    for (const c of r.checks) {
      assert.ok(['PASS', 'FAIL', 'BLOCKED', 'UNKNOWN'].includes(c.status), c.status);
      assert.equal(typeof c.detail, 'string');
      assert.ok(!LEAK.test(c.detail), `leak in detail of ${c.id}`);
    }
    assert.ok(['BLOCKED', 'READY_FOR_OPERATOR_EXECUTION'].includes(r.overall));
    const allPass = r.checks.every((c) => c.status === 'PASS');
    assert.equal(r.overall === 'READY_FOR_OPERATOR_EXECUTION', allPass);
    assert.ok(Number.isFinite(Date.parse(r.generatedAt)));
    if (isMock) { assert.equal(r.source, 'mock'); assert.equal(r.overall, 'BLOCKED'); }
  });

  t('getReadiness returns a fresh object each time: mutating a result does not affect the next one', async () => {
    const { adapter } = make();
    const strip = (r: Awaited<ReturnType<SignerAdapter['getReadiness']>>) => JSON.stringify({ ...r, generatedAt: '' });
    const a = await adapter.getReadiness();
    const before = strip(a);
    a.overall = 'READY_FOR_OPERATOR_EXECUTION';
    a.checks[0]!.status = 'PASS';
    a.checks.length = 0;
    assert.equal(strip(await adapter.getReadiness()), before);
  });

  for (const operation of OPERATIONS) {
    t(`requestPreview(${operation}): well-formed result, consistent exit code, redaction-stable output, hash only with OK`, async () => {
      const { adapter } = make();
      const req = Object.freeze({ requestId: UUID(++seq), operation });
      const r = await adapter.requestPreview(req);
      assert.equal(r.requestId, req.requestId);
      assert.ok((SIGNER_OUTCOMES as readonly string[]).includes(r.outcome));
      assert.ok(Number.isInteger(r.exitCode));
      if (r.outcome !== 'TIMEOUT' && r.outcome !== 'ADAPTER_ERROR') assert.equal(outcomeFromExitCode(r.exitCode), r.outcome, 'exit code does not match the outcome');
      assert.equal(typeof r.redactedOutput, 'string');
      assert.equal(redact(r.redactedOutput), r.redactedOutput, 'output is not stable under redaction');
      assert.ok(!LEAK.test(r.redactedOutput));
      if (r.outcome === 'OK') assert.match(r.baselineHash ?? '', /^[0-9a-f]{64}$/);
      else { assert.equal(r.baselineHash, undefined); assert.equal(r.summary, undefined); }
      if (r.summary !== undefined) assert.ok(!LEAK.test(r.summary));
    });
  }

  t('requestPreview is deterministic for the same operation and does not mutate its input', async () => {
    const { adapter } = make();
    const req = Object.freeze({ requestId: UUID(++seq), operation: 'mint-C' as const });
    const a = await adapter.requestPreview(req);
    const b = await adapter.requestPreview({ ...req, requestId: UUID(++seq) });
    assert.deepEqual([a.outcome, a.exitCode, a.baselineHash, a.redactedOutput], [b.outcome, b.exitCode, b.baselineHash, b.redactedOutput]);
  });

  t('concurrent previews resolve independently, each echoing its own requestId', async () => {
    const { adapter } = make();
    const reqs = Array.from({ length: 25 }, () => ({ requestId: UUID(++seq), operation: OPERATIONS[seq % 3] as (typeof OPERATIONS)[number] }));
    const rs = await Promise.all(reqs.map((r) => adapter.requestPreview(r)));
    assert.deepEqual(rs.map((r) => r.requestId), reqs.map((r) => r.requestId));
  });

  t('recordApprovalIntent commits a reserved intent as an independent copy', async () => {
    const { adapter, intents } = make();
    const i = intent();
    intents.reserve(i.approvalId);
    await adapter.recordApprovalIntent(i);
    const stored = intents.list().find((x) => x.approvalId === i.approvalId);
    assert.deepEqual(stored, i);
    i.requestedBy = 'tampered-after-commit';
    assert.equal(intents.list().find((x) => x.approvalId === i.approvalId)?.requestedBy, 'requester');
  });

  t('recordApprovalIntent refuses an intent that was not reserved, and a second commit of the same intent; nothing extra is stored', async () => {
    const { adapter, intents } = make();
    const stray = intent();
    await assert.rejects(adapter.recordApprovalIntent(stray));
    assert.equal(intents.list().length, 0);
    const i = intent();
    intents.reserve(i.approvalId);
    await adapter.recordApprovalIntent(i);
    await assert.rejects(adapter.recordApprovalIntent(i));
    assert.equal(intents.list().length, 1);
  });

  t('recordApprovalIntent does not execute, sign or produce anything but the stored record (no audit event, no preview, no result)', async () => {
    const { adapter, intents, audit } = make();
    const i = intent();
    intents.reserve(i.approvalId);
    const before = audit.list({}).length;
    const ret = await adapter.recordApprovalIntent(i);
    assert.equal(ret, undefined);
    assert.equal(audit.list({}).length, before);
  });

  t('listAuditEvents is a read-only view: lists appended events, applies filters, returns copies, changes nothing', async () => {
    const { adapter, audit } = make();
    const a = event({ actor: 'alice', type: 'preview_requested', operation: 'deploy', outcome: 'x' });
    const b = event({ actor: 'bob', type: 'auth_denied' });
    audit.append(a); audit.append(b);
    const all = await adapter.listAuditEvents({});
    assert.deepEqual(all.map((e) => e.eventId), [a.eventId, b.eventId]);
    assert.deepEqual((await adapter.listAuditEvents({ actor: 'bob' })).map((e) => e.eventId), [b.eventId]);
    assert.deepEqual((await adapter.listAuditEvents({ type: 'preview_requested', operation: 'deploy' })).map((e) => e.eventId), [a.eventId]);
    assert.deepEqual(await adapter.listAuditEvents({ actor: 'nobody' }), []);
    all[0]!.actor = 'tampered';
    all.length = 0;
    assert.equal((await adapter.listAuditEvents({})).length, 2);
    assert.equal(audit.list({})[0]?.actor, 'alice');
    assert.equal(audit.list({}).length, 2);
  });

  t('listAuditEvents never shows an event as real: every event the adapter lists carries origin "mock" when the adapter is a mock', async () => {
    const { adapter, audit, isMock } = make();
    audit.append(event());
    const all = await adapter.listAuditEvents({});
    if (isMock) assert.ok(all.every((e) => e.origin === 'mock'));
  });

  t('a mock performs no process, socket, HTTP, DNS or fetch activity across all four methods', async (c) => {
    const { adapter, intents, isMock } = make();
    if (!isMock) { c.skip('only asserted for mocks; a real adapter is expected to do I/O and must be covered by its own authorised tests'); return; }
    const targets: [object, string][] = [];
    for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) targets.push([cp, k]);
    targets.push([net, 'connect'], [net, 'createConnection'], [http, 'request'], [http, 'get'], [https, 'request'], [dns, 'lookup'], [dns, 'resolve']);
    const ms = targets.map(([o, k]) => mock.method(o as Record<string, (...a: unknown[]) => unknown>, k, () => { throw new Error('forbidden call'); }));
    const f = mock.method(globalThis, 'fetch', () => { throw new Error('forbidden fetch'); });
    try {
      await adapter.getReadiness();
      for (const operation of OPERATIONS) await adapter.requestPreview({ requestId: UUID(++seq), operation });
      const i = intent(); intents.reserve(i.approvalId); await adapter.recordApprovalIntent(i);
      await adapter.listAuditEvents({});
    } finally {
      const called = ms.filter((m) => m.mock.callCount() > 0).length + f.mock.callCount();
      mock.restoreAll();
      assert.equal(called, 0);
    }
  });
}
