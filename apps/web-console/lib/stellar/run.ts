// MVP-1.5 stage 5: the OWNER-RUN, step-by-step on-chain execution of the one-unit settlement. Server side. Every action RE-OBSERVES the chain first; nothing is trusted
// from the browser or from memory. Rules enforced here (not in the UI): steps run strictly in order; a step already on chain is never prepared again; a step whose
// earlier attempt is unresolved (accepted, pending, unknown) is refused until the ORIGINAL hash is read; there is NO automatic retry; a submission needs the exact
// typed confirmation for that step; the settlement amount is capped at 1 base unit; admin-account steps need the live Founder + Security envelope weight; the signed
// transaction is re-simulated immediately before it is sent. Nothing here holds a key. Evidence of each outcome is appended to a local log (public identifiers only).
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { buildExecutionPlan } from './execution-plan.ts';
import type { ExecutionPlan } from './execution-plan.ts';
import { buildAndSimulate, createServer, pollTransaction, readObservedChain, readTransaction, submitSigned, tokenBalance, tokenTotalSupply, TESTNET } from './rpc.ts';
import type { ObservedChain } from './compare.ts';
import { compareWithPlan } from './compare.ts';
import { fetchLiveSignerSet } from './live.ts';
import { verifyEnvelope } from './signer-set.ts';
import { readPolicy } from './cosign.ts';

/** POLICY CHOICE (engineering, flagged to the owner): the founder's 10-ledger maximum was set for the offline signer. A human signing an entry and then two envelope signatures needs longer; this interactive flow uses 30 ledgers (about 2.5 minutes). */
export const ENTRY_LIFETIME_LEDGERS = 30;
export const MAX_UNITS = 1n;

export interface RunConfig { clearing: string; token: string; admin: string; second: string; batchId: string }
const repoRoot = () => process.env['TOBIN_REPO_ROOT'] ?? resolve(process.cwd(), '../../');
export function readRunConfig(): RunConfig {
  const dep = JSON.parse(readFileSync(resolve(repoRoot(), 'contracts/deployments/testnet.json'), 'utf8'));
  if (dep.networkPassphrase !== TESTNET.passphrase) throw new Error('the deployment record is not Testnet');
  const admin = readPolicy().account;
  const second = process.env['TOBIN_SECOND_ACCOUNT']?.trim();
  if (!second) throw new Error('TOBIN_SECOND_ACCOUNT is not set');
  return { clearing: dep.contracts.tobin_clearing_v1.contractId, token: dep.contracts.tobin_test_token_governed.contractId, admin, second, batchId: process.env['TOBIN_BATCH_ID'] ?? 'bat_mvp15_oneunit_01' };
}
export function buildRunPlan(c: RunConfig): ExecutionPlan {
  return buildExecutionPlan({
    network: 'testnet', clearing: c.clearing, assetId: `testnet:contract:${c.token}`, batchId: c.batchId, initiator: 'usr_other',
    accounts: { usr_other: c.second, usr_admin: c.admin }, positions: [{ userId: 'usr_admin', net: '1' }, { userId: 'usr_other', net: '-1' }],
    obligations: [{ id: '0a'.repeat(32), debtor: 'usr_admin', creditor: 'usr_other', amount: '1' }], instructions: [{ payer: 'usr_admin', payee: 'usr_other', amount: '1' }],
  });
}

/** Which plan steps are ALREADY on chain, from the observed state only (never from memory). */
export function stepsDone(plan: ExecutionPlan, o: ObservedChain): boolean[] {
  return plan.steps.map((s) => {
    switch (s.fn) {
      case 'create_session': return !!o.session;
      case 'join_session': return !!o.session && s.signers.some((k) => k !== plan.creator && o.session!.participants.includes(k));
      case 'submit_obligation': return o.obligations.length >= 1;
      case 'finalize_obligations': return !!o.session && o.session.state !== 'Open';
      case 'propose_settlement': return !!o.proposal;
      case 'approve_settlement': return o.approvals.some((a) => a.participant === s.signers[0] && a.digest === plan.expectedDigest);
      case 'settle': return !!o.settlement;
      default: return false;
    }
  });
}

