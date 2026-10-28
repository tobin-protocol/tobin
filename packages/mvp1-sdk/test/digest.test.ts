// MVP-1 digests in TypeScript. Direction 1 of the cross-language evidence: every byte and hash below was produced by the RUST contract (fixtures,
// generated through the bridge) and is reproduced here from the logical inputs alone. Direction 2 (TypeScript -> Rust, live) is in interop.test.ts.
// Working version 1; the exact bytes are NOT founder-approved (DB-09). No bridge is needed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EngineError, fromHex, toHex } from '../src/amount.ts';
import { DIGEST_VERSION, DOMAIN_OBLIGATIONS, DOMAIN_SETTLEMENT, obligationBytes, obligationCommitment, proposalBytes, proposalDigest } from '../src/digest.ts';
import type { DigestContext } from '../src/digest.ts';
import type { Instruction, Obligation } from '../src/engine/index.ts';
import { Rng } from './helpers.ts';

interface Fixture {
  name: string;
  networkId: string;
  contract: string;
  token: string;
  sessionId: string;
  participants: string[];
  obligations: { id: string; debtor: string; creditor: string; amount: string }[];
  instructions: { payer: string; payee: string; amount: string }[];
  expected: { obligationBytes: string; obligationCommitment: string; proposals: { revision: number; bytes: string; digest: string }[] };
}

const fixtures = (JSON.parse(readFileSync(new URL('./fixtures/digest-fixtures.json', import.meta.url), 'utf8')) as { cases: Fixture[] }).cases;
const ctxOf = (f: Fixture): DigestContext => ({ networkId: fromHex(f.networkId), contract: f.contract, sessionId: f.sessionId, token: f.token });
const obsOf = (f: Fixture): Obligation[] => f.obligations.map((o) => ({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: BigInt(o.amount) }));
const insOf = (f: Fixture): Instruction[] => f.instructions.map((i) => ({ payer: i.payer, payee: i.payee, amount: BigInt(i.amount) }));

test('the fixtures cover account, contract and mixed participants, the empty proposal, large amounts and the maximum size', () => {
  assert.ok(fixtures.length >= 7);
  const names = fixtures.map((f) => f.name);
  for (const want of ['readme-contract-addresses', 'readme-account-addresses', 'mixed-kinds-two-debtors-two-creditors', 'all-zero-empty-proposal', 'large-amounts', 'sixteen-obligations-four-participants']) {
    assert.ok(names.includes(want), want);
  }
  assert.ok(fixtures.some((f) => f.participants.some((p) => p.startsWith('G'))) && fixtures.some((f) => f.participants.some((p) => p.startsWith('C'))));
  assert.ok(fixtures.some((f) => f.instructions.length === 0));
});

for (const f of fixtures) {
  test(`Rust -> TypeScript: ${f.name}: canonical bytes and both hashes are reproduced exactly`, () => {
    const ctx = ctxOf(f);
    const oBytes = obligationBytes(ctx, f.participants, obsOf(f));
    assert.equal(toHex(oBytes), f.expected.obligationBytes, 'obligation bytes');
    const oc = obligationCommitment(ctx, f.participants, obsOf(f));
    assert.equal(toHex(oc), f.expected.obligationCommitment, 'obligation commitment');
    assert.deepEqual(f.expected.proposals.map((p) => p.revision), [1, 2, 3]);
    for (const p of f.expected.proposals) {
      assert.equal(toHex(proposalBytes(ctx, oc, p.revision, insOf(f))), p.bytes, `proposal bytes, revision ${p.revision}`);
      assert.equal(toHex(proposalDigest(ctx, oc, p.revision, insOf(f))), p.digest, `proposal digest, revision ${p.revision}`);
    }
    const ds = f.expected.proposals.map((p) => p.digest);
    assert.equal(new Set(ds).size, 3, 'identical instructions at three revisions give three different digests');
  });
}

