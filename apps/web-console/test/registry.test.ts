import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../lib/registry/service.ts';
import { InMemoryRegistryStore } from '../lib/registry/store.ts';
import { DevelopmentIdentityProvider } from '../lib/registry/identity.ts';
import type { ActingUser } from '../lib/registry/identity.ts';

const user = (n: string): ActingUser => ({ userId: n, kind: 'development' });
let now = Date.parse('2026-11-06T12:00:00Z');
const make = () => new Registry(new InMemoryRegistryStore(), { now: () => new Date(now) });
const SID = 'ab'.repeat(32);
const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as { code?: string }).code; } return 'NO_ERROR'; };

test('creator becomes the first administrator; activity is recorded', () => {
  const r = make(); const o = r.createOrganization(user('ann'), { name: 'Alpha Bank' });
  assert.equal(r.members(user('ann'), o.id)[0]?.role, 'admin');
  assert.equal(r.activity(user('ann'), o.id)[0]?.kind, 'organization.created');
  assert.equal(code(() => r.createOrganization(user('ann'), { name: 'x' })), 'INVALID');
  assert.equal(code(() => r.createOrganization(user('ann'), { name: '<script>' })), 'INVALID');
});

test('organization isolation: outsiders get NOT_FOUND for every read and write', () => {
  const r = make(); const a = r.createOrganization(user('ann'), { name: 'Alpha Bank' }); r.createOrganization(user('bob'), { name: 'Beta Fund' });
  const bob = user('bob');
  for (const f of [() => r.getOrganization(bob, a.id), () => r.members(bob, a.id), () => r.sessions(bob, a.id), () => r.activity(bob, a.id), () => r.wallets(bob, a.id), () => r.invitations(bob, a.id), () => r.updateProfile(bob, a.id, { name: 'pwned' }), () => r.invite(bob, a.id, { invitee: 'x@y.z', role: 'admin' }), () => r.recordSession(bob, a.id, { sessionId: SID, label: 'x' })]) assert.equal(code(f), 'NOT_FOUND');
  assert.equal(r.myOrganizations(bob).length, 1);
});

test('invitation: single use, expiring, revocable, secret never stored, uniform failure', () => {
  const r = make(); const ann = user('ann'); const o = r.createOrganization(ann, { name: 'Alpha Bank' });
  const { invitation, token } = r.invite(ann, o.id, { invitee: 'cy@alpha.example', role: 'member' });
  assert.ok(!JSON.stringify(r.invitations(ann, o.id)).includes(token));
  assert.equal(JSON.stringify(invitation).includes(token), false);
  const m = r.acceptInvitation(user('cy'), token);
  assert.equal(m.role, 'member');
  assert.equal(code(() => r.acceptInvitation(user('dee'), token)), 'INVALID_INVITATION', 'single use');
  const i2 = r.invite(ann, o.id, { invitee: 'dee@alpha.example', role: 'member' });
  now += 8 * 24 * 3600 * 1000;
  assert.equal(code(() => r.acceptInvitation(user('dee'), i2.token)), 'INVALID_INVITATION', 'expired');
  now = Date.parse('2026-11-06T12:00:00Z');
  const i3 = r.invite(ann, o.id, { invitee: 'eve@alpha.example', role: 'member' });
  r.revokeInvitation(ann, o.id, i3.invitation.id);
  assert.equal(code(() => r.acceptInvitation(user('eve'), i3.token)), 'INVALID_INVITATION', 'revoked');
  assert.equal(code(() => r.acceptInvitation(user('eve'), 'short')), 'INVALID_INVITATION');
  assert.equal(code(() => r.invite(user('cy'), o.id, { invitee: 'z@z.zz', role: 'admin' })), 'FORBIDDEN', 'members cannot invite');
});

test('an organization keeps at least one administrator', () => {
  const r = make(); const ann = user('ann'); const o = r.createOrganization(ann, { name: 'Alpha Bank' });
  assert.equal(code(() => r.setRole(ann, o.id, 'ann', 'member')), 'LAST_ADMIN');
  assert.equal(code(() => r.removeMember(ann, o.id, 'ann')), 'LAST_ADMIN');
  const { token } = r.invite(ann, o.id, { invitee: 'cy@alpha.example', role: 'admin' }); r.acceptInvitation(user('cy'), token);
  r.setRole(ann, o.id, 'ann', 'member');
  assert.equal(code(() => r.updateProfile(ann, o.id, { name: 'Nope' })), 'FORBIDDEN');
});

