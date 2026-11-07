// Signer-set-aware authorization (MVP-1.5 stage 3). Pure; no network, no database, no secrets.
//
// Concepts kept apart (see the wallet and signing document):
//   * signer-set membership   which keys the CHAIN says may sign for an account, and their weights (read from Horizon and cross-checked with the RPC)
//   * account-level multisig  signatures whose total WEIGHT meets the account's threshold for the operation (InvokeHostFunction needs the MEDIUM threshold)
//   * Soroban authorization   a separate mechanism: a `source_account` credential is covered by the transaction ENVELOPE signatures (account-level multisig);
//                             an address credential for a classic account needs its own signature vector, which the SDK helper (single key) does not assemble.
// Membership proves nothing about a transaction: only a verified set of signatures over THAT transaction hash, with enough weight, under a FRESH signer-set
// fingerprint, authorizes it. Nothing here grants an institutional role or any Tobin permission. Everything fails closed.
import { createHash } from 'node:crypto';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

export type Network = 'testnet' | 'public';
export type Level = 'low' | 'medium' | 'high';
export interface Signer { key: string; weight: number }
export interface Thresholds { low: number; medium: number; high: number }
export interface SignerSet { network: Network; account: string; thresholds: Thresholds; signers: Signer[] }

export class SignerSetError extends Error { constructor(message: string) { super(message); this.name = 'SignerSetError'; } }
const MAX_SIGNERS = 20;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function clean(set: SignerSet): SignerSet {
  const signers = set.signers.filter((s) => s.weight > 0);
  if (new Set(signers.map((s) => s.key)).size !== signers.length) throw new SignerSetError('a signer appears twice');
  if (signers.length === 0 || signers.length > MAX_SIGNERS) throw new SignerSetError(`the signer set must have 1 to ${MAX_SIGNERS} signers`);
  for (const s of signers) if (!Number.isInteger(s.weight) || s.weight < 1 || s.weight > 255) throw new SignerSetError('a signer weight must be 1 to 255');
  for (const t of Object.values(set.thresholds)) if (!Number.isInteger(t) || t < 0 || t > 255) throw new SignerSetError('a threshold must be 0 to 255');
  return { network: set.network, account: set.account, thresholds: { ...set.thresholds }, signers: [...signers].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) };
}

/** The set as Horizon reports it. A signer that is not an ed25519 key (pre-authorized transaction, hash(x)) is refused: this verifier cannot reason about it. */
export function signerSetFromHorizon(h: { id: string; thresholds: { low_threshold: number; med_threshold: number; high_threshold: number }; signers: { key: string; weight: number; type: string }[] }, network: Network): SignerSet {
  for (const s of h.signers) if (s.weight > 0 && s.type !== 'ed25519_public_key') throw new SignerSetError(`unsupported signer type ${s.type}: the set cannot be verified`);
  return clean({ network, account: h.id, thresholds: { low: h.thresholds.low_threshold, medium: h.thresholds.med_threshold, high: h.thresholds.high_threshold }, signers: h.signers.map((s) => ({ key: s.key, weight: s.weight })) });
}
/** The set as the Soroban RPC ledger entry reports it (`thresholds` is 4 hex bytes: master weight, low, medium, high; the master key is the account itself). */
export function signerSetFromRpc(e: { account_id: string; thresholds: string; signers: { key: string; weight: number }[] }, network: Network): SignerSet {
  if (!/^[0-9a-f]{8}$/.test(e.thresholds)) throw new SignerSetError('unreadable thresholds');
  const b = [0, 2, 4, 6].map((i) => parseInt(e.thresholds.slice(i, i + 2), 16));
  const master = b[0] as number;
  for (const s of e.signers) if (!/^G[A-Z2-7]{55}$/.test(s.key)) throw new SignerSetError('unsupported signer key type: the set cannot be verified');
  return clean({ network, account: e.account_id, thresholds: { low: b[1] as number, medium: b[2] as number, high: b[3] as number }, signers: [...e.signers.map((s) => ({ key: s.key, weight: s.weight })), ...(master > 0 ? [{ key: e.account_id, weight: master }] : [])] });
}

/** Versioned fingerprint of everything that decides authorization. Any change to a key, a weight or a threshold changes it. */
export const fingerprintOf = (set: SignerSet): string => { const c = clean(set); return sha(JSON.stringify({ v: 1, network: c.network, account: c.account, thresholds: c.thresholds, signers: c.signers.map((s) => [s.key, s.weight]) })); };