test('equivalent canonical inputs give identical bytes: participant and obligation order do not matter', () => {
  const rng = new Rng(77n);
  for (const f of fixtures) {
    const base = toHex(obligationBytes(ctxOf(f), f.participants, obsOf(f)));
    for (let k = 0; k < 5; k++) {
      assert.equal(toHex(obligationBytes(ctxOf(f), rng.shuffle(f.participants), rng.shuffle(obsOf(f)))), base, f.name);
    }
  }
  // the two mixed-kind cases carry the same content in different join and submission orders but different session ids
  const a = fixtures.find((f) => f.name === 'mixed-kinds-two-debtors-two-creditors') as Fixture;
  const b = fixtures.find((f) => f.name === 'mixed-kinds-other-order-same-content') as Fixture;
  assert.notDeepEqual(a.participants, b.participants, 'different admission order');
  assert.notDeepEqual(a.obligations.map((o) => o.id), b.obligations.map((o) => o.id), 'different submission order');
});

test('the byte layout: tag, version, network id, contract id, session id, token id come first, in that order', () => {
  const f = fixtures[0] as Fixture;
  const ctx = ctxOf(f);
  const ob = obligationBytes(ctx, f.participants, obsOf(f));
  const tag = new TextDecoder().decode(ob.slice(1, 1 + ob[0]!));
  assert.equal(tag, DOMAIN_OBLIGATIONS);
  let o = 1 + DOMAIN_OBLIGATIONS.length;
  assert.equal(toHex(ob.slice(o, o + 4)), '00000002');
  assert.equal(DIGEST_VERSION, 2);
  o += 4;
  assert.equal(toHex(ob.slice(o, o + 32)), f.networkId);
  o += 32 + 32; // the contract id (checked through the fixtures) follows the network id
  assert.equal(toHex(ob.slice(o, o + 32)), f.sessionId);
  const pr = proposalBytes(ctx, obligationCommitment(ctx, f.participants, obsOf(f)), 1, insOf(f));
  assert.equal(new TextDecoder().decode(pr.slice(1, 1 + pr[0]!)), DOMAIN_SETTLEMENT);
});

test('changing any digest-bound field changes the result', () => {
  const f = fixtures.find((x) => x.name === 'mixed-kinds-two-debtors-two-creditors') as Fixture;
  const ctx = ctxOf(f);
  const obs = obsOf(f);
  const ins = insOf(f);
  const baseC = toHex(obligationCommitment(ctx, f.participants, obs));
  const baseP = toHex(proposalDigest(ctx, fromHex(baseC), 1, ins));
  const flip = (hex: string, at: number): string => hex.slice(0, at) + (hex[at] === '0' ? '1' : '0') + hex.slice(at + 1);
  const commitmentVariants: Record<string, string> = {
    'network id': toHex(obligationCommitment({ ...ctx, networkId: fromHex(flip(f.networkId, 10)) }, f.participants, obs)),
    'clearing contract': toHex(obligationCommitment({ ...ctx, contract: f.token }, f.participants, obs)),
    'session id': toHex(obligationCommitment({ ...ctx, sessionId: flip(f.sessionId, 5) }, f.participants, obs)),
    token: toHex(obligationCommitment({ ...ctx, token: f.contract }, f.participants, obs)),
    'participant set': toHex(obligationCommitment(ctx, f.participants.slice(0, 3), obs)),
    'obligation id': toHex(obligationCommitment(ctx, f.participants, [{ ...(obs[0] as Obligation), id: flip((obs[0] as Obligation).id, 3) }, obs[1] as Obligation])),
    'obligation debtor': toHex(obligationCommitment(ctx, f.participants, [{ ...(obs[0] as Obligation), debtor: f.participants[1] as string }, obs[1] as Obligation])),
    'obligation creditor': toHex(obligationCommitment(ctx, f.participants, [{ ...(obs[0] as Obligation), creditor: f.participants[3] as string }, obs[1] as Obligation])),
    'obligation amount': toHex(obligationCommitment(ctx, f.participants, [{ ...(obs[0] as Obligation), amount: (obs[0] as Obligation).amount + 1n }, obs[1] as Obligation])),
    'an obligation missing': toHex(obligationCommitment(ctx, f.participants, [obs[0] as Obligation])),
  };
  for (const [k, v] of Object.entries(commitmentVariants)) assert.notEqual(v, baseC, k);
  const oc = fromHex(baseC);
  const proposalVariants: Record<string, string> = {
    'obligation commitment': toHex(proposalDigest(ctx, fromHex(flip(baseC, 7)), 1, ins)),
    'session id': toHex(proposalDigest({ ...ctx, sessionId: flip(f.sessionId, 5) }, oc, 1, ins)),
    token: toHex(proposalDigest({ ...ctx, token: f.contract }, oc, 1, ins)),
    'network id': toHex(proposalDigest({ ...ctx, networkId: fromHex(flip(f.networkId, 10)) }, oc, 1, ins)),
    'instruction amount': toHex(proposalDigest(ctx, oc, 1, [{ ...(ins[0] as Instruction), amount: (ins[0] as Instruction).amount + 1n }, ins[1] as Instruction])),
    'instruction payee': toHex(proposalDigest(ctx, oc, 1, [{ ...(ins[0] as Instruction), payee: f.participants[2] as string }, ins[1] as Instruction])),
    'instruction order': toHex(proposalDigest(ctx, oc, 1, [ins[1] as Instruction, ins[0] as Instruction])),
    'revision (everything else identical)': toHex(proposalDigest(ctx, oc, 2, ins)),
    'revision 3': toHex(proposalDigest(ctx, oc, 3, ins)),
    'an instruction missing': toHex(proposalDigest(ctx, oc, 1, [ins[0] as Instruction])),
  };
  for (const [k, v] of Object.entries(proposalVariants)) assert.notEqual(v, baseP, k);
  // the two digests are domain separated even on identical-looking input
  assert.notEqual(baseC, baseP);
});

