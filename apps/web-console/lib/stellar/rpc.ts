// Stellar RPC layer (official SDK): argument encoding, UNSIGNED transaction construction, simulation, the independent chain reader, and submission with polling.
// Nothing here holds a key, signs, or stores a signed envelope. Signing is the wallet's job (see freighter.ts) and happens in the user's browser.
// Safety rules enforced here: a simulation failure yields no transaction to sign; a submission timeout or an unreadable status is UNKNOWN (never failed, never
// confirmed) and is never retried by this module; confirmation comes only from an independent read of the transaction by hash.
import { Account, Address, Contract, TransactionBuilder, nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';
import type { xdr } from '@stellar/stellar-sdk';
import type { PreparedCall } from 'tobin-mvp1-sdk/sdk';
import type { ScArg } from 'tobin-mvp1-sdk/sdk';
import type { ExecutionPlan } from './execution-plan.ts';
import type { ObservedChain, OnChainState } from './compare.ts';

export const TESTNET = { passphrase: 'Test SDF Network ; September 2015', rpc: 'https://soroban-testnet.stellar.org' } as const;
const J = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) as any;
const bytes = (hex: string) => nativeToScVal(Buffer.from(hex, 'hex'), { type: 'bytes' });

/** Encodes the SDK's tagged arguments exactly as the contract's Rust types expect (structs are symbol-keyed maps). */
export function toScVal(a: ScArg): xdr.ScVal {
  switch (a.t) {
    case 'addr': return new Address(a.v).toScVal();
    case 'bytes32': return bytes(a.v);
    case 'i128': return nativeToScVal(BigInt(a.v), { type: 'i128' });
    case 'u32': return nativeToScVal(a.v, { type: 'u32' });
    case 'string': return nativeToScVal(a.v, { type: 'string' });
    case 'obligation': return nativeToScVal({ id: Buffer.from(a.v.id, 'hex'), debtor: new Address(a.v.debtor), creditor: new Address(a.v.creditor), amount: BigInt(a.v.amount) }, { type: { id: ['symbol', 'bytes'], debtor: ['symbol', 'address'], creditor: ['symbol', 'address'], amount: ['symbol', 'i128'] } });
    case 'instructions': return nativeToScVal(a.v.map((i) => ({ payer: new Address(i.payer), payee: new Address(i.payee), amount: BigInt(i.amount) })), { type: a.v.map(() => ({ payer: ['symbol', 'address'], payee: ['symbol', 'address'], amount: ['symbol', 'i128'] })) as never });
  }
}

export interface SimulationSummary {
  ok: boolean;
  error?: string;
  minResourceFee?: string;
  /** credential type of every authorization entry the NETWORK returned (for example AddressV2 under protocol 30) */
  authEntries: { credentials: string; address?: string }[];
  returnValue?: unknown;
  latestLedger?: number;
}
export interface BuiltTransaction {
  /** unsigned, assembled (footprint, resources and authorization entries from the simulation): what the wallet is asked to sign */
  xdr: string;
  source: string;
  sequence: string;
  simulation: SimulationSummary;
  fee: string;
}

export const createServer = (url: string = TESTNET.rpc) => new rpc.Server(url, { allowHttp: false });

const callOp = (c: Contract, fn: string, args: ScArg[]) => c.call(fn, ...args.map(toScVal));

function summarize(sim: any): SimulationSummary {
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: String(sim.error), authEntries: [], latestLedger: sim.latestLedger };
  const auth = (sim.result?.auth ?? []).map((e: unknown) => { const j = J(e); const cred = j.credentials; const type = typeof cred === 'string' ? cred : Object.keys(cred ?? {})[0] ?? 'unknown'; const inner = typeof cred === 'string' ? undefined : Object.values(cred ?? {})[0] as { address?: string } | undefined; return { credentials: type, ...(inner?.address ? { address: String(inner.address) } : {}) }; });
  return { ok: true, minResourceFee: String(sim.minResourceFee), authEntries: auth, latestLedger: sim.latestLedger, ...(sim.result?.retval !== undefined ? { returnValue: safeNative(sim.result.retval) } : {}) };
}
const safeNative = (v: xdr.ScVal): unknown => { try { return J(scValToNative(v)); } catch { return undefined; } };