/** Every MINIMAL combination of signers whose weights reach `threshold` (no member can be dropped). */
export function minimalAuthorizingSets(set: SignerSet, threshold: number): string[][] {
  const s = clean(set).signers; const out: string[][] = [];
  for (let mask = 1; mask < 1 << s.length; mask++) {
    const pick = s.filter((_, i) => mask & (1 << i)); const w = pick.reduce((t, x) => t + x.weight, 0);
    if (w >= threshold && pick.every((x) => w - x.weight < threshold)) out.push(pick.map((x) => x.key));
  }
  return out;
}

/** Which of the keys a user has PROVEN control of (wallet ownership challenge) are signers of the account, and with what weight. This is information only: it grants no permission. */
export function signerMembership(set: SignerSet, provenKeys: readonly string[]): { key: string; weight: number }[] {
  const c = clean(set); return provenKeys.filter((k, i) => provenKeys.indexOf(k) === i).flatMap((k) => { const s = c.signers.find((x) => x.key === k); return s ? [{ key: s.key, weight: s.weight }] : []; });
}

export interface EnvelopeVerification {
  ok: boolean;
  fingerprint: string;
  transactionHash: string;
  level: Level;
  threshold: number;
  weight: number;
  signers: { key: string; weight: number }[];
  problems: string[];
}

/**
 * Verifies a transaction ENVELOPE against the account's signer set:
 *  - the signer-set fingerprint must equal the one the approval was based on (stale or changed set: refused);
 *  - the transaction's source must be the account (the source-account credential path), and it must be built for the stated network (the hash binds the passphrase);
 *  - every signature is checked cryptographically over THAT transaction's hash; a signature by an unknown key, an invalid signature, or a second signature by the
 *    same key never adds weight (duplicates are a problem, not a bonus);
 *  - the total weight of the distinct valid signers must reach the threshold of the stated level (exactly enough passes; one short fails);
 *  - every key in `require` (the institutional policy, for example Founder and Security) must be among the valid signers: reaching the weight another way
 *    (for example with the master key) does not satisfy the policy.
 */
export function verifyEnvelope(i: { set: SignerSet; expectedFingerprint: string; passphrase: string; xdr: string; level: Level; require?: readonly string[] }): EnvelopeVerification {
  const problems: string[] = [];
  let set: SignerSet; try { set = clean(i.set); } catch (e) { return { ok: false, fingerprint: '', transactionHash: '', level: i.level, threshold: 0, weight: 0, signers: [], problems: ['the signer set is not usable: ' + (e as Error).message] }; }
  const fingerprint = fingerprintOf(set);
  if (fingerprint !== i.expectedFingerprint) problems.push('the signer set changed or is stale: its fingerprint differs from the one the approval was based on');
  const threshold = set.thresholds[i.level];
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try { tx = TransactionBuilder.fromXDR(i.xdr, i.passphrase); } catch (e) { return { ok: false, fingerprint, transactionHash: '', level: i.level, threshold, weight: 0, signers: [], problems: [...problems, 'the transaction cannot be read: ' + String((e as Error).message).slice(0, 100)] }; }
  const hash = Buffer.from(tx.hash());
  const source = (tx as unknown as { source?: string }).source;
  if (source !== set.account) problems.push(`the transaction source ${source ?? 'unknown'} is not the account ${set.account}: its signatures cannot authorize this account's operation through the envelope`);
  const sigs = (tx as unknown as { signatures: { hint: unknown; signature: unknown }[] }).signatures;
  const bytes = (v: unknown): Buffer => { const raw = typeof v === 'function' ? (v as () => Uint8Array)() : v instanceof Uint8Array ? v : (v as { value: Uint8Array }).value; return Buffer.from(raw); };
  const valid = new Map<string, number>(); const dup = new Set<string>(); let unknown = 0; let bad = 0;
  for (const s of sigs) {
    const sig = bytes(s.signature); const hint = bytes(s.hint);
    const candidates = set.signers.filter((x) => Buffer.from(Keypair.fromPublicKey(x.key).signatureHint()).equals(hint));
    if (candidates.length === 0) { unknown++; continue; }
    const match = candidates.find((x) => { try { return Keypair.fromPublicKey(x.key).verify(hash, sig); } catch { return false; } });
    if (!match) { bad++; continue; }
    if (valid.has(match.key)) { dup.add(match.key); continue; }
    valid.set(match.key, match.weight);
  }
  if (unknown) problems.push(`${unknown} signature(s) are by keys that are not signers of the account`);
  if (bad) problems.push(`${bad} signature(s) do not verify over this transaction (wrong transaction, wrong network, or corrupted)`);
  if (dup.size) problems.push(`a signature by the same key appears more than once (${dup.size}); duplicates add no weight`);
  const weight = [...valid.values()].reduce((t, w) => t + w, 0);
  if (weight < threshold) problems.push(`combined weight ${weight} is below the ${i.level} threshold ${threshold}`);
  for (const k of i.require ?? []) if (!valid.has(k)) problems.push(`required signer ${k} has not validly signed`);
  return { ok: problems.length === 0, fingerprint, transactionHash: hash.toString('hex'), level: i.level, threshold, weight, signers: [...valid].map(([key, w]) => ({ key, weight: w })), problems };
}

