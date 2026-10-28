// Generates the intent fixtures that the Rust signer tests read (core/clearing/tests/fixtures/):
//   deployment.TEST-ONLY.json   a TEST-ONLY pinned deployment record (synthetic contract ids; NOT a real deployment, no secrets)
//   auth-intent-v1.json         the expected intent for the independent known-answer vectors (alice and bob settle trees of auth-vectors.json)
//   intents-all-calls-v1.json   one expected intent per supported signing call, for fixed synthetic parties, plus the DB-09 v2 digest the TypeScript
//                               code computes; core/clearing/tests/authintents.rs replays the real calls in the Soroban host and compares the trees
//                               the HOST demands with the trees built here.
// Run manually:  node test/fixtures/generate-intents.ts   (offline; test/intent.test.ts fails if the committed files differ from this output)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromHex, toHex } from '../../src/amount.ts';
import { encodeAddress } from '../../src/strkey.ts';
import { obligationCommitment, proposalDigest } from '../../src/digest.ts';
import type { DigestContext } from '../../src/digest.ts';
import {
  deploymentRecordJson,
  intentFromRequirements,
  intentJson,
  prepareApprove,
  prepareCreateSession,
  prepareFinalize,
  prepareJoin,
  prepareMint,
  preparePropose,
  prepareSettle,
  prepareSubmitObligation,
} from '../../src/sdk/index.ts';
import type { DeploymentRecord } from '../../src/sdk/index.ts';
import { addr, oid } from '../helpers.ts';

const rust = (p: string): URL => new URL(`../../../core/clearing/tests/fixtures/${p}`, import.meta.url);

export const PASSPHRASE = 'Standalone Network ; February 2017';
export const CLEARING = addr(0xc1, 'contract');
export const TOKEN = addr(0x70, 'contract');
export const deployment = (): DeploymentRecord => ({ version: 1, networkPassphrase: PASSPHRASE, clearing: CLEARING, token: TOKEN });

/** the known-answer scenario of auth-vectors.json (independent JavaScript SDK vectors): alice and bob each pay carol */
export function katIntentText(): string {
  const vec = JSON.parse(readFileSync(rust('auth-vectors.json'), 'utf8')) as { inputs: { public_keys_hex: Record<string, string>; session_hex: string; digest_arg_hex: string } };
  const acct = (who: string): string => encodeAddress('account', fromHex(vec.inputs.public_keys_hex[who] as string));
  const call = prepareSettle(CLEARING, {
    sessionId: vec.inputs.session_hex,
    digest: vec.inputs.digest_arg_hex,
    token: TOKEN,
    instructions: [
      { payer: acct('alice'), payee: acct('carol'), amount: 10n },
      { payer: acct('bob'), payee: acct('carol'), amount: 20n },
    ],
  });
  return intentJson(intentFromRequirements(deployment(), call.auths));
}

/** one intent per supported signing call, for fixed synthetic parties */
export function allCallsText(): string {
  const A = addr(11);
  const B = addr(12);
  const M = addr(14);
  const S = '51'.repeat(32);
  const dep = deployment();
  const ob = { id: oid(1), debtor: A, creditor: B, amount: 100n };
  const plan = [{ payer: A, payee: B, amount: 100n }];
  const ctx: DigestContext = { networkId: new Uint8Array(32), contract: CLEARING, sessionId: S, token: TOKEN };
  const digest = toHex(proposalDigest(ctx, obligationCommitment(ctx, [A, B], [ob]), 1, plan));
  const calls = [
    ['create_session', prepareCreateSession(CLEARING, { creator: A, sessionId: S, token: TOKEN, maxParticipants: 4, maxObligations: 16 })],
    ['join_session', prepareJoin(CLEARING, { sessionId: S, participant: B, creator: A })],
    ['submit_obligation', prepareSubmitObligation(CLEARING, { sessionId: S, obligation: ob })],
    ['finalize_obligations', prepareFinalize(CLEARING, { sessionId: S, caller: B })],
    ['propose_settlement', preparePropose(CLEARING, { sessionId: S, proposer: A, instructions: plan })],
    ['approve_settlement', prepareApprove(CLEARING, { sessionId: S, participant: B, digest })],
    ['settle', prepareSettle(CLEARING, { sessionId: S, digest, instructions: plan, token: TOKEN })],
    ['mint', prepareMint(TOKEN, { minter: M, to: A, amount: 500n })],
  ] as const;
  const out = {
    about: 'Expected intents built by the TypeScript SDK for every supported signing call (synthetic parties). Replayed against the real contracts in the Soroban host by tests/authintents.rs.',
    network_id_hex: toHex(ctx.networkId),
    parties: { creator_and_debtor: A, joiner_and_creditor: B, minter: M },
    session_hex: S,
    obligation: { id: ob.id, debtor: A, creditor: B, amount: '100' },
    instructions: [{ payer: A, payee: B, amount: '100' }],
    digest,
    calls: calls.map(([name, c]) => ({ name, intent: JSON.parse(intentJson(intentFromRequirements(dep, c.auths))) as unknown })),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(rust('deployment.TEST-ONLY.json'), deploymentRecordJson(deployment()));
  // the known-answer intent is derived from auth-vectors.json, which may be absent from a publication (attribution review pending): write it only when that fixture exists
  if (existsSync(rust('auth-vectors.json'))) writeFileSync(rust('auth-intent-v1.json'), katIntentText());
  writeFileSync(rust('intents-all-calls-v1.json'), allCallsText());
  console.log('intent fixtures written');
}
