import test from 'node:test';
import assert from 'node:assert/strict';
import { can } from '../lib/w0/rbac.ts';
import { redact } from '../lib/w0/redact.ts';
import { evaluateReadiness, MOCK_CHECKS } from '../lib/w0/readiness.ts';
import { outcomeFromExitCode, MOCK_SCENARIOS } from '../lib/w0/mock-adapter.ts';
import { sha256Hex } from '../lib/w0/hash.ts';
import { MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../lib/w0/deps.ts';
import { ServiceError } from '../lib/w0/service.ts';
import { InMemoryAuditStore } from '../lib/w0/stores.ts';
import { parseApprovalIntent, parseAuditFilter, parsePreviewRequest, ValidationError } from '../lib/w0/validate.ts';
import { READINESS_CHECK_IDS } from '../lib/w0/types.ts';
import type { AuditEvent, Principal } from '../lib/w0/types.ts';
import { approver, build, intentFor, requester, requester2, uuid, viewer } from './w0-helpers.ts';

const BS = String.fromCharCode(92);
const WIN_PATH = ['C:', 'Users', 'someone', 'x.json'].join(BS);
const UNIX_PATH = ['', 'home', 'someone', 'y'].join('/');
const PEM_OPEN = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const PEM_CLOSE = ['-----END', 'PRIVATE KEY-----'].join(' ');
const code = (p: Promise<unknown>) => p.then(() => 'no error', (e: unknown) => (e instanceof ServiceError ? e.code : `other:${String(e)}`));

// ---------- constants ----------
test('mock hashes are the documented sha256 values and are not a real baseline', async () => {
  assert.equal(await sha256Hex('TOBIN-W0-MOCK-BASELINE'), MOCK_BASELINE_HASH);
  assert.equal(await sha256Hex('TOBIN-W0-MOCK-CONFIG'), MOCK_CONFIG_SHA256);
  assert.notEqual(MOCK_BASELINE_HASH, '83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e');
});

// ---------- RBAC ----------
test('RBAC matrix', () => {
  assert.ok(can('viewer', 'read_readiness') && can('viewer', 'read_audit'));
  assert.ok(!can('viewer', 'request_preview') && !can('viewer', 'record_approval_intent'));
  assert.ok(can('requester', 'request_preview') && !can('requester', 'record_approval_intent'));
  assert.ok(can('approver', 'record_approval_intent') && !can('approver', 'request_preview'));
  assert.ok(can('approver', 'read_audit'));
});
test('unknown roles and unknown permissions fail closed; operator is not a web role', () => {
  for (const role of ['operator', 'admin', '', undefined, null, 5, '__proto__', 'constructor']) assert.equal(can(role, 'read_readiness'), false);
  assert.equal(can('approver', 'execute'), false);
  assert.equal(can('approver', undefined), false);
});

// ---------- validation ----------
test('preview request validation: closed operation list, closed shape', () => {
  const ok = { requestId: uuid(), operation: 'mint-C' };
  assert.deepEqual(parsePreviewRequest(ok), ok);
  for (const bad of [
    { ...ok, operation: 'execute' }, { ...ok, operation: 'init' }, { ...ok, operation: 'deploy; rm -rf /' }, { ...ok, operation: 'deploy --yes' },
    { ...ok, operation: ['deploy'] }, { ...ok, args: ['--x'] }, { ...ok, extra: 1 }, { operation: 'deploy' }, { requestId: 'not-a-uuid', operation: 'deploy' },
    null, 'deploy', [], 5,
  ]) assert.throws(() => parsePreviewRequest(bad), ValidationError);
});
test('approval intent validation rejects malformed fields and unknown keys', () => {
  const base = intentFor();
  assert.doesNotThrow(() => parseApprovalIntent(base));
  for (const over of [
    { baselineHash: 'abc' }, { baselineHash: 'G'.repeat(64) }, { baselineHash: MOCK_BASELINE_HASH.toUpperCase() }, { configSha256: '' },
    { approvedAt: 'yesterday' }, { expiresAt: '2026-13-45T99:00:00Z' }, { approvalId: 'x' }, { requestedBy: '../../etc' }, { approvedBy: 'a b' }, { operation: 'sign' },
  ]) assert.throws(() => parseApprovalIntent({ ...base, ...over }), ValidationError);
  assert.throws(() => parseApprovalIntent({ ...base, extra: 'x' }), ValidationError);
});
test('audit filter validation rejects unknown keys, bad types, bad times, path-like values', () => {
  assert.deepEqual(parseAuditFilter({}), {});
  for (const bad of [{ file: '../x' }, { type: 'nonsense' }, { operation: 'x' }, { actor: '../../x' }, { from: 'now' }, { outcome: 'a b' }, JSON.parse('{"__proto__":1}')])
    assert.throws(() => parseAuditFilter(bad), ValidationError);
});

// ---------- redaction ----------
test('redaction removes seeds, PEM blocks, paths, env assignments and stack frames but keeps hashes', () => {
  const seed = 'S' + 'A'.repeat(55);
  const text = `seed ${seed} key ${PEM_OPEN}\nabc\n${PEM_CLOSE} file ${WIN_PATH} and ${UNIX_PATH} unc ${BS}${BS}host${BS}share LOCALAPPDATA=C:${BS}q at f (/srv/a.js:1:2) hash ${MOCK_BASELINE_HASH}`;
  const out = redact(text);
  for (const leak of [seed, 'PRIVATE KEY', 'someone', 'host', 'LOCALAPPDATA=C', 'a.js']) assert.ok(!out.includes(leak), `leaked ${leak}: ${out}`);
  assert.ok(out.includes(MOCK_BASELINE_HASH));
});

// ---------- readiness ----------
test('mock readiness is BLOCKED, honest, and never fabricates a pass', async () => {
  const { service } = build();
  const r = await service.getReadiness(viewer);
  assert.equal(r.overall, 'BLOCKED');
  assert.equal(r.source, 'mock');
  assert.deepEqual(r.checks.map((c) => c.id), [...READINESS_CHECK_IDS]);
  assert.ok(r.checks.every((c) => c.status !== 'PASS'));
  assert.ok(r.checks.some((c) => c.status === 'UNKNOWN') && r.checks.some((c) => c.status === 'BLOCKED') && r.checks.some((c) => c.status === 'FAIL'));
});
test('overall is BLOCKED unless EVERY check passes; unknown or missing statuses are UNKNOWN, never PASS', () => {
  const all = Object.fromEntries(READINESS_CHECK_IDS.map((id) => [id, { status: 'PASS' as const, detail: 'fixture' }])) as typeof MOCK_CHECKS;
  assert.equal(evaluateReadiness(all, 't').overall, 'READY_FOR_OPERATOR_EXECUTION');
  for (const id of READINESS_CHECK_IDS) for (const status of ['FAIL', 'BLOCKED', 'UNKNOWN'] as const)
    assert.equal(evaluateReadiness({ ...all, [id]: { status, detail: '' } }, 't').overall, 'BLOCKED');
  const weird = evaluateReadiness({ ...all, sdk_restored: { status: 'pass' as never, detail: '' } }, 't');
  assert.equal(weird.overall, 'BLOCKED');
  assert.equal(weird.checks[0]?.status, 'UNKNOWN');
  const missing = evaluateReadiness({ ...all, rpc_reachable: undefined as never }, 't');
  assert.equal(missing.overall, 'BLOCKED');
});

// ---------- exit codes ----------
test('exit-code mapping; anything else fails closed', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(outcomeFromExitCode), ['OK', 'REFUSED_APPLICATION', 'USAGE', 'UNPINNED', 'INTEGRITY_REFUSED']);
  for (const x of [5, -1, 255, '0', null, undefined, NaN, 1.5]) assert.equal(outcomeFromExitCode(x), 'ADAPTER_ERROR');
});