type Outcome = 'SUBMITTING' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REJECTED' | 'UNKNOWN';
interface Attempt { hash: string; outcome: Outcome; at: string }
const ATTEMPTS = new Map<number, Attempt>();
interface Prepared { step: number; xdr: string; source: string; fingerprint: string | null; expires: number }
const PREPARED = new Map<string, Prepared>();
const hashOf = (x: string) => Buffer.from(TransactionBuilder.fromXDR(x, TESTNET.passphrase).hash()).toString('hex');
const logFile = () => resolve(repoRoot(), 'docs/product/architecture/mvp-1.5/evidence/settlement-run-2026-11-07.jsonl');
const record = (e: Record<string, unknown>) => { try { appendFileSync(logFile(), JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n'); } catch { /* the log is a convenience; the chain is the record */ } };

// SDK 17 exposes XDR values as plain typed objects: the first operation's auth list is edited in place
const invokeAuth = (env: xdr.TransactionEnvelope): xdr.SorobanAuthorizationEntry[] => (env as any).v1.tx.operations[0].body.invokeHostFunctionOp.auth;
const rootOf = (e: any): string => JSON.stringify(e.rootInvocation, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

export interface Gate { id: string; ok: boolean; detail: string }
export interface RunStatus {
  ok: true; config: RunConfig; planFingerprint: string; sessionId: string; expectedDigest: string; progress: string; mismatches: string[];
  steps: { index: number; fn: string; signers: string[]; done: boolean; attempt: Attempt | null }[]; next: number | null; gates: Gate[];
  balances: { admin: string | null; second: string | null; totalSupply: string | null };
}
export async function runStatus(): Promise<RunStatus | { ok: false; reason: string }> {
  let c: RunConfig; let plan: ExecutionPlan;
  try { c = readRunConfig(); plan = buildRunPlan(c); } catch (e) { return { ok: false, reason: String((e as Error).message ?? e) }; }
  const server = createServer();
  let observed: ObservedChain;
  try { observed = await readObservedChain(server, plan, c.admin); } catch (e) { return { ok: false, reason: 'cannot read the chain: ' + String((e as Error).message ?? e).slice(0, 160) }; }
  const cmp = compareWithPlan(plan, observed);
  const done = stepsDone(plan, observed);
  const next = done.every(Boolean) ? null : done.findIndex((d) => !d) + 1;
  const bal = async (a: string) => { try { return await tokenBalance(server, c.token, a, c.admin); } catch { return null; } };
  const balances = { admin: await bal(c.admin), second: await bal(c.second), totalSupply: await tokenTotalSupply(server, c.token, c.admin).catch(() => null) };
  const live = await fetchLiveSignerSet(c.admin); const pol = readPolicy();
  const settled = done[done.length - 1] === true;
  const gates: Gate[] = [
    { id: 'network', ok: plan.networkPassphrase === TESTNET.passphrase, detail: 'Stellar Testnet only' },
    { id: 'amount', ok: plan.expectedTotalMoved !== '0' && BigInt(plan.expectedTotalMoved) <= MAX_UNITS, detail: `the plan moves ${plan.expectedTotalMoved} base unit(s); the cap is ${MAX_UNITS}` },
    { id: 'chain-consistent', ok: cmp.ok, detail: cmp.ok ? `on chain: ${cmp.progress}` : cmp.mismatches.join('; ') },
    { id: 'supply', ok: balances.totalSupply === '1', detail: `total supply of the governed token: ${balances.totalSupply ?? 'unreadable'} (expected 1)` },
    { id: 'funds', ok: settled || balances.admin === '1', detail: `administrative account balance: ${balances.admin ?? 'unreadable'} (needs 1 before settlement)` },
    { id: 'admin-signers', ok: live.ok && pol.required.every((r) => live.ok && live.set.signers.some((s) => s.key === r.key)), detail: live.ok ? `live signer set fingerprint ${live.fingerprint}; Founder and Security present` : live.reason },
  ];
  const steps = plan.steps.map((s, i) => ({ index: s.index, fn: s.fn, signers: s.signers, done: done[i] === true, attempt: ATTEMPTS.get(s.index) ?? null }));
  return { ok: true, config: c, planFingerprint: plan.fingerprint, sessionId: plan.sessionId, expectedDigest: plan.expectedDigest, progress: cmp.progress, mismatches: cmp.mismatches, steps, next, gates, balances };
}

export interface PreparedStep { step: number; fn: string; hash: string; xdr: string; source: string; fee: string; minResourceFee: string | null; latestLedger: number | null; entryValidUntil: number | null; pendingEntries: { index: number; address: string; entryXdr: string }[]; envelopeSigners: { role: string; key: string }[]; passphrase: string; note: string }
export async function prepareStep(step: number): Promise<{ ok: true; prepared: PreparedStep } | { ok: false; reason: string }> {
  const st = await runStatus(); if (!st.ok) return st;
  const bad = st.gates.find((g) => !g.ok); if (bad) return { ok: false, reason: `gate "${bad.id}" is not satisfied: ${bad.detail}` };
  if (st.next !== step) return { ok: false, reason: st.next === null ? 'every step is already on chain' : `the next step is ${st.next}, not ${step}` };
  const a = ATTEMPTS.get(step); if (a && a.outcome !== 'FAILED' && a.outcome !== 'REJECTED') return { ok: false, reason: `step ${step} has an unresolved earlier attempt (${a.outcome}, hash ${a.hash}): resolve it by reading that hash first; nothing is resent automatically` };
  const plan = buildRunPlan(st.config); const ps = plan.steps[step - 1]!; const source = ps.signers[0]!;
  const server = createServer();
  const r = await buildAndSimulate(server, ps.call, source);
  if (!r.simulation.ok) return { ok: false, reason: 'the simulation against the real chain state failed: ' + String(r.simulation.error).slice(0, 300) };
  const auth = invokeAuth(xdr.TransactionEnvelope.fromXDR(r.xdr, 'base64')); const latest = r.simulation.latestLedger ?? null;
  const pendingEntries = r.simulation.authEntries.map((e, index) => ({ e, index })).filter(({ e }) => e.credentials === 'address_v2' || e.credentials === 'address').map(({ e, index }) => ({ index, address: String(e.address), entryXdr: auth[index]!.toXDR('base64') }));
  const hash = hashOf(r.xdr);
  const pol = readPolicy(); const adminSource = source === st.config.admin;
  const live = adminSource ? await fetchLiveSignerSet(st.config.admin) : null;
  if (live && !live.ok) return { ok: false, reason: live.reason };
  PREPARED.set(hash, { step, xdr: r.xdr, source, fingerprint: live && live.ok ? live.fingerprint : null, expires: Date.now() + 20 * 60 * 1000 });
  return { ok: true, prepared: { step, fn: ps.fn, hash, xdr: r.xdr, source, fee: r.fee, minResourceFee: r.simulation.minResourceFee ?? null, latestLedger: latest, entryValidUntil: latest === null ? null : latest + ENTRY_LIFETIME_LEDGERS, pendingEntries, envelopeSigners: adminSource ? pol.required : [{ role: 'participant', key: source }], passphrase: TESTNET.passphrase, note: ps.note } };
}

/** Puts an authorization entry signed by its owner (through Freighter, in the browser) into the prepared transaction and re-simulates it so the network itself checks the signature. */
export async function attachEntry(hash: string, index: number, signedEntryXdr: string): Promise<{ ok: true; xdr: string; hash: string } | { ok: false; reason: string }> {
  const p = PREPARED.get(hash); if (!p || p.expires < Date.now()) return { ok: false, reason: 'this transaction was not prepared here or it expired' };
  let env: xdr.TransactionEnvelope; let entry: xdr.SorobanAuthorizationEntry;
  try { env = xdr.TransactionEnvelope.fromXDR(p.xdr, 'base64'); entry = xdr.SorobanAuthorizationEntry.fromXDR(signedEntryXdr, 'base64'); } catch { return { ok: false, reason: 'the authorization entry cannot be read' }; }
  const auth = invokeAuth(env);
  if (!auth[index]) return { ok: false, reason: 'no such authorization entry' };
  if (rootOf(auth[index]) !== rootOf(entry)) return { ok: false, reason: 'the signed entry authorizes a different invocation than the prepared one' };
  auth[index] = entry;
  const next = env.toXDR('base64'); const nh = hashOf(next);
  const sim = await createServer().simulateTransaction(TransactionBuilder.fromXDR(next, TESTNET.passphrase) as never);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, reason: 'the network did not accept the signed entry in simulation: ' + String(sim.error).slice(0, 240) };
  PREPARED.delete(hash); PREPARED.set(nh, { ...p, xdr: next });
  return { ok: true, xdr: next, hash: nh };
}

export type SubmitResult = { ok: false; reason: string } | { ok: true; outcome: Outcome; hash: string; detail: string; ledger?: number; progress: string };
export async function submitStep(step: number, signedXdr: string, confirmation: string): Promise<SubmitResult> {
  if (confirmation !== `I CONFIRM SUBMIT STEP ${step}`) return { ok: false, reason: 'the exact confirmation text was not given' };
  let hash: string; try { hash = hashOf(signedXdr); } catch { return { ok: false, reason: 'the transaction cannot be read' }; }
  const p = PREPARED.get(hash); if (!p || p.step !== step || p.expires < Date.now()) return { ok: false, reason: 'this exact transaction was not prepared for this step here, or it expired: prepare it again' };
  const prior = ATTEMPTS.get(step); if (prior && prior.outcome !== 'FAILED' && prior.outcome !== 'REJECTED') return { ok: false, reason: 'this step already has an attempt that is not resolved as failed' };
  const st = await runStatus(); if (!st.ok) return st;
  const bad = st.gates.find((g) => !g.ok); if (bad) return { ok: false, reason: `gate "${bad.id}" is not satisfied: ${bad.detail}` };
  if (st.next !== step) return { ok: false, reason: `the next step on chain is ${st.next}, not ${step}` };
  const pol = readPolicy(); const admin = st.config.admin;
  const live = await fetchLiveSignerSet(p.source); if (!live.ok) return { ok: false, reason: live.reason };
  const need = p.source === admin ? pol.required.map((r) => r.key) : [p.source];
  const v = verifyEnvelope({ set: live.set, expectedFingerprint: p.fingerprint ?? live.fingerprint, passphrase: TESTNET.passphrase, xdr: signedXdr, level: 'medium', require: need });
  if (!v.ok || !need.every((k) => v.signers.some((s) => s.key === k))) return { ok: false, reason: 'the envelope signatures are not sufficient: ' + (v.problems.join('; ') || 'a required signer is missing') };
  const server = createServer();
  const sim = await server.simulateTransaction(TransactionBuilder.fromXDR(signedXdr, TESTNET.passphrase) as never);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, reason: 'the final simulation against the current chain state failed: ' + String(sim.error).slice(0, 240) };
  ATTEMPTS.set(step, { hash, outcome: 'SUBMITTING', at: new Date().toISOString() }); record({ event: 'submitting', step, hash });
  const sent = await submitSigned(server, signedXdr, hash);
  let outcome: Outcome; let detail: string; let ledger: number | undefined;
  if (sent.kind === 'rejected') { outcome = 'REJECTED'; detail = sent.reason; }
  else if (sent.kind === 'unknown') { outcome = 'UNKNOWN'; detail = sent.reason; }
  else {
    const t = await pollTransaction(server, hash, { attempts: 20, delayMs: 2000 });
    if (t.status === 'SUCCESS') { outcome = 'SUCCESS'; ledger = t.ledger; detail = `included in ledger ${t.ledger}`; }
    else if (t.status === 'FAILED') { outcome = 'FAILED'; ledger = t.ledger; detail = `failed on chain in ledger ${t.ledger}`; }
    else { outcome = 'UNKNOWN'; detail = `accepted by the network but not yet found (${t.status}): the outcome is UNKNOWN; read the hash later, never resend`; }
  }
  ATTEMPTS.set(step, { hash, outcome, at: new Date().toISOString() }); PREPARED.delete(hash); record({ event: 'outcome', step, hash, outcome, detail, ledger: ledger ?? null });
  const after = await runStatus();
  return { ok: true, outcome, hash, detail, ...(ledger !== undefined ? { ledger } : {}), progress: after.ok ? after.progress : 'unreadable' };
}

/** Reads the ORIGINAL hash of an unresolved attempt; NOT_FOUND stays unknown. */
export async function resolveStep(step: number): Promise<{ ok: false; reason: string } | { ok: true; outcome: Outcome; hash: string; detail: string }> {
  const a = ATTEMPTS.get(step); if (!a) return { ok: false, reason: 'no attempt recorded for this step' };
  const t = await readTransaction(createServer(), a.hash);
  if (t.status === 'SUCCESS' || t.status === 'FAILED') { ATTEMPTS.set(step, { ...a, outcome: t.status }); record({ event: 'resolved', step, hash: a.hash, outcome: t.status, ledger: t.ledger ?? null }); return { ok: true, outcome: t.status, hash: a.hash, detail: `ledger ${t.ledger}` }; }
  return { ok: true, outcome: a.outcome, hash: a.hash, detail: `${t.status}: still unknown` };
}
