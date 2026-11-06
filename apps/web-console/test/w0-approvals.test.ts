// Approval-intent binding and audit-lifecycle tests. All in memory with the mock adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceError } from '../lib/w0/service.ts';
import { StoreError } from '../lib/w0/stores.ts';
import { MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../lib/w0/deps.ts';
import type { AuditEvent } from '../lib/w0/types.ts';
import type { MockScenario } from '../lib/w0/mock-adapter.ts';
import { approver, build, intentFor, requester, requester2, uuid, viewer } from './w0-helpers.ts';

const code = (p: Promise<unknown>) => p.then(() => 'no error', (e: unknown) => (e instanceof ServiceError ? e.code : `other:${String(e)}`));

/** A world with one completed preview by r1 for `deploy`. Scenario 'ok' completes with OK; others complete with a refusal. */
async function world(scenario: MockScenario = 'ok') {
  const b = build({ scenario });
  const pid = uuid();
  await b.service.requestPreview(requester, { requestId: pid, operation: 'deploy' });
  const intent = (over: Record<string, unknown> = {}) => intentFor({ previewRequestId: pid, ...over });
  return { ...b, pid, intent };
}
const types = (events: AuditEvent[]) => events.map((e) => e.type);

test('approver records a valid intent bound to a completed OK preview; evidence only', async () => {
  const w = await world();
  const saved = await w.service.recordApprovalIntent(approver, w.intent());
  assert.equal(saved.previewRequestId, w.pid);
  assert.equal(w.intents.list().length, 1);
  assert.deepEqual(types(w.audit.inner.list({ type: 'approval_intent_recorded' })).length, 1);
  assert.equal(w.audit.inner.list({ type: 'preview_requested' }).length, 1); // recording triggered no further adapter preview
});
test('viewer and requester cannot record intents (even when the body is otherwise valid)', async () => {
  const w = await world();
  assert.equal(await code(w.service.recordApprovalIntent(viewer, w.intent({ approvedBy: 'v1' }))), 'forbidden');
  assert.equal(await code(w.service.recordApprovalIntent(requester, w.intent({ approvedBy: 'r1', requestedBy: 'r2' }))), 'forbidden');
  assert.equal(w.intents.list().length, 0);
});
test('approver cannot approve their own request or impersonate another approver', async () => {
  const w = await world();
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ requestedBy: 'a1' }))), 'forbidden');
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ approvedBy: 'someone-else' }))), 'forbidden');
});

// ----- binding to one specific preview -----
test('the intent must reference an existing preview', async () => {
  const w = await world();
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ previewRequestId: uuid() }))), 'invalid');
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ previewRequestId: 'not-a-uuid' }))), 'invalid');
});
test('an intent is not transferable to another requester, operation or preview', async () => {
  const w = await world();
  const other = uuid();
  await w.service.requestPreview(requester2, { requestId: other, operation: 'mint-C' });
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ requestedBy: 'r2' }))), 'invalid'); // r1's preview, claimed for r2
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ operation: 'mint-C' }))), 'invalid'); // deploy preview, claimed for mint-C
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ previewRequestId: other }))), 'invalid'); // r2's mint-C preview, claimed as r1/deploy
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ previewRequestId: other, operation: 'mint-C' }))), 'invalid'); // still r1 as requester
  assert.equal(w.intents.list().length, 0);
});
test('"any earlier preview for that operation" is no longer enough: a different, unrelated preview id is refused', async () => {
  const w = await world();
  await w.service.requestPreview(requester, { requestId: uuid(), operation: 'deploy' }); // a second OK preview by the same requester and operation
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ previewRequestId: uuid() }))), 'invalid');
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent())), 'no error'); // bound to the right one
});
test('only a preview that completed with OK is evidence: refused, unpinned, usage, integrity, timeout and adapter-error previews are not', async () => {
  for (const scenario of ['unpinned', 'refused-application', 'usage', 'integrity-refused', 'timeout', 'adapter-error', 'malformed-output'] as const) {
    const w = await world(scenario);
    assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent())), 'invalid', scenario);
    assert.equal(w.intents.list().length, 0, scenario);
  }
});
test('a preview without a result (pending or withheld) cannot be approved', async () => {
  const w = build({ scenario: 'ok' });
  const pid = uuid();
  w.previews.begin({ requestId: pid, operation: 'deploy', requestedBy: 'r1', requestedAt: '2026-11-06T12:00:00Z', origin: 'mock' }); // begun, never completed
  assert.equal(await code(w.service.recordApprovalIntent(approver, intentFor({ previewRequestId: pid }))), 'invalid');
});
test('the intent baseline must equal the baseline the preview reported (and the trusted baseline)', async () => {
  const w = await world();
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ baselineHash: 'a'.repeat(64) }))), 'invalid');
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ configSha256: 'b'.repeat(64) }))), 'invalid');
  // a preview that reported a different baseline cannot be used even with a correct trusted hash
  const pid = uuid();
  (w.adapter as { requestPreview: unknown }).requestPreview = async () => ({ requestId: pid, outcome: 'OK', exitCode: 0, baselineHash: 'c'.repeat(64), redactedOutput: 'x' });
  await w.service.requestPreview(requester, { requestId: pid, operation: 'deploy' });
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent({ previewRequestId: pid }))), 'invalid');
  assert.equal(w.intents.list().length, 0);
});
test('one intent per preview; the recorded intent is immutable', async () => {
  const w = await world();
  const first = w.intent();
  await w.service.recordApprovalIntent(approver, first);
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent())), 'conflict'); // second approvalId, same preview
  const stored = w.intents.list()[0] as unknown as Record<string, unknown>;
  stored['previewRequestId'] = uuid(); // a returned copy cannot alter the store
  assert.equal(w.intents.list()[0]?.previewRequestId, w.pid);
  for (const m of ['update', 'delete', 'remove', 'set', 'add', 'clear']) assert.equal((w.intents as unknown as Record<string, unknown>)[m], undefined, m);
  assert.throws(() => { (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(w.intents), 'commit')?.value as (i: unknown) => void).call(w.intents, first); }, StoreError); // no commit without a reservation
});

