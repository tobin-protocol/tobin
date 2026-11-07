// Pure clearing-operations rules (no I/O): amount and asset validation, mapping persisted obligations onto the EXISTING netting engine, the canonical
// input hash used for staleness, and the readiness checks. The netting algorithm itself is NOT here: it is `computeNets` from tobin-mvp1-sdk/engine.
// Application-level only: nothing here signs, submits or settles anything.
import { createHash } from 'node:crypto';
import { computeNets } from 'tobin-mvp1-sdk/engine';
import { EngineError } from 'tobin-mvp1-sdk/amount';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import type { CalculationRecord, ObligationRecord, SessionParticipant, WorkflowState } from './types.ts';
import { RegistryError } from './types.ts';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const I128_MAX = (1n << 127n) - 1n;

/** Assets are Stellar-style codes (1 to 12 upper-case letters or digits). No asset registry exists; a code is accepted if it has this shape. */
export const ASSET_CODE = /^[A-Z0-9]{1,12}$/;

/** Integer base units only: a canonical decimal string, no sign, no decimals, no exponent, no leading zeros, within the engine's i128 range. Never rounds. */
export function parseObligationAmount(v: unknown): string {
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,38}$/.test(v)) throw new RegistryError('INVALID', 'amount must be a positive whole number of base units, written as digits only (no decimals, signs or spaces)');
  if (BigInt(v) > I128_MAX) throw new RegistryError('INVALID', 'amount is above the supported maximum');
  return v;
}
export function parseAsset(v: unknown): string {
  if (typeof v !== 'string' || !ASSET_CODE.test(v)) throw new RegistryError('INVALID', 'asset must be 1 to 12 upper-case letters or digits');
  return v;
}

/**
 * The engine identifies a party by a Stellar-style address. Application participants are users, not wallets, so each participant gets a DETERMINISTIC
 * HANDLE derived from the session and user ids. The handle is a bookkeeping key for the engine only: it is not a wallet, holds no funds and proves nothing.
 */
export const partyHandle = (sessionId: string, userId: string): string => encodeAddress('account', Buffer.from(sha256(`tobin-participant|${sessionId}|${userId}`), 'hex'));

export interface NetInput { participants: string[]; obligations: { id: string; revision: number; debtor: string; creditor: string; amount: string }[] }

/** Canonical input of a calculation: active obligations sorted by id; participants sorted. The hash changes if anything that affects the result changes. */
export function canonicalInput(participantIds: readonly string[], obligations: readonly ObligationRecord[]): NetInput {
  const active = obligations.filter((o) => o.status === 'active');
  return {
    participants: [...new Set(participantIds)].sort(),
    obligations: active.map((o) => ({ id: o.id, revision: o.revision, debtor: o.debtor, creditor: o.creditor, amount: o.amount })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}
export const inputHash = (asset: string, input: NetInput): string => sha256(JSON.stringify({ v: 1, asset, ...input }));

/** Runs the real engine. Throws RegistryError('INVALID') for anything the engine rejects. Positions are in participant order. */
export function runNetting(sessionId: string, input: NetInput): { positions: { userId: string; net: string }[]; gross: string } {
  const handle = new Map(input.participants.map((u) => [u, partyHandle(sessionId, u)]));
  try {
    const nets = computeNets(input.participants.map((u) => handle.get(u) as string), input.obligations.map((o) => {
      const debtor = handle.get(o.debtor); const creditor = handle.get(o.creditor);
      if (!debtor || !creditor) throw new RegistryError('INVALID', 'an obligation names a participant that is not in the calculation');
      return { id: o.id, debtor, creditor, amount: BigInt(o.amount) };
    }));
    const total = nets.reduce((t, n) => t + n.net, 0n);
    if (total !== 0n) throw new RegistryError('INVALID', 'net positions do not sum to zero; the calculation was discarded');
    const gross = input.obligations.reduce((t, o) => t + BigInt(o.amount), 0n);
    return { positions: nets.map((n, i) => ({ userId: input.participants[i] as string, net: n.net.toString() })), gross: gross.toString() };
  } catch (e) {
    if (e instanceof EngineError) throw new RegistryError('INVALID', `the netting engine rejected the input: ${e.message}`);
    throw e;
  }
}

export type Currency = 'current' | 'stale' | 'none';
/** A calculation is current only if its recorded input hash equals the hash of the session's present input. */
export function currencyOf(latest: CalculationRecord | undefined, asset: string, present: NetInput): Currency {
  if (!latest) return 'none';
  return latest.inputHash === inputHash(asset, present) ? 'current' : 'stale';
}

export interface ReadinessCheck { key: string; label: string; ok: boolean; fix: string }
export interface ReadinessInput {
  workflow: WorkflowState;
  participants: readonly SessionParticipant[];
  obligations: readonly ObligationRecord[];
  latest: CalculationRecord | undefined;
}

/** The checks behind "ready". Ready means application-level consistency only: no participant has signed, authorized or settled anything. */
export function readinessChecks(i: ReadinessInput): { checks: ReadinessCheck[]; ready: boolean; asset: string | null; currency: Currency } {
  const active = i.participants.filter((p) => (p.status ?? 'active') === 'active');
  const activeIds = new Set(active.map((p) => p.userId));
  const obs = i.obligations.filter((o) => o.status === 'active');
  const assets = [...new Set(obs.map((o) => o.asset))];
  const asset = assets.length === 1 ? (assets[0] as string) : null;
  const dangling = obs.filter((o) => !activeIds.has(o.debtor) || !activeIds.has(o.creditor));
  let valid = true; let conserved = false;
  const present = canonicalInput(active.map((p) => p.userId), obs);
  try { runNetting('0'.repeat(64), present); conserved = true; } catch { valid = false; }
  const currency = asset ? currencyOf(i.latest, asset, present) : 'none';
  const checks: ReadinessCheck[] = [
    { key: 'state', label: 'The session is being configured', ok: i.workflow === 'configuring', fix: i.workflow === 'ready' ? 'It is already marked ready.' : 'A closed session cannot change.' },
    { key: 'participants', label: 'At least two active participants', ok: active.length >= 2, fix: 'Add participants on the Participants tab.' },
    { key: 'obligations', label: 'At least one active obligation', ok: obs.length >= 1, fix: 'Record obligations on the Obligations tab.' },
    { key: 'references', label: 'Every obligation names two active participants', ok: dangling.length === 0, fix: 'Void or correct obligations that name a removed participant.' },
    { key: 'asset', label: 'All obligations use one asset', ok: assets.length <= 1, fix: 'Netting never mixes assets: void or correct the obligations so one asset remains.' },
    { key: 'valid', label: 'The obligations pass the engine checks', ok: valid, fix: 'Correct the obligations the engine rejects.' },
    { key: 'calculation', label: 'A calculation exists', ok: !!i.latest, fix: 'Calculate net positions on the Net positions tab.' },
    { key: 'current', label: 'The latest calculation is current', ok: currency === 'current', fix: 'Participants or obligations changed after the last calculation: calculate again.' },
    { key: 'conservation', label: 'Net positions sum to zero', ok: conserved && (!i.latest || i.latest.positions.reduce((t, p) => t + BigInt(p.net), 0n) === 0n), fix: 'Recalculate; if this persists the data is inconsistent.' },
  ];
  return { checks, ready: checks.every((c) => c.ok), asset, currency };
}

/** Valid workflow transitions. */
export const TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = { configuring: ['ready'], ready: ['configuring', 'closed'], closed: [] };
