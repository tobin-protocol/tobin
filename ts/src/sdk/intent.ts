// The EXPECTED INTENT for the local authorization signer (core/clearing/signer/mod.rs), and the pinned deployment record it is checked against.
//
// WHY THIS EXISTS (F2, founder-approved). The Rust signer is a strict verifier: it signs an authorization entry only when the entry's whole invocation
// tree equals a tree in this intent. So this module must build the intent from a source that is NOT the simulation response being signed:
//   * settlement: from the settlement state and the digest the debtor APPROVED, accepted only if the obligations, revision and instructions recompute
//     exactly that digest under DB-09 version 2 (the digest binds the network id, the clearing contract, the session, the session token, the obligation
//     commitment, the revision and the instructions). The state may arrive from an untrusted RPC; it authenticates itself against the approved digest.
//   * any other call: from the PreparedCall the SDK built from the user's own request (`intentFromRequirements`), whose contracts must be inside the
//     pinned record. For `join_session` the creator comes from the session record the RPC returned and cannot be authenticated by this module.
// The pinned deployment record (network passphrase, clearing contract, session token contract) is a TRUST ANCHOR chosen by the operator: it proves
// nothing about the contracts' behavior. Nothing here talks to a network, a wallet or the signer.
//
// File formats (JSON, version 1; the Rust parser rejects unknown fields and versions):
//   deployment: {"version":1,"network_passphrase":"...","clearing":"C...","token":"C..."}
//   intent:     {"version":1,"network_passphrase":"...","entries":[{"signer":"G...","tree":{"contract":"C...","fn":"...","args":[{"t":"...","v":...}],"subs":[tree]}}]}
import { EngineError, toHex } from '../amount.ts';
import { parseParty } from '../address.ts';
import { obligationCommitment, proposalDigest } from '../digest.ts';
import type { DigestContext } from '../digest.ts';
import { validatePlan } from '../engine/index.ts';
import type { Instruction, Obligation } from '../engine/index.ts';
import { sha256 } from '../sha256.ts';
import { prepareSettle } from './prepare.ts';
import type { AuthRequirement, Invocation } from './prepare.ts';
import type { ScArg } from './abi.ts';

export const INTENT_VERSION = 1;
export const DEPLOYMENT_VERSION = 1;
const MAX_ENTRIES = 32;

export interface DeploymentRecord {
  version: 1;
  networkPassphrase: string;
  /** TobinClearingV1 (C...) */
  clearing: string;
  /** the session token contract (C...) */
  token: string;
}

export interface IntentTree {
  contract: string;
  fn: string;
  args: ScArg[];
  subs: IntentTree[];
}

export interface IntentEntry {
  /** the account (G...) that must authorize exactly this tree */
  signer: string;
  tree: IntentTree;
}

export interface ExpectedIntent {
  version: 1;
  network_passphrase: string;
  entries: IntentEntry[];
}

const fail = (code: 'INVALID_ID' | 'INVALID_ADDRESS', message: string): never => {
  throw new EngineError(code, message);
};

function passphraseOk(p: unknown): string {
  if (typeof p !== 'string' || p.length === 0 || p.length > 256 || /[\u0000-\u001f\u007f]/.test(p)) fail('INVALID_ID', 'the network passphrase must be 1 to 256 printable characters');
  return p as string;
}

function exactKeys(o: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return fail('INVALID_ID', `${what} must be a JSON object`);
  const rec = o as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (!keys.includes(k)) fail('INVALID_ID', `${what} has an unknown field`);
  for (const k of keys) if (!(k in rec)) fail('INVALID_ID', `${what} is missing field ${k}`);
  return rec;
}

function contractAddress(s: unknown, what: string): string {
  if (typeof s !== 'string') return fail('INVALID_ADDRESS', `${what} must be a contract (C...) address`);
  if (parseParty(s).kind !== 'contract') return fail('INVALID_ADDRESS', `${what} must be a contract (C...) address`);
  return s;
}

/** Strict parser for a pinned deployment record: exact fields, version 1, distinct contract addresses, no secrets possible by construction. */
export function parseDeploymentRecord(text: string): DeploymentRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('INVALID_ID', 'the deployment record is not valid JSON');
  }
  const o = exactKeys(raw, ['version', 'network_passphrase', 'clearing', 'token'], 'the deployment record');
  if (o['version'] !== DEPLOYMENT_VERSION) fail('INVALID_ID', 'unsupported deployment record version');
  const clearing = contractAddress(o['clearing'], 'clearing');
  const token = contractAddress(o['token'], 'token');
  if (clearing === token) fail('INVALID_ID', 'the clearing and token contracts must be different');
  return { version: 1, networkPassphrase: passphraseOk(o['network_passphrase']), clearing, token };
}