// ---------- which authorization mechanism does each plan step need? ----------
export interface StepAuthRequirement { step: number; fn: string; account: string; mechanism: 'single-key' | 'envelope-multisig'; level: 'medium'; threshold: number; mustBeTransactionSource: boolean; ok: boolean; reason: string }
/**
 * For each signer of each step: if the account can meet the medium threshold with ONE key (its master key or any single signer) a source-account or an address
 * credential both work; if it needs SEVERAL keys it can authorize only through the transaction envelope, so it must be the transaction source of that step. A step
 * that would need two such accounts in one transaction cannot be authorized with the official single-key SDK helper and is refused (no hand-assembled signature vectors).
 */
export function authorizationRequirements(steps: { index: number; fn: string; signers: string[] }[], sets: ReadonlyMap<string, SignerSet>): StepAuthRequirement[] {
  const rows: StepAuthRequirement[] = [];
  for (const st of steps) {
    const multisig = st.signers.filter((a) => { const s = sets.get(a); return s ? !clean(s).signers.some((x) => x.weight >= s.thresholds.medium) : false; });
    for (const a of st.signers) {
      const set = sets.get(a);
      if (!set) { rows.push({ step: st.index, fn: st.fn, account: a, mechanism: 'single-key', level: 'medium', threshold: 0, mustBeTransactionSource: false, ok: true, reason: 'no signer set recorded for this account: treated as a single-key account (the key must be the verified one)' }); continue; }
      const needsMany = !clean(set).signers.some((x) => x.weight >= set.thresholds.medium);
      rows.push({ step: st.index, fn: st.fn, account: a, mechanism: needsMany ? 'envelope-multisig' : 'single-key', level: 'medium', threshold: set.thresholds.medium, mustBeTransactionSource: needsMany, ok: !needsMany || multisig.length === 1, reason: needsMany ? (multisig.length === 1 ? `no single key reaches the medium threshold ${set.thresholds.medium}: it must be the transaction source and the envelope must carry enough signer weight` : 'two accounts in one step need several signers each: the single-key SDK helper cannot assemble that; split the step') : 'a single key suffices' });
    }
  }
  return rows;
}

// ---------- live read (fails closed) ----------
export type LiveSignerSet = { ok: true; set: SignerSet; fingerprint: string } | { ok: false; reason: string };
export interface Fetcher { (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> }
/**
 * Reads the signer set from Horizon AND from a second path (the Soroban RPC, via the injected `viaRpc`) and returns it only if both succeed and AGREE exactly.
 * If either source is unavailable, malformed or different, there is NO set: the caller must treat authorization as impossible (fail closed). Manually entered weights
 * are never accepted: the set always comes from the chain.
 */
export async function readLiveSignerSet(o: { account: string; network: Network; horizon: string; fetcher: Fetcher; viaRpc: (account: string) => Promise<{ account_id: string; thresholds: string; signers: { key: string; weight: number }[] }> }): Promise<LiveSignerSet> {
  let a: SignerSet; let b: SignerSet;
  try {
    const r = await o.fetcher(`${o.horizon}/accounts/${o.account}`);
    if (!r.ok) return { ok: false, reason: `Horizon answered ${r.status}: the account data is unavailable` };
    a = signerSetFromHorizon((await r.json()) as Parameters<typeof signerSetFromHorizon>[0], o.network);
  } catch (e) { return { ok: false, reason: 'Horizon could not be read: ' + String((e as Error).message ?? e).slice(0, 120) }; }
  try { b = signerSetFromRpc(await o.viaRpc(o.account), o.network); } catch (e) { return { ok: false, reason: 'the RPC could not be read: ' + String((e as Error).message ?? e).slice(0, 120) }; }
  if (a.account !== o.account || b.account !== o.account) return { ok: false, reason: 'a source answered for a different account' };
  if (fingerprintOf(a) !== fingerprintOf(b)) return { ok: false, reason: 'Horizon and the RPC disagree on the signer set: not trusted' };
  return { ok: true, set: a, fingerprint: fingerprintOf(a) };
}
