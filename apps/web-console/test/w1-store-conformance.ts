// W1 STORE CONFORMANCE SUITES. Any audit, approval-intent or preview store must pass these before the service may rely on it. They encode the
// guarantees W0's service layer assumes (append-only, immutability, reserve -> audit -> commit, fail-closed capacity, copies on read) without choosing a
// database: the production storage decision is open (see docs/product/architecture/w1/W1-DECISION-PAPERS.md). A store passing this suite is NECESSARY, not
// sufficient: durability, crash consistency and multi-instance behaviour need their own tests once a store is chosen.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuditStore, IntentStore } from '../lib/w0/stores.ts';
import { InMemoryPreviewStore } from '../lib/w0/stores.ts';
import type { AuditEvent, OperatorApprovalIntent, PreviewResult } from '../lib/w0/types.ts';

let n = 0;
const id = (): string => `22222222-2222-4222-8222-${String(++n).padStart(12, '0')}`;
const BS = String.fromCharCode(92);
const leakyPath = (): string => ['C:', 'Users', 'someone', 'k.json'].join(BS);

function ev(over: Partial<AuditEvent> = {}): AuditEvent {
  return { eventId: id(), timestamp: '2026-11-06T12:00:00Z', actor: 'a', role: 'viewer', requestId: id(), type: 'readiness_checked', adapterVersion: 'test', origin: 'mock', ...over };
}
function intent(over: Partial<OperatorApprovalIntent> = {}): OperatorApprovalIntent {
  return { approvalId: id(), previewRequestId: id(), operation: 'deploy', baselineHash: 'a'.repeat(64), configSha256: 'b'.repeat(64), requestedBy: 'r', approvedBy: 'p', approvedAt: '2026-11-06T12:00:00Z', expiresAt: '2026-11-06T13:00:00Z', ...over };
}

const MUTATORS = ['update', 'delete', 'remove', 'clear', 'set', 'truncate', 'put', 'replace', 'edit', 'purge', 'drop'];

