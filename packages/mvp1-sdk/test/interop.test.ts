// TypeScript <-> the REAL Rust contract (TobinClearingV1 in the Soroban test host, through the development bridge).
//   * engine plans satisfy the contract's validation;
//   * digests computed in TypeScript BEFORE a proposal is sent equal the digests the contract returns (TypeScript -> Rust), and the bytes the
//     contract reports equal the TypeScript bytes (Rust -> TypeScript, on live data in addition to the fixtures);
//   * other valid plans are accepted by the contract; single-field mutations are rejected with the error name the advisory validator predicts.
// Agreement here is evidence, not proof: the engine, the validator and the contract were written by the same author. Skipped (visibly) when the
// bridge is not built.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toHex } from '../src/amount.ts';
import { computeNets, defaultProposal, sortInstructions, validatePlan, allZero } from '../src/engine/index.ts';
import type { Instruction, Obligation } from '../src/engine/index.ts';
import { startSandbox } from '../src/local/bridge.ts';
import type { Sandbox } from '../src/local/bridge.ts';
import { TobinClient, TobinError } from '../src/sdk/index.ts';
import { BRIDGE_EXE, SKIP } from './bridge-env.ts';
import { Rng, oid } from './helpers.ts';

const NAMES = ['a', 'b', 'c', 'd'];

function randomValidPlan(rng: Rng, nets: { participant: string; net: bigint }[]): Instruction[] {
  const owe = nets.filter((n) => n.net > 0n).map((n) => ({ participant: n.participant, amount: n.net }));
  const due = nets.filter((n) => n.net < 0n).map((n) => ({ participant: n.participant, amount: -n.net }));
  const merged = new Map<string, Instruction>();
  while (owe.length && due.length) {
    const i = rng.below(owe.length);
    const j = rng.below(due.length);
    const o = owe[i] as { participant: string; amount: bigint };
    const d = due[j] as { participant: string; amount: bigint };
    const cap = o.amount < d.amount ? o.amount : d.amount;
    // either the whole smaller side, or a random part of it (each step finishes at least one side half of the time)
    const amt = rng.below(2) === 0 ? cap : 1n + (rng.next() % cap);
    const key = `${o.participant}>${d.participant}`;
    const prev = merged.get(key);
    merged.set(key, { payer: o.participant, payee: d.participant, amount: (prev?.amount ?? 0n) + amt });
    o.amount -= amt;
    d.amount -= amt;
    if (o.amount === 0n) owe.splice(i, 1);
    if (d.amount === 0n) due.splice(j, 1);
  }
  return sortInstructions([...merged.values()]);
}

function mutate(rng: Rng, plan: Instruction[], parts: string[]): Instruction[] {
  const p = plan.map((x) => ({ ...x }));
  switch (rng.below(7)) {
    case 0: if (p.length) (p[rng.below(p.length)] as Instruction).amount += 1n; break;
    case 1: if (p.length) p.splice(rng.below(p.length), 1); break;
    case 2: if (p.length) { const i = rng.below(p.length); p.splice(i, 0, { ...(p[i] as Instruction) }); } break;
    case 3: if (p.length > 1) { const i = rng.below(p.length - 1); [p[i], p[i + 1]] = [p[i + 1] as Instruction, p[i] as Instruction]; } break;
    case 4: if (p.length) (p[rng.below(p.length)] as Instruction).payee = parts[rng.below(parts.length)] as string; break;
    case 5: p.push({ payer: parts[rng.below(parts.length)] as string, payee: parts[rng.below(parts.length)] as string, amount: BigInt(1 + rng.below(5)) }); break;
    default: for (const x of p) [x.payer, x.payee] = [x.payee, x.payer];
  }
  return p;
}