/**
 * Builds the UNSIGNED transaction for one prepared call from a real source account (its real sequence number is read from the network), simulates it, and returns
 * the assembled transaction only if the simulation succeeded. Resource fees come from the simulation: none are invented. `source` pays the fee; it need not be
 * the account that signs the authorization entries.
 */
export async function buildAndSimulate(server: rpc.Server, call: PreparedCall, source: string, passphrase: string = TESTNET.passphrase, timeoutSeconds = 300): Promise<BuiltTransaction> {
  const acct = await server.getAccount(source);
  const tx = new TransactionBuilder(new Account(source, acct.sequenceNumber()), { fee: '100', networkPassphrase: passphrase }).addOperation(callOp(new Contract(call.contract), call.fn, call.args)).setTimeout(timeoutSeconds).build();
  const sim = await server.simulateTransaction(tx);
  const simulation = summarize(sim);
  if (!simulation.ok) return { xdr: '', source, sequence: acct.sequenceNumber(), simulation, fee: '0' };
  const prepared = rpc.assembleTransaction(tx, sim as rpc.Api.SimulateTransactionSuccessResponse).build();
  return { xdr: prepared.toXDR(), source, sequence: acct.sequenceNumber(), simulation, fee: String(prepared.fee) };
}

// ---------------- independent reads ----------------
async function view(server: rpc.Server, clearing: string, source: string, fn: string, args: ScArg[], passphrase: string): Promise<{ ok: true; value: any } | { ok: false; error: string }> {
  const tx = new TransactionBuilder(new Account(source, '0'), { fee: '100', networkPassphrase: passphrase }).addOperation(callOp(new Contract(clearing), fn, args)).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: String(sim.error) };
  return { ok: true, value: J(scValToNative((sim as any).result.retval)) };
}
const hex = (v: unknown): string => (typeof v === 'string' ? v : Buffer.from(Object.values(v as object) as number[]).toString('hex'));
const STATE: Record<number, OnChainState> = { 1: 'Open', 2: 'Committed', 3: 'Approved', 4: 'Settled' };