// ---------- preview workflow ----------
test('viewer cannot request previews; requester can; approver cannot', async () => {
  const { service } = build();
  const req = () => ({ requestId: uuid(), operation: 'deploy' });
  assert.equal(await code(service.requestPreview(viewer, req())), 'forbidden');
  assert.equal(await code(service.requestPreview(approver, req())), 'forbidden');
  assert.equal(await code(service.requestPreview(requester, req())), 'no error');
});
test('unknown role principal is rejected on every operation', async () => {
  const { service } = build();
  const ghost = { subject: 'x', role: 'operator' } as unknown as Principal;
  assert.equal(await code(service.getReadiness(ghost)), 'forbidden');
  assert.equal(await code(service.requestPreview(ghost, { requestId: uuid(), operation: 'deploy' })), 'forbidden');
  assert.equal(await code(service.recordApprovalIntent(ghost, intentFor())), 'forbidden');
  assert.equal(await code(service.listAuditEvents(ghost, {})), 'forbidden');
  assert.throws(() => service.listPreviews(ghost), ServiceError);
});
test('only enumerated operations reach the adapter; bad input never does', async () => {
  const { service, previews, audit } = build();
  for (const operation of ['execute', 'init', 'deploy;calc', '', 'DEPLOY']) assert.equal(await code(service.requestPreview(requester, { requestId: uuid(), operation })), 'invalid');
  assert.equal(await code(service.requestPreview(requester, { requestId: uuid(), operation: 'deploy', flags: '--x' })), 'invalid');
  assert.equal(previews.list().length, 0);
  assert.equal(audit.inner.list({ type: 'preview_requested' }).length, 0);
});
test('each scripted scenario yields the documented outcome and exit code, and the result is audited', async () => {
  const expect: Record<string, [string, number]> = {
    'unpinned': ['UNPINNED', 3], 'integrity-refused': ['INTEGRITY_REFUSED', 4], 'refused-application': ['REFUSED_APPLICATION', 1], 'usage': ['USAGE', 2],
    'timeout': ['TIMEOUT', -1], 'adapter-error': ['ADAPTER_ERROR', 99], 'malformed-output': ['ADAPTER_ERROR', -1], 'ok': ['OK', 0],
  };
  for (const scenario of MOCK_SCENARIOS) {
    const { service, audit } = build({ scenario });
    const rec = await service.requestPreview(requester, { requestId: uuid(), operation: 'mint-D' });
    const [outcome, exitCode] = expect[scenario] as [string, number];
    assert.equal(rec.result?.outcome, outcome, scenario);
    assert.equal(rec.result?.exitCode, exitCode, scenario);
    assert.equal(audit.inner.list({ type: 'preview_completed' })[0]?.outcome, outcome);
  }
});
test('integrity refusal is recorded as a security event and is not retried; adapter errors are audited', async () => {
  const { service, audit } = build({ scenario: 'integrity-refused' });
  await service.requestPreview(requester, { requestId: uuid(), operation: 'deploy' });
  assert.equal(audit.inner.list({ type: 'integrity_refused' }).length, 1);
  assert.equal(audit.inner.list({ type: 'preview_requested' }).length, 1); // exactly one adapter call
  const e = build({ scenario: 'timeout' });
  await e.service.requestPreview(requester, { requestId: uuid(), operation: 'deploy' });
  assert.equal(e.audit.inner.list({ type: 'adapter_error' }).length, 1);
});
test('a requestId cannot be reused (idempotency key), so nothing is silently re-run', async () => {
  const { service } = build();
  const r = { requestId: uuid(), operation: 'deploy' };
  await service.requestPreview(requester, r);
  assert.equal(await code(service.requestPreview(requester, r)), 'conflict');
});
test('an adapter that throws or returns an inconsistent result is treated as ADAPTER_ERROR', async () => {
  const mk = (behave: () => unknown) => {
    const b = build();
    (b.adapter as { requestPreview: unknown }).requestPreview = async () => behave();
    return b;
  };
  for (const behave of [
    () => { throw new Error('boom ' + WIN_PATH + ' secret'); },
    () => null, () => 'ok', () => ({}),
    () => ({ requestId: 'other', outcome: 'OK', exitCode: 0, redactedOutput: '' }),
    () => ({ requestId: 'RID', outcome: 'OK', exitCode: 3, redactedOutput: '' }),
    () => ({ requestId: 'RID', outcome: 'MAYBE', exitCode: 0, redactedOutput: '' }),
  ]) {
    const id = uuid();
    const b = mk(() => { const v = behave() as { requestId?: string } | null; if (v && v.requestId === 'RID') v.requestId = id; return v; });
    const rec = await b.service.requestPreview(requester, { requestId: id, operation: 'deploy' });
    assert.equal(rec.result?.outcome, 'ADAPTER_ERROR');
    assert.ok(!JSON.stringify(rec).includes('secret'));
  }
});
test('adapter output is redacted before storage', async () => {
  const b = build();
  const id = uuid();
  (b.adapter as { requestPreview: unknown }).requestPreview = async () => ({ requestId: id, outcome: 'USAGE', exitCode: 2, redactedOutput: 'see ' + WIN_PATH + ' and S' + 'B'.repeat(55) });
  const rec = await b.service.requestPreview(requester, { requestId: id, operation: 'deploy' });
  assert.ok(!/someone|SBBB/.test(rec.result?.redactedOutput ?? ''));
});