test('wallet links are claims, not proof; bad addresses are refused', () => {
  const r = make(); const ann = user('ann'); const o = r.createOrganization(ann, { name: 'Alpha Bank' });
  assert.equal(r.linkWallet(ann, o.id, 'GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR').proof, 'none');
  for (const bad of ['', 'C' + 'A'.repeat(55), 'GABC', 5, null]) assert.equal(code(() => r.linkWallet(ann, o.id, bad)), 'INVALID');
});

test('session provenance can only move fixture/draft -> chain-read -> chain-confirmed with evidence', () => {
  const r = make(); const ann = user('ann'); const o = r.createOrganization(ann, { name: 'Alpha Bank' });
  assert.equal(code(() => r.recordSession(ann, o.id, { sessionId: 'XYZ', label: 'x' })), 'INVALID');
  const s = r.recordSession(ann, o.id, { sessionId: SID, label: 'W2 test' });
  assert.equal(s.provenance, 'local-draft');
  assert.equal(code(() => r.recordSession(ann, o.id, { sessionId: SID, label: 'dup' })), 'EXISTS');
  const obs = { state: 'OPEN' as const, participants: ['GA'], creator: 'GA', readAtLedger: 100 };
  assert.equal(code(() => r.confirmSession(ann, o.id, SID, { txHash: 'f'.repeat(64), txStatus: 'SUCCESS' })), 'NOT_VERIFIED', 'no chain read yet');
  assert.equal(code(() => r.attachChainRead(ann, o.id, SID, { ...obs, readAtLedger: 0 })), 'INVALID');
  assert.equal(r.attachChainRead(ann, o.id, SID, obs).provenance, 'chain-read');
  for (const ev of [{ txHash: 'f'.repeat(64), txStatus: 'FAILED' }, { txHash: 'f'.repeat(64), txStatus: 'NOT_FOUND' }, { txHash: 'f'.repeat(64), txStatus: 'success' }, { txHash: 'bad', txStatus: 'SUCCESS' }]) assert.equal(code(() => r.confirmSession(ann, o.id, SID, ev)), 'NOT_VERIFIED');
  assert.equal(r.session(ann, o.id, SID).provenance, 'chain-read');
  const c = r.confirmSession(ann, o.id, SID, { txHash: 'f'.repeat(64), txStatus: 'SUCCESS' });
  assert.equal(c.provenance, 'chain-confirmed'); assert.equal(c.confirmedTxHash, 'f'.repeat(64));
});

test('fixture records can never carry chain data or become confirmed', () => {
  const r = make(); const ann = user('ann'); const o = r.createOrganization(ann, { name: 'Alpha Bank' });
  r.recordSession(ann, o.id, { sessionId: SID, label: 'demo', fixture: true });
  assert.equal(code(() => r.attachChainRead(ann, o.id, SID, { state: 'OPEN', participants: [], creator: 'GA', readAtLedger: 1 })), 'FIXTURE');
  assert.equal(code(() => r.confirmSession(ann, o.id, SID, { txHash: 'f'.repeat(64), txStatus: 'SUCCESS' })), 'NOT_VERIFIED');
  assert.equal(r.session(ann, o.id, SID).provenance, 'fixture');
});

test('returned objects are copies; the development identity provider is not authentication', async () => {
  const r = make(); const ann = user('ann'); const o = r.createOrganization(ann, { name: 'Alpha Bank' });
  r.getOrganization(ann, o.id).name = 'hacked';
  assert.equal(r.getOrganization(ann, o.id).name, 'Alpha Bank');
  const p = new DevelopmentIdentityProvider();
  assert.match(p.name, /not authentication/);
  assert.equal((await p.resolve('dev:ann'))?.kind, 'development');
  for (const bad of [undefined, '', 'ann', 'dev:', 'dev:A B', 'dev:' + 'a'.repeat(41)]) assert.equal(await p.resolve(bad as string), null);
});