/** Reads everything the comparison engine needs from the chain: the session, obligations, proposal, approvals and settlement. A missing item reads as null / empty. */
export async function readObservedChain(server: rpc.Server, plan: ExecutionPlan, source: string, passphrase: string = TESTNET.passphrase): Promise<ObservedChain> {
  const sid: ScArg = { t: 'bytes32', v: plan.sessionId };
  const s = await view(server, plan.clearing, source, 'get_session', [sid], passphrase);
  if (!s.ok) { if (/Error\(Contract, #1\)/.test(s.error)) return { session: null, obligations: [], proposal: null, approvals: [], settlement: null }; throw new Error('cannot read the session: ' + s.error); }
  const v = s.value;
  const session = { creator: String(v.creator), token: String(v.token), maxParticipants: Number(v.max_participants), maxObligations: Number(v.max_obligations), state: STATE[Number(v.state)] as OnChainState, participants: (v.participants as string[]).map(String), obligationCommitment: v.obligation_commitment ? hex(v.obligation_commitment) : null };
  const o = await view(server, plan.clearing, source, 'get_obligations', [sid], passphrase);
  const obligations = o.ok ? (o.value as any[]).map((x) => ({ id: hex(x.id), debtor: String(x.debtor), creditor: String(x.creditor), amount: String(x.amount) })) : [];
  const p = await view(server, plan.clearing, source, 'get_proposal', [sid], passphrase);
  const proposal = p.ok ? { digest: hex(p.value.digest), instructions: (p.value.instructions as any[]).map((i) => ({ payer: String(i.payer), payee: String(i.payee), amount: String(i.amount) })), proposer: String(p.value.proposer), revision: Number(p.value.revision) } : null;
  const a = await view(server, plan.clearing, source, 'get_approvals', [sid], passphrase);
  const approvals = a.ok ? (a.value as any[]).map((x) => ({ participant: String(x.participant), digest: hex(x.digest) })) : [];
  const t = await view(server, plan.clearing, source, 'get_settlement', [sid], passphrase);
  const settlement = t.ok ? { digest: hex(t.value.digest), ledgerSequence: Number(t.value.ledger_sequence), totalMoved: String(t.value.total_moved), instructionCount: Number(t.value.instruction_count) } : null;
  return { session, obligations, proposal, approvals, settlement };
}

export async function tokenBalance(server: rpc.Server, token: string, account: string, source: string, passphrase: string = TESTNET.passphrase): Promise<string> {
  const r = await view(server, token, source, 'balance', [{ t: 'addr', v: account }], passphrase);
  if (!r.ok) throw new Error('cannot read the balance: ' + r.error);
  return String(r.value);
}

/** Total supply of a Soroban token contract (read-only simulation). */
export async function tokenTotalSupply(server: rpc.Server, token: string, source: string, passphrase: string = TESTNET.passphrase): Promise<string> {
  const r = await view(server, token, source, 'total_supply', [], passphrase);
  if (!r.ok) throw new Error('cannot read the total supply: ' + r.error);
  return String(r.value);
}

// ---------------- transaction status (independent read by hash) ----------------
export type TxStatus = 'SUCCESS' | 'FAILED' | 'NOT_FOUND' | 'UNAVAILABLE';
export interface ChainTransaction { hash: string; status: TxStatus; ledger?: number; createdAt?: number; applicationOrder?: number; returnValue?: unknown; detail?: string }
export interface TxReader { getTransaction(hash: string): Promise<any> }

/** An independent read of one transaction. NOT_FOUND and UNAVAILABLE are UNKNOWN outcomes: they are never reported as failed or confirmed. */
export async function readTransaction(server: TxReader, hash: string): Promise<ChainTransaction> {
  let r: any;
  try { r = await server.getTransaction(hash); } catch (e) { return { hash, status: 'UNAVAILABLE', detail: String((e as Error).message ?? e).slice(0, 200) }; }
  const status = String(r?.status ?? '');
  if (status === 'NOT_FOUND') return { hash, status: 'NOT_FOUND' };
  if (status === 'SUCCESS' || status === 'FAILED') return { hash, status, ledger: Number(r.ledger), createdAt: Number(r.createdAt), applicationOrder: Number(r.applicationOrder), ...(r.returnValue !== undefined ? { returnValue: safeNative(r.returnValue) } : {}) };
  return { hash, status: 'UNAVAILABLE', detail: 'unrecognized status ' + status };
}

// ---------------- submission (never retries; unknown is unknown) ----------------
export type SubmitOutcome =
  | { kind: 'accepted'; hash: string }          // the network accepted it for inclusion (PENDING): NOT a confirmation
  | { kind: 'duplicate'; hash: string }         // the network already knows this transaction: look it up, do not send again
  | { kind: 'rejected'; hash?: string; reason: string } // refused before inclusion: record and investigate before any retry
  | { kind: 'unknown'; hash: string; reason: string };  // timeout or transport error: the outcome is NOT known. Never resubmit; read the hash
export interface Submitter { sendTransaction(tx: unknown): Promise<any> }

/** Submits an already SIGNED transaction. The hash is computed locally BEFORE sending so an unknown outcome can always be looked up. */
export async function submitSigned(server: Submitter, signedXdr: string, hash: string, passphrase: string = TESTNET.passphrase): Promise<SubmitOutcome> {
  let res: any;
  try { res = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, passphrase)); } catch (e) { return { kind: 'unknown', hash, reason: 'no response from the network: ' + String((e as Error).message ?? e).slice(0, 160) }; }
  const st = String(res?.status ?? '');
  if (st === 'PENDING') return { kind: 'accepted', hash: String(res.hash ?? hash) };
  if (st === 'DUPLICATE') return { kind: 'duplicate', hash: String(res.hash ?? hash) };
  if (st === 'ERROR') return { kind: 'rejected', hash: String(res.hash ?? hash), reason: 'the network rejected the transaction before inclusion' };
  if (st === 'TRY_AGAIN_LATER') return { kind: 'unknown', hash, reason: 'the network asked to try again later: the transaction may not have been queued' };
  return { kind: 'unknown', hash, reason: 'unrecognized submission status ' + st };
}

/** Polls the ORIGINAL hash until it is final or the deadline passes. A deadline is UNKNOWN, never failure. */
export async function pollTransaction(server: TxReader, hash: string, opts: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> }): Promise<ChainTransaction> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: ChainTransaction = { hash, status: 'NOT_FOUND' };
  for (let i = 0; i < opts.attempts; i++) {
    last = await readTransaction(server, hash);
    if (last.status === 'SUCCESS' || last.status === 'FAILED') return last;
    if (i < opts.attempts - 1) await sleep(opts.delayMs);
  }
  return last; // NOT_FOUND or UNAVAILABLE: unknown
}