export function runAuditStoreConformance(name: string, make: () => AuditStore, makeWithCapacity?: (capacity: number) => AuditStore): void {
  const t = (title: string, fn: () => void) => test(`audit store conformance [${name}]: ${title}`, fn);

  t('append then list/get returns the event, in insertion order', () => {
    const s = make();
    const a = ev(); const b = ev(); const c = ev();
    s.append(a); s.append(b); s.append(c);
    assert.deepEqual(s.list({}).map((e) => e.eventId), [a.eventId, b.eventId, c.eventId]);
    assert.deepEqual(s.get(b.eventId), b);
    assert.equal(s.get(id()), undefined);
  });
  t('a duplicate eventId is refused and the original is untouched', () => {
    const s = make();
    const a = ev({ actor: 'first' });
    s.append(a);
    assert.throws(() => s.append({ ...a, actor: 'second' }));
    assert.equal(s.list({}).length, 1);
    assert.equal(s.get(a.eventId)?.actor, 'first');
  });
  t('stored events are independent copies: changing the appended object afterwards does not change history', () => {
    const s = make();
    const a = ev({ actor: 'orig' });
    s.append(a);
    a.actor = 'tampered'; a.type = 'auth_denied';
    assert.equal(s.get(a.eventId)?.actor, 'orig');
    assert.equal(s.get(a.eventId)?.type, 'readiness_checked');
  });
  t('returned events are copies: changing them, or the returned array, does not change history', () => {
    const s = make();
    const a = ev({ actor: 'orig' });
    s.append(a);
    const l = s.list({}); l[0]!.actor = 'tampered'; l.length = 0;
    const g = s.get(a.eventId)!; g.actor = 'tampered';
    assert.equal(s.list({}).length, 1);
    assert.equal(s.list({})[0]?.actor, 'orig');
    assert.equal(s.get(a.eventId)?.actor, 'orig');
  });
  t('there is no update, delete, clear or other mutating operation on the store object', () => {
    const s = make() as unknown as Record<string, unknown>;
    for (const m of MUTATORS) assert.equal(s[m], undefined, `mutator ${m} exists`);
    const names = new Set<string>();
    for (let p: object | null = s; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) names.add(k);
    assert.deepEqual([...names].filter((k) => typeof s[k] === 'function' && k !== 'constructor').sort(), ['append', 'get', 'list']);
  });
  t('filters: actor, operation, type, outcome and inclusive time range, combined with AND', () => {
    const s = make();
    const e1 = ev({ actor: 'alice', operation: 'deploy', type: 'preview_requested', outcome: 'OK', timestamp: '2026-11-06T10:00:00Z' });
    const e2 = ev({ actor: 'alice', operation: 'mint-C', type: 'preview_completed', outcome: 'UNPINNED', timestamp: '2026-11-06T11:00:00Z' });
    const e3 = ev({ actor: 'bob', operation: 'deploy', type: 'auth_denied', timestamp: '2026-11-06T12:00:00Z' });
    for (const e of [e1, e2, e3]) s.append(e);
    const ids = (f: Parameters<AuditStore['list']>[0]) => s.list(f).map((e) => e.eventId);
    assert.deepEqual(ids({ actor: 'alice' }), [e1.eventId, e2.eventId]);
    assert.deepEqual(ids({ operation: 'deploy' }), [e1.eventId, e3.eventId]);
    assert.deepEqual(ids({ type: 'auth_denied' }), [e3.eventId]);
    assert.deepEqual(ids({ outcome: 'UNPINNED' }), [e2.eventId]);
    assert.deepEqual(ids({ from: '2026-11-06T11:00:00Z', to: '2026-11-06T12:00:00Z' }), [e2.eventId, e3.eventId]);
    assert.deepEqual(ids({ actor: 'alice', operation: 'deploy' }), [e1.eventId]);
    assert.deepEqual(ids({ from: '2030-01-01T00:00:00Z' }), []);
    assert.deepEqual(ids({}), [e1.eventId, e2.eventId, e3.eventId]);
  });
  t('free text (detail, outcome) is redacted before it is stored', () => {
    const s = make();
    const e = ev({ detail: `see ${leakyPath()} seed S${'A'.repeat(55)}`, outcome: leakyPath() });
    s.append(e);
    const got = s.get(e.eventId)!;
    for (const v of [got.detail ?? '', got.outcome ?? '']) assert.ok(!/someone|SAAAA/.test(v), v);
  });
  t('hash-shaped values are kept (they are evidence, not secrets)', () => {
    const s = make();
    const e = ev({ baselineHash: 'c'.repeat(64), configSha256: 'd'.repeat(64) });
    s.append(e);
    assert.equal(s.get(e.eventId)?.baselineHash, 'c'.repeat(64));
  });
  if (makeWithCapacity) {
    t('capacity: a full store refuses new events (fail closed) and keeps what it has', () => {
      const s = makeWithCapacity(3);
      const kept = [ev(), ev(), ev()];
      for (const e of kept) s.append(e);
      assert.throws(() => s.append(ev()));
      assert.deepEqual(s.list({}).map((e) => e.eventId), kept.map((e) => e.eventId));
    });
  }
}

export function runIntentStoreConformance(name: string, make: () => IntentStore): void {
  const t = (title: string, fn: () => void) => test(`intent store conformance [${name}]: ${title}`, fn);

  t('reserve -> commit makes the intent visible; before commit it is not listed but its id is taken', () => {
    const s = make();
    const i = intent();
    s.reserve(i.approvalId);
    assert.equal(s.list().length, 0);
    assert.equal(s.has(i.approvalId), true);
    s.commit(i);
    assert.deepEqual(s.list(), [i]);
    assert.equal(s.has(i.approvalId), true);
  });
  t('an id can be reserved only once, whether reserved or committed', () => {
    const s = make();
    const i = intent();
    s.reserve(i.approvalId);
    assert.throws(() => s.reserve(i.approvalId));
    s.commit(i);
    assert.throws(() => s.reserve(i.approvalId));
  });
  t('commit without a reservation, and a second commit, are refused; nothing extra is stored', () => {
    const s = make();
    const i = intent();
    assert.throws(() => s.commit(i));
    assert.equal(s.list().length, 0);
    s.reserve(i.approvalId); s.commit(i);
    assert.throws(() => s.commit({ ...i, approvedBy: 'someone-else' }));
    assert.equal(s.list().length, 1);
    assert.equal(s.list()[0]?.approvedBy, 'p');
  });
  t('release drops a reservation only; the id becomes reusable; a committed intent is never affected by release', () => {
    const s = make();
    const i = intent();
    s.reserve(i.approvalId);
    s.release(i.approvalId);
    assert.equal(s.has(i.approvalId), false);
    s.reserve(i.approvalId); s.commit(i);
    s.release(i.approvalId);
    assert.deepEqual(s.list(), [i]);
    assert.throws(() => s.reserve(i.approvalId));
  });
  t('committed intents are independent, immutable copies in both directions', () => {
    const s = make();
    const i = intent();
    s.reserve(i.approvalId); s.commit(i);
    i.requestedBy = 'tampered';
    const l = s.list(); l[0]!.previewRequestId = id(); l.length = 0;
    const stored = s.list()[0]!;
    assert.equal(stored.requestedBy, 'r');
    assert.equal(s.list().length, 1);
    assert.notEqual(stored.previewRequestId, undefined);
  });
  t('forPreview finds the committed intent for a preview and nothing else (not reserved ones)', () => {
    const s = make();
    const i = intent();
    s.reserve(i.approvalId);
    assert.equal(s.forPreview(i.previewRequestId), undefined);
    s.commit(i);
    assert.deepEqual(s.forPreview(i.previewRequestId), i);
    assert.equal(s.forPreview(id()), undefined);
    const copy = s.forPreview(i.previewRequestId)!; copy.operation = 'mint-D';
    assert.equal(s.forPreview(i.previewRequestId)?.operation, 'deploy');
  });
  t('there is no add, update, delete or other mutating operation beyond reserve, commit and release', () => {
    const s = make() as unknown as Record<string, unknown>;
    for (const m of [...MUTATORS, 'add']) assert.equal(s[m], undefined, `mutator ${m} exists`);
    const names = new Set<string>();
    for (let p: object | null = s; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) names.add(k);
    assert.deepEqual([...names].filter((k) => typeof s[k] === 'function' && k !== 'constructor').sort(), ['commit', 'forPreview', 'has', 'list', 'release', 'reserve']);
  });
  t('many distinct intents coexist; listing preserves commit order', () => {
    const s = make();
    const items = Array.from({ length: 50 }, () => intent());
    for (const i of items) { s.reserve(i.approvalId); }
    for (const i of items) s.commit(i);
    assert.deepEqual(s.list().map((i) => i.approvalId), items.map((i) => i.approvalId));
  });
}