test('malformed inputs are rejected before any hashing', () => {
  const f = fixtures[0] as Fixture;
  const ctx = ctxOf(f);
  assert.throws(() => obligationBytes({ ...ctx, networkId: new Uint8Array(31) }, f.participants, obsOf(f)));
  assert.throws(() => obligationBytes({ ...ctx, sessionId: 'abcd' }, f.participants, obsOf(f)));
  assert.throws(() => obligationBytes({ ...ctx, token: f.participants.find((p) => p.startsWith('G')) ?? 'G' + 'A'.repeat(55) }, f.participants, obsOf(f)), EngineError); // a token must be a contract address
  assert.throws(() => obligationBytes(ctx, [...f.participants, f.participants[0] as string], obsOf(f)), EngineError); // duplicate participant
  assert.throws(() => obligationBytes(ctx, f.participants, [...obsOf(f), obsOf(f)[0] as Obligation]), EngineError); // duplicate obligation id
  assert.throws(() => proposalBytes(ctx, new Uint8Array(31), 1, insOf(f)));
  assert.throws(() => proposalBytes(ctx, new Uint8Array(32), 0, insOf(f)), EngineError); // revisions start at 1
  assert.throws(() => proposalBytes(ctx, new Uint8Array(32), 1.5, insOf(f)), EngineError);
  assert.throws(() => proposalBytes(ctx, new Uint8Array(32), 2 ** 32, insOf(f)));
  assert.throws(() => proposalBytes(ctx, new Uint8Array(32), 1, [{ payer: f.participants[0] as string, payee: f.participants[1] as string, amount: 0n }]), EngineError); // non-positive amount
});

test('the MVP-1 digests share nothing with the v0.2 commitment_digest: their own domain tags, no reuse', () => {
  assert.match(DOMAIN_OBLIGATIONS, /^TOBIN-MVP1\//);
  assert.match(DOMAIN_SETTLEMENT, /^TOBIN-MVP1\//);
  assert.notEqual(DOMAIN_OBLIGATIONS, DOMAIN_SETTLEMENT);
  const src = readFileSync(new URL('../src/digest.ts', import.meta.url), 'utf8');
  assert.ok(!/import[^;]*commitment_digest/i.test(src));
});
