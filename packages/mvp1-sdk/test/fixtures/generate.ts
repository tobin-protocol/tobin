// Generates test/fixtures/digest-fixtures.json: expected canonical bytes and hashes OBTAINED FROM THE REAL RUST CONTRACT (through the development
// bridge), for several session shapes. test/digest.test.ts then checks that the TypeScript encoder reproduces every byte and hash from the logical
// inputs alone (Rust -> TypeScript), and test/interop.test.ts checks the other direction live (TypeScript expected values -> Rust contract).
// Run manually:  TOBIN_BRIDGE_EXE=... node test/fixtures/generate.ts
// The fixtures describe the WORKING version 1 of the digests; DB-09 (the founder's review of the exact bytes) is still open.
import { writeFileSync } from 'node:fs';
import { startSandbox } from '../../src/local/bridge.ts';
import { TobinClient } from '../../src/sdk/client.ts';
import { toHex } from '../../src/amount.ts';
import { defaultProposal } from '../../src/engine/index.ts';
import type { Instruction, Obligation } from '../../src/engine/index.ts';
import { BRIDGE_EXE } from '../bridge-env.ts';
import { oid } from '../helpers.ts';

if (!BRIDGE_EXE) throw new Error('set TOBIN_BRIDGE_EXE');

type Kind = 'account' | 'contract';
interface Case {
  name: string;
  kinds: Kind[]; // participants A,B,C,D
  joinOrder: number[]; // indexes into the participants, after the creator (index 0)
  obligations: [number, number, number, bigint][]; // [id, debtorIndex, creditorIndex, amount], in SUBMISSION order
  plan?: [number, number, bigint][]; // explicit plan (indexes); default: the engine\'s default proposal
}

const big = 2n ** 100n + 987654321n;
const cases: Case[] = [
  { name: 'readme-contract-addresses', kinds: ['contract', 'contract', 'contract'], joinOrder: [1, 2], obligations: [[3, 2, 0, 70n], [1, 0, 1, 100n], [2, 1, 2, 80n]] },
  { name: 'readme-account-addresses', kinds: ['account', 'account', 'account'], joinOrder: [1, 2], obligations: [[3, 2, 0, 70n], [1, 0, 1, 100n], [2, 1, 2, 80n]] },
  { name: 'mixed-kinds-two-debtors-two-creditors', kinds: ['account', 'contract', 'account', 'contract'], joinOrder: [1, 2, 3], obligations: [[1, 0, 2, 10n], [2, 1, 3, 10n]], plan: [[0, 3, 10n], [1, 2, 10n]] },
  { name: 'mixed-kinds-other-order-same-content', kinds: ['account', 'contract', 'account', 'contract'], joinOrder: [3, 1, 2], obligations: [[2, 1, 3, 10n], [1, 0, 2, 10n]], plan: [[0, 3, 10n], [1, 2, 10n]] },
  { name: 'all-zero-empty-proposal', kinds: ['account', 'contract'], joinOrder: [1], obligations: [[1, 0, 1, 5n], [2, 1, 0, 5n]], plan: [] },
  { name: 'large-amounts', kinds: ['contract', 'account', 'contract'], joinOrder: [1, 2], obligations: [[7, 0, 1, big], [8, 0, 2, 1n]] },
  {
    name: 'sixteen-obligations-four-participants',
    kinds: ['account', 'contract', 'account', 'contract'],
    joinOrder: [1, 2, 3],
    obligations: Array.from({ length: 16 }, (_, k): [number, number, number, bigint] => [k + 1, k % 2, 2 + ((k >> 1) % 2), BigInt(3 + k)]),
  },
];

const sb = await startSandbox(BRIDGE_EXE, { actors: [{ name: 'minter', kind: 'contract' }], minter: 'minter', cap: 1_000_000n, accounts: true });
const client = new TobinClient({ transport: sb.transport, clearing: sb.clearing, networkId: sb.networkId });
const out: unknown[] = [];
let n = 0;
for (const c of cases) {
  n++;
  const who: string[] = [];
  for (let i = 0; i < c.kinds.length; i++) {
    who.push(String((await sb.bridge.request({ cmd: 'actor', name: `${c.name}-${i}`, kind: c.kinds[i] }))['address']));
  }
  const sessionId = n.toString(16).padStart(2, '0').repeat(32);
  const creator = who[0] as string;
  await client.createSession({ creator, sessionId, token: sb.token, maxParticipants: 4, maxObligations: 16 });
  for (const i of c.joinOrder) await client.joinSession({ sessionId, participant: who[i] as string });
  const obligations: Obligation[] = [];
  for (const [id, d, cr, amount] of c.obligations) {
    const o = { id: oid(id), debtor: who[d] as string, creditor: who[cr] as string, amount };
    obligations.push(o);
    await client.submitObligation({ sessionId, obligation: o });
  }
  await client.finalizeObligations({ sessionId, caller: creator });
  const session = await client.getSession(sessionId);
  const plan: Instruction[] = c.plan ? c.plan.map(([p, q, a]) => ({ payer: who[p] as string, payee: who[q] as string, amount: a })) : defaultProposal(session.participants, obligations);
  // EQ-05: the same instructions proposed three times are revisions 1, 2 and 3; each has its own bytes and digest
  const proposals: { revision: number; bytes: string; digest: string }[] = [];
  for (let r = 1; r <= 3; r++) {
    const { digest } = await client.proposeSettlement({ sessionId, proposer: creator, instructions: plan });
    const cur = await client.getProposal(sessionId);
    proposals.push({ revision: (cur as { revision: number }).revision, bytes: await client.proposalBytes(sessionId), digest });
  }
  out.push({
    name: c.name,
    networkId: toHex(sb.networkId),
    contract: sb.clearing,
    token: sb.token,
    sessionId,
    participants: session.participants,
    obligations: obligations.map((o) => ({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: o.amount.toString() })),
    instructions: plan.map((i) => ({ payer: i.payer, payee: i.payee, amount: i.amount.toString() })),
    expected: {
      obligationBytes: await client.commitmentBytes(sessionId),
      obligationCommitment: session.obligationCommitment,
      proposals,
    },
  });
}
sb.close();
const file = new URL('./digest-fixtures.json', import.meta.url);
writeFileSync(file, JSON.stringify({
  provenance: 'Expected values were produced by the Rust contract TobinClearingV1 (core/clearing/src/lib.rs) running in the Soroban test host through the development bridge; inputs are the logical session data. Working version 2 of the MVP-1 digests (proposal revision bound in; version 1 is superseded): NOT founder-approved (DB-09/EQ-06).',
  cases: out,
}, null, 2) + '\n');
console.log(`wrote ${out.length} fixtures`);