// ----- hashes, time, ids -----
test('hash mismatches, expiry, stale or inverted times and over-long lifetimes are rejected', async () => {
  const w = await world();
  const cases: Record<string, unknown>[] = [
    { approvedAt: '2026-11-06T10:00:00Z', expiresAt: '2026-11-06T11:00:00Z' }, { expiresAt: '2026-11-06T12:00:00Z' },
    { approvedAt: '2026-11-06T12:30:00Z', expiresAt: '2026-11-06T12:20:00Z' }, { expiresAt: '2026-11-08T12:00:00Z' }, { approvedAt: 'soon' },
  ];
  for (const c of cases) assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent(c))), 'invalid', JSON.stringify(c));
  w.clock.t += 6 * 60_000;
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent())), 'invalid'); // approvedAt now stale
});
test('an approvalId can never be reused', async () => {
  const w = await world();
  const first = w.intent();
  await w.service.recordApprovalIntent(approver, first);
  const p2 = uuid();
  await w.service.requestPreview(requester, { requestId: p2, operation: 'deploy' });
  assert.equal(await code(w.service.recordApprovalIntent(approver, { ...first, previewRequestId: p2, expiresAt: '2026-11-06T12:30:00Z' })), 'conflict');
  assert.equal(w.intents.list().length, 1);
  assert.equal(w.intents.list()[0]?.expiresAt, '2026-11-06T13:00:00Z');
});
test('extra fields (e.g. an attempt to supply the expected hash or an execution flag) are rejected', async () => {
  const w = await world();
  for (const extra of [{ expectedBaselineHash: MOCK_BASELINE_HASH }, { expected: { baselineHash: 'a'.repeat(64) } }, { execute: true }, { confirmation: 'x' }])
    assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent(extra))), 'invalid');
});