test('engine plans, TypeScript digests and the real contract agree (40 random sessions)', { skip: SKIP, timeout: 280000 }, async () => {
  const sb: Sandbox = await startSandbox(BRIDGE_EXE as string, { actors: [...NAMES, 'minter'], minter: 'minter', cap: 1_000_000n });
  try {
    const client = new TobinClient({ transport: sb.transport, clearing: sb.clearing, networkId: sb.networkId });
    const rng = new Rng(0xfeedfacecafebeefn);
    const stats = { sessions: 0, zero: 0, defaults: 0, otherValid: 0, mutantsRejected: 0, mutantsAccepted: 0, nameAgreements: 0 };
    for (let s = 0; s < 40; s++) {
      const n = 2 + rng.below(3);
      const who = NAMES.slice(0, n).map((x) => sb.actors[x] as string);
      const sessionId = (s + 1).toString(16).padStart(2, '0').repeat(32);
      await client.createSession({ creator: who[0] as string, sessionId, token: sb.token, maxParticipants: 4, maxObligations: 16 });
      for (const p of who.slice(1)) await client.joinSession({ sessionId, participant: p });
      const obligations: Obligation[] = [];
      if (rng.below(5) === 0) {
        const amt = BigInt(1 + rng.below(100));
        for (let i = 0; i < n; i++) obligations.push({ id: oid(i + 1), debtor: who[i] as string, creditor: who[(i + 1) % n] as string, amount: amt });
      } else {
        const m = 1 + rng.below(16);
        for (let k = 0; k < m; k++) {
          const d = rng.below(n);
          let c = rng.below(n);
          if (c === d) c = (c + 1) % n;
          obligations.push({ id: oid(k + 1), debtor: who[d] as string, creditor: who[c] as string, amount: BigInt(1 + rng.below(500)) * (rng.below(5) === 0 ? 10n ** 25n : 1n) });
        }
      }
      for (const o of rng.shuffle(obligations)) await client.submitObligation({ sessionId, obligation: o });
      const { commitment } = await client.finalizeObligations({ sessionId, caller: who[rng.below(n)] as string });
      const session = await client.getSession(sessionId);
      const v0 = await client.verifyDigests(sessionId);
      assert.deepEqual(v0, { commitmentMatches: true, proposalMatches: null, bytesMatch: true }, 'obligation commitment: TypeScript equals Rust');
      assert.equal(commitment, session.obligationCommitment);
      const nets = computeNets(session.participants, obligations);
      stats.sessions++;
      if (allZero(nets)) stats.zero++;

      // the default proposal is accepted, and its digest was predicted by TypeScript before the call
      const def = defaultProposal(session.participants, obligations);
      const predicted = (await client.expectedNextProposalDigest(sessionId, def)).digest;
      const proposer = who[rng.below(n)] as string;
      const res = await client.proposeSettlement({ sessionId, proposer, instructions: def });
      assert.equal(res.digest, predicted, 'proposal digest: TypeScript (before sending) equals Rust');
      assert.deepEqual(await client.verifyDigests(sessionId), { commitmentMatches: true, proposalMatches: true, bytesMatch: true });
      stats.defaults++;

      // other valid plans are accepted too (the contract does not require the engine\'s output)
      for (let k = 0; k < 2 && !allZero(nets); k++) {
        const alt = randomValidPlan(rng, nets);
        const predictedAlt = (await client.expectedNextProposalDigest(sessionId, alt)).digest;
        // every valid plan is accepted, even one identical to the current proposal (it becomes a new revision with a new digest)
        const r = await client.proposeSettlement({ sessionId, proposer, instructions: alt });
        assert.equal(r.digest, predictedAlt);
        stats.otherValid++;
        assert.deepEqual(validatePlan(session.participants, obligations, alt), { ok: true });
      }

      // mutants: the contract and the advisory validator reach the same verdict, with the same error name
      const current = (await client.getProposal(sessionId)) as { instructions: Instruction[] };
      for (let k = 0; k < 6; k++) {
        const mutant = mutate(rng, current.instructions, session.participants);
        const advisory = validatePlan(session.participants, obligations, mutant);
        try {
          await client.proposeSettlement({ sessionId, proposer, instructions: mutant });
          assert.equal(advisory.ok, true, `the contract accepted a plan the validator rejects: ${JSON.stringify(advisory)}`);
          stats.mutantsAccepted++;
        } catch (e) {
          assert.ok(e instanceof TobinError, String(e));
          assert.equal(advisory.ok, false, `the contract rejected (${e.errorName}) a plan the validator accepts`);
          assert.equal(e.errorName, (advisory as { error: string }).error, 'same error name');
          stats.nameAgreements++;
          stats.mutantsRejected++;
        }
      }
    }
    console.log('interop stats:', JSON.stringify(stats));
    assert.ok(stats.zero > 0, 'all-zero sessions were exercised');
    assert.ok(stats.otherValid >= 3, 'sessions with several valid plans were exercised (the contract accepted plans other than the default)');
    assert.ok(stats.mutantsRejected > 100 && stats.nameAgreements === stats.mutantsRejected, 'every rejected mutant had the predicted error name');
  } finally {
    sb.close();
  }
});

test('digests agree for classic-account addresses and for mixed account and contract participants (live)', { skip: SKIP, timeout: 120000 }, async () => {
  const sb = await startSandbox(BRIDGE_EXE as string, {
    actors: [{ name: 'minter', kind: 'contract' }, { name: 'a', kind: 'account' }, { name: 'b', kind: 'contract' }, { name: 'c', kind: 'account' }],
    minter: 'minter', cap: 1000n, accounts: true,
  });
  try {
    const client = new TobinClient({ transport: sb.transport, clearing: sb.clearing, networkId: sb.networkId });
    const [a, b, c] = ['a', 'b', 'c'].map((x) => sb.actors[x] as string) as [string, string, string];
    assert.ok(a.startsWith('G') && b.startsWith('C') && c.startsWith('G'));
    const sessionId = 'ab'.repeat(32);
    await client.createSession({ creator: a, sessionId, token: sb.token, maxParticipants: 4, maxObligations: 16 });
    await client.joinSession({ sessionId, participant: b });
    await client.joinSession({ sessionId, participant: c });
    await client.submitObligation({ sessionId, obligation: { id: oid(1), debtor: a, creditor: b, amount: 100n } });
    await client.submitObligation({ sessionId, obligation: { id: oid(2), debtor: b, creditor: c, amount: 60n } });
    await client.finalizeObligations({ sessionId, caller: c });
    const plan = await client.generateDefaultProposal(sessionId);
    await client.proposeSettlement({ sessionId, proposer: b, instructions: plan });
    assert.deepEqual(await client.verifyDigests(sessionId), { commitmentMatches: true, proposalMatches: true, bytesMatch: true });
    const bytes = await client.proposalBytes(sessionId);
    assert.match(bytes, /^18544f42494e2d4d5650312f534554544c454d454e542f7632/, 'length byte 0x18 then the ASCII tag TOBIN-MVP1/SETTLEMENT/v2');
    assert.ok(toHex(new Uint8Array([0x2c])) === '2c');
  } finally {
    sb.close();
  }
});