/** Canonical text of a deployment record (fixed key order, trailing newline). */
export function deploymentRecordJson(d: DeploymentRecord): string {
  return JSON.stringify({ version: d.version, network_passphrase: d.networkPassphrase, clearing: d.clearing, token: d.token }, null, 2) + '\n';
}

export function networkIdOf(passphrase: string): Uint8Array {
  return sha256(new TextEncoder().encode(passphrase));
}

function treeOf(inv: Invocation, dep: DeploymentRecord): IntentTree {
  if (inv.contract !== dep.clearing && inv.contract !== dep.token) fail('INVALID_ID', 'an invocation names a contract that is not in the pinned deployment record');
  return { contract: inv.contract, fn: inv.fn, args: inv.args, subs: inv.subs.map((s) => treeOf(s, dep)) };
}

/**
 * Build an intent from the authorization requirements of a PreparedCall that the SDK built from the user's own request (create, join, obligation,
 * finalize, propose, approve, settle, mint). Every contract named anywhere in a tree must be one of the two pinned contracts; every signer must be an
 * account. This is the generic path; `settlementIntent` is the one that also authenticates the settlement data.
 */
export function intentFromRequirements(dep: DeploymentRecord, auths: readonly AuthRequirement[]): ExpectedIntent {
  if (auths.length === 0) fail('INVALID_ID', 'there is no authorization to sign for this call');
  if (auths.length > MAX_ENTRIES) fail('INVALID_ID', `more than ${MAX_ENTRIES} authorizations`);
  const entries: IntentEntry[] = auths.map((a) => {
    if (parseParty(a.signer).kind !== 'account') fail('INVALID_ADDRESS', 'a signer must be an account (G...) address');
    return { signer: a.signer, tree: treeOf(a.invocation, dep) };
  });
  return { version: 1, network_passphrase: dep.networkPassphrase, entries };
}

export interface SettlementState {
  sessionId: string;
  /** the admitted participants (the SET is part of the obligation commitment; their order is not) */
  participants: readonly string[];
  obligations: readonly Obligation[];
  /** the proposal revision reported for the proposal the debtors approved */
  revision: number;
  instructions: readonly Instruction[];
  /** the session token reported by the session record; it must equal the pinned token */
  sessionToken: string;
}

/**
 * Build the settlement intent WITHOUT looking at any simulated envelope.
 *
 * `approvedDigest` is the digest the debtor approved (their own record: what the Console showed when they approved, or what their approval signed). It is
 * the anchor. The settlement state may come from an untrusted RPC; it is accepted only if it recomputes `approvedDigest` exactly under DB-09 v2 with the
 * PINNED network id, clearing contract and token. Then the expected `settle` tree and the nested token transfers are derived locally from the verified
 * instructions, in the contract's own order.
 *
 * Throws (and builds nothing) when: the session token differs from the pinned token; the instructions are not a valid plan for the obligations; the
 * recomputed digest differs from `approvedDigest` (a replaced proposal, another revision, tampered data); the plan is all-zero (nothing to sign).
 */
export function settlementIntent(dep: DeploymentRecord, approvedDigest: string, st: SettlementState): ExpectedIntent {
  if (!/^[0-9a-f]{64}$/.test(approvedDigest)) fail('INVALID_ID', 'the approved digest must be 64 lowercase hex characters');
  if (st.sessionToken !== dep.token) fail('INVALID_ID', 'the session token differs from the pinned deployment record');
  const ctx: DigestContext = { networkId: networkIdOf(dep.networkPassphrase), contract: dep.clearing, sessionId: st.sessionId, token: dep.token };
  const verdict = validatePlan(st.participants, st.obligations, st.instructions);
  if (!verdict.ok) fail('INVALID_ID', `the instructions are not a valid settlement plan: ${verdict.error}`);
  const commitment = obligationCommitment(ctx, st.participants, st.obligations);
  const digest = toHex(proposalDigest(ctx, commitment, st.revision, st.instructions));
  if (digest !== approvedDigest) fail('INVALID_ID', 'the settlement data does not recompute the approved digest (replaced proposal, other revision or tampered data)');
  if (st.instructions.length === 0) fail('INVALID_ID', 'an all-zero settlement has no debtor authorization to sign');
  const call = prepareSettle(dep.clearing, { sessionId: st.sessionId, digest: approvedDigest, instructions: st.instructions, token: dep.token });
  return intentFromRequirements(dep, call.auths);
}

/** Canonical text of an intent (fixed key order, trailing newline). */
export function intentJson(i: ExpectedIntent): string {
  const tree = (t: IntentTree): unknown => ({ contract: t.contract, fn: t.fn, args: t.args, subs: t.subs.map(tree) });
  return JSON.stringify({ version: i.version, network_passphrase: i.network_passphrase, entries: i.entries.map((e) => ({ signer: e.signer, tree: tree(e.tree) })) }, null, 2) + '\n';
}