export function runPreviewStoreConformance(name: string, make: () => InMemoryPreviewStore): void {
  const t = (title: string, fn: () => void) => test(`preview store conformance [${name}]: ${title}`, fn);
  const base = (over: Record<string, unknown> = {}) => ({ requestId: id(), operation: 'deploy' as const, requestedBy: 'r', requestedAt: '2026-11-06T12:00:00Z', origin: 'mock' as const, ...over });
  const res = (requestId: string, over: Partial<PreviewResult> = {}): PreviewResult => ({ requestId, outcome: 'OK', exitCode: 0, redactedOutput: 'x', ...over });

  t('begin -> pending (result null) -> complete -> get/list show the result', () => {
    const s = make();
    const r = base();
    s.begin(r);
    assert.equal(s.has(r.requestId), true);
    assert.equal(s.get(r.requestId)?.result, null);
    s.complete(r.requestId, res(r.requestId));
    assert.equal(s.get(r.requestId)?.result?.outcome, 'OK');
    assert.equal(s.list().length, 1);
  });
  t('a requestId can begin once; complete works once; completing an unknown or already completed request is refused', () => {
    const s = make();
    const r = base();
    s.begin(r);
    assert.throws(() => s.begin(r));
    assert.throws(() => s.complete(id(), res(id())));
    s.complete(r.requestId, res(r.requestId));
    assert.throws(() => s.complete(r.requestId, res(r.requestId, { outcome: 'USAGE', exitCode: 2 })));
    assert.equal(s.get(r.requestId)?.result?.outcome, 'OK');
  });
  t('returned records are copies', () => {
    const s = make();
    const r = base();
    s.begin(r); s.complete(r.requestId, res(r.requestId));
    const g = s.get(r.requestId)!; g.requestedBy = 'tampered'; g.result!.outcome = 'UNPINNED';
    const l = s.list(); l.length = 0;
    assert.equal(s.get(r.requestId)?.requestedBy, 'r');
    assert.equal(s.get(r.requestId)?.result?.outcome, 'OK');
    assert.equal(s.list().length, 1);
  });
  t('stored results are redacted', () => {
    const s = make();
    const r = base();
    s.begin(r); s.complete(r.requestId, res(r.requestId, { redactedOutput: `see ${leakyPath()} S${'B'.repeat(55)}` }));
    assert.ok(!/someone|SBBB/.test(s.get(r.requestId)?.result?.redactedOutput ?? ''));
  });
  t('there is no update or delete operation', () => {
    const s = make() as unknown as Record<string, unknown>;
    for (const m of MUTATORS) assert.equal(s[m], undefined, `mutator ${m} exists`);
  });
}