// ----- audit lifecycle -----
test('success: exactly one recorded event, no rejection, intent visible, response returned', async () => {
  const w = await world();
  await w.service.recordApprovalIntent(approver, w.intent());
  assert.deepEqual(types(w.audit.inner.list({})).filter((t) => t.startsWith('approval')), ['approval_intent_recorded']);
  assert.equal(w.intents.list().length, 1);
});
test('audit append fails: nothing stored, nothing logged as recorded, reservation released, request fails closed, retry succeeds (recovery)', async () => {
  const w = await world();
  const i = w.intent();
  w.audit.failing = true;
  assert.equal(await code(w.service.recordApprovalIntent(approver, i)), 'audit_unavailable');
  assert.equal(w.intents.list().length, 0);
  assert.equal(w.intents.has(i['approvalId'] as string), false); // released, so the same id can be retried
  assert.equal(w.audit.inner.list({ type: 'approval_intent_recorded' }).length, 0);
  w.audit.failing = false;
  assert.equal(await code(w.service.recordApprovalIntent(approver, i)), 'no error');
  assert.equal(w.audit.inner.list({ type: 'approval_intent_recorded' }).length, 1);
  assert.equal(w.intents.list().length, 1);
});
test('persistence fails after the audit write: an explicit PARTIAL FAILURE rejection follows, nothing is stored, the request fails, retry succeeds', async () => {
  const w = await world();
  const i = w.intent();
  const real = w.adapter.recordApprovalIntent.bind(w.adapter);
  let fail = true;
  (w.adapter as { recordApprovalIntent: unknown }).recordApprovalIntent = async (x: Parameters<typeof real>[0]) => { if (fail) throw new Error('storage down C:\\hidden\\path'); return real(x); };
  assert.equal(await code(w.service.recordApprovalIntent(approver, i)), 'internal');
  assert.equal(w.intents.list().length, 0);
  const ev = w.audit.inner.list({}).filter((e) => e.type.startsWith('approval'));
  assert.deepEqual(ev.map((e) => e.type), ['approval_intent_recorded', 'approval_intent_rejected']);
  assert.match(ev[1]?.detail ?? '', /PARTIAL FAILURE/);
  assert.ok(!JSON.stringify(ev).includes('hidden'));
  fail = false;
  assert.equal(await code(w.service.recordApprovalIntent(approver, i)), 'no error'); // recovery with the same id
  assert.equal(w.intents.list().length, 1);
});
test('the audit failure that happens only on the rejection write does not turn a failure into a success', async () => {
  const w = await world();
  (w.adapter as { recordApprovalIntent: unknown }).recordApprovalIntent = async () => { throw new Error('down'); };
  const real = w.audit.append.bind(w.audit);
  let n = 0;
  w.audit.append = (e: AuditEvent) => { if (++n >= 2) throw new Error('log down'); real(e); }; // recorded ok, rejection write fails
  assert.equal(await code(w.service.recordApprovalIntent(approver, w.intent())), 'internal');
  assert.equal(w.intents.list().length, 0);
});
test('a duplicate approval id is rejected with a rejection event and stores nothing new', async () => {
  const w = await world();
  const first = w.intent();
  await w.service.recordApprovalIntent(approver, first);
  const rejectedBefore = w.audit.inner.list({ type: 'approval_intent_rejected' }).length;
  assert.equal(await code(w.service.recordApprovalIntent(approver, first)), 'conflict');
  assert.equal(w.audit.inner.list({ type: 'approval_intent_rejected' }).length, rejectedBefore + 1);
  assert.equal(w.audit.inner.list({ type: 'approval_intent_recorded' }).length, 1);
  assert.equal(w.intents.list().length, 1);
});
test('repeated identical submissions never double-record', async () => {
  const w = await world();
  const i = w.intent();
  const results = await Promise.all([1, 2, 3].map(() => code(w.service.recordApprovalIntent(approver, i))));
  assert.equal(results.filter((r) => r === 'no error').length, 1);
  assert.equal(w.intents.list().length, 1);
  assert.equal(w.audit.inner.list({ type: 'approval_intent_recorded' }).length, 1);
});
test('every outcome is described truthfully: history never shows a recorded event without either a stored intent or an explicit partial-failure rejection', async () => {
  const w = await world();
  const ok = w.intent();
  await w.service.recordApprovalIntent(approver, ok);
  await code(w.service.recordApprovalIntent(approver, w.intent({ requestedBy: 'a1' })));
  const recorded = w.audit.inner.list({ type: 'approval_intent_recorded' });
  for (const r of recorded) assert.ok(w.intents.list().some((x) => x.approvalId === r.requestId), 'recorded event without a stored intent');
});
test('the expected hashes are server constants and not the real baselines', () => {
  for (const real of ['83f11a7f5ca4dce244dde39f69b19442711902137b8cba8ba3beb7f446c8733e', '9b594c5407b7934274f9c41a47f2dfc13a781f4f7b0cc0962a8ab57a52bacbb7', 'ccea8b5b94bf3358f295ec8dd85435f34505714ef927764e5f58c557c567aa92']) {
    assert.notEqual(MOCK_BASELINE_HASH, real);
    assert.notEqual(MOCK_CONFIG_SHA256, real);
  }
});