// ---------- audit ----------
test('audit store is append-only: no mutators, immutable events, returned copies cannot alter history', () => {
  const s = new InMemoryAuditStore();
  const e: AuditEvent = { eventId: uuid(), timestamp: '2026-11-06T12:00:00Z', actor: 'a', role: 'viewer', requestId: uuid(), type: 'readiness_checked', adapterVersion: 'x', origin: 'mock' };
  s.append(e);
  assert.throws(() => s.append(e), /duplicate/);
  const got = s.list({})[0] as AuditEvent;
  got.actor = 'tampered';
  e.actor = 'tampered-source';
  assert.equal(s.list({})[0]?.actor, 'a');
  for (const m of ['update', 'delete', 'remove', 'clear', 'set', 'truncate']) assert.equal((s as unknown as Record<string, unknown>)[m], undefined);
});
test('audit store redacts free text', () => {
  const s = new InMemoryAuditStore();
  s.append({ eventId: uuid(), timestamp: '2026-11-06T12:00:00Z', actor: 'a', role: 'viewer', requestId: uuid(), type: 'auth_denied', adapterVersion: 'x', origin: 'mock', detail: WIN_PATH + ' S' + 'C'.repeat(55) });
  assert.ok(!/someone|SCCC/.test(s.list({})[0]?.detail ?? ''));
});
test('a failed audit write blocks the operation before the adapter is reached', async () => {
  const b = build();
  b.audit.failing = true;
  let called = false;
  (b.adapter as { requestPreview: unknown }).requestPreview = async () => { called = true; return {}; };
  assert.equal(await code(b.service.requestPreview(requester, { requestId: uuid(), operation: 'deploy' })), 'audit_unavailable');
  assert.equal(called, false);
  assert.equal(b.previews.list().length, 0);
  assert.equal(await code(b.service.getReadiness(viewer)), 'audit_unavailable');
});
test('a failed audit write after the adapter returns withholds the result', async () => {
  const b = build();
  const real = b.audit.append.bind(b.audit);
  let n = 0;
  b.audit.append = (e: AuditEvent) => { if (++n >= 2) throw new Error('disk full'); real(e); }; // preview_requested ok, preview_completed fails
  assert.equal(await code(b.service.requestPreview(requester, { requestId: uuid(), operation: 'deploy' })), 'audit_unavailable');
  assert.equal(b.previews.list()[0]?.result, null); // no result was recorded or returned
});
test('denials are audited (best effort) and a denial stays a denial even when the log is down', async () => {
  const b = build();
  await code(b.service.requestPreview(viewer, { requestId: uuid(), operation: 'deploy' }));
  assert.equal(b.audit.inner.list({ type: 'auth_denied' }).length, 1);
  b.audit.failing = true;
  assert.equal(await code(b.service.requestPreview(viewer, { requestId: uuid(), operation: 'deploy' })), 'forbidden');
});
test('audit filters work and are validated', async () => {
  const b = build({ scenario: 'integrity-refused' });
  await b.service.getReadiness(viewer);
  await b.service.requestPreview(requester, { requestId: uuid(), operation: 'mint-C' });
  await b.service.requestPreview(requester2, { requestId: uuid(), operation: 'deploy' });
  assert.equal((await b.service.listAuditEvents(viewer, { actor: 'r2' })).every((e) => e.actor === 'r2'), true);
  assert.equal((await b.service.listAuditEvents(viewer, { operation: 'mint-C' })).every((e) => e.operation === 'mint-C'), true);
  assert.equal((await b.service.listAuditEvents(viewer, { type: 'integrity_refused' })).length, 2);
  assert.equal((await b.service.listAuditEvents(viewer, { outcome: 'INTEGRITY_REFUSED' })).length > 0, true);
  assert.equal((await b.service.listAuditEvents(viewer, { from: '2030-01-01T00:00:00Z' })).length, 0);
  assert.equal(await code(b.service.listAuditEvents(viewer, { path: '../../x' })), 'invalid');
  assert.ok((await b.service.listAuditEvents(viewer, {})).every((e) => e.origin === 'mock'));
});
