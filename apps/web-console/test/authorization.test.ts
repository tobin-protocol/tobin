// Pure authorization rules (MVP-1.3): decision status, state of the current snapshot, separation-of-duties conflicts. No database, no HTTP.
import assert from 'node:assert/strict';
import test from 'node:test';
import { authState, conflictedActors, decisionStatus } from '../lib/registry/authorization.ts';
import type { ActivityRecord, AuthorizationDecision, AuthorizationInvalidation, CalculationRecord, ObligationRecord } from '../lib/registry/types.ts';

const S = 'cd'.repeat(32);
const calc = (id: string, createdBy = 'usr_calc', obligationIds: string[] = ['01'.repeat(32)]): CalculationRecord => ({ id, sessionId: S, orgId: 'org_1', asset: 'USD', inputHash: 'h'.repeat(64), input: { participants: [], obligations: obligationIds.map((o) => ({ id: o, revision: 1, debtor: 'a', creditor: 'b', amount: '1' })) }, positions: [], gross: '1', createdAt: 't', createdBy });
const dec = (calculationId: string, decision: 'approved' | 'rejected' = 'approved'): AuthorizationDecision => ({ id: 'dec_1', sessionId: S, orgId: 'org_1', calculationId, decision, reason: decision === 'rejected' ? 'why' : '', decidedBy: 'usr_rev', decidedAt: 't' });
const inv: AuthorizationInvalidation = { decisionId: 'dec_1', cause: 'x', at: 't', by: 'u' };
const ob = (id: string, createdBy: string, updatedBy = createdBy): ObligationRecord => ({ id, sessionId: S, orgId: 'org_1', debtor: 'a', creditor: 'b', amount: '1', asset: 'USD', reference: '', status: 'active', revision: 1, createdAt: 't', createdBy, updatedAt: 't', updatedBy });

test('decision status: only a decision on the latest, current, un-invalidated snapshot is active', () => {
  const c1 = calc('calc_1'), c2 = calc('calc_2');
  assert.equal(decisionStatus(dec('calc_1'), undefined, c1, 'current'), 'active');
  assert.equal(decisionStatus(dec('calc_1'), undefined, c2, 'current'), 'superseded', 'a newer snapshot exists');
  assert.equal(decisionStatus(dec('calc_1'), inv, c1, 'current'), 'invalidated', 'an invalidation row wins');
  assert.equal(decisionStatus(dec('calc_1'), undefined, c1, 'stale'), 'invalidated', 'defence in depth: stale never leaves an active decision');
  assert.equal(decisionStatus(dec('calc_1'), undefined, undefined, 'none'), 'superseded');
});

test('authorization state follows the current snapshot, never an old approval', () => {
  const c = calc('calc_1');
  assert.equal(authState(undefined, 'none', undefined), 'no-calculation');
  assert.equal(authState(c, 'stale', dec('calc_1')), 'stale', 'a stale snapshot is never approved, even if a decision exists');
  assert.equal(authState(c, 'current', undefined), 'awaiting-review');
  assert.equal(authState(c, 'current', dec('calc_1')), 'approved');
  assert.equal(authState(c, 'current', dec('calc_1', 'rejected')), 'rejected');
});

test('separation of duties: calculation author and every recorder or editor of an input obligation conflict', () => {
  const o1 = '01'.repeat(32), o2 = '02'.repeat(32), o3 = '03'.repeat(32);
  const c = calc('calc_1', 'usr_calc', [o1, o2]);
  const act = (actor: string, kind: string, detail: string): ActivityRecord => ({ id: actor + detail, at: 't', orgId: 'org_1', actor, kind, subject: S, detail });
  const m = conflictedActors(c, [ob(o1, 'usr_rec', 'usr_edit'), ob(o2, 'usr_rec2'), ob(o3, 'usr_unrelated')], [
    act('usr_early', 'obligation.updated', `obligation ${o1.slice(0, 8)} revision 2: amount 1 -> 2`),
    act('usr_voider', 'obligation.voided', `obligation ${o3.slice(0, 8)} voided`),
    act('usr_other_session', 'obligation.created', `obligation ${o1.slice(0, 8)}: x`),
  ].map((a, i) => (i === 2 ? { ...a, subject: 'else' } : a)));
  for (const u of ['usr_calc', 'usr_rec', 'usr_edit', 'usr_rec2', 'usr_early']) assert.ok(m.has(u), u);
  for (const u of ['usr_unrelated', 'usr_voider', 'usr_other_session', 'usr_clean']) assert.ok(!m.has(u), `${u} is not part of this calculation`);
  assert.match(m.get('usr_calc')!, /ran this calculation/); assert.match(m.get('usr_early')!, /changed obligation/);
});
