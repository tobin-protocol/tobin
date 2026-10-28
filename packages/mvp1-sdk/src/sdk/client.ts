// TobinClient: a typed client over the REAL TobinClearingV1 / TobinTestToken interface. The contract stays authoritative: nothing here assumes
// that a proposal generated off-chain is valid, that a prepared call will be accepted, or that anything happened beyond what the transport
// reports. Every method that changes state returns a receipt that carries the transport's own description of where the call ran.
import { EngineError, fromHex, toHex } from '../amount.ts';
import { arg, parseApproval, parseObligation, parseProposal, parseSession, parseSettlement } from './abi.ts';
import type { ApprovalRecord, ProposalRecord, SessionRecord, SettlementRecord } from './abi.ts';
import { TobinError, toTobinError } from './errors.ts';
import {
  debtorAuthorizations,
  prepareApprove,
  prepareCreateSession,
  prepareFinalize,
  prepareJoin,
  prepareMint,
  preparePropose,
  prepareQuery,
  prepareSettle,
  prepareSubmitObligation,
} from './prepare.ts';
import type { DebtorAuthorization, PreparedCall } from './prepare.ts';
import type { InvokeOptions, Resources, Transport } from './transport.ts';
import { settlementIntent } from './intent.ts';
import type { DeploymentRecord, ExpectedIntent } from './intent.ts';
import { allZero, computeNets, defaultProposal, validatePlan } from '../engine/index.ts';
import type { Instruction, NetPosition, Obligation, ValidationResult } from '../engine/index.ts';
import { obligationBytes, obligationCommitment, proposalBytes, proposalDigest } from '../digest.ts';
import type { DigestContext } from '../digest.ts';

export interface ClientConfig {
  transport: Transport;
  /** the TobinClearingV1 contract (C...) */
  clearing: string;
  /** the 32-byte network id, needed only for local digest verification (SHA-256 of the network passphrase) */
  networkId?: Uint8Array;
}

export interface CallReceipt {
  fn: string;
  /** what the transport said about itself, e.g. "local sandbox: Soroban test host, no network" */
  ranOn: string;
  eventCount?: number;
  resources?: Resources;
}

export interface SessionStatus {
  sessionId: string;
  state: SessionRecord['state'];
  creator: string;
  token: string;
  participants: string[];
  maxParticipants: number;
  maxObligations: number;
  obligations: Obligation[];
  /** computed locally from the contract's own obligation list; advisory */
  nets: NetPosition[];
  allZero: boolean;
  commitment: string | null;
  proposal: ProposalRecord | null;
  /** approvals of the CURRENT digest only; approvals of an older digest never count */
  approvals: { participant: string; approved: boolean }[];
  missingApprovals: string[];
  /** the authorizations every debtor of the current proposal must still give at settlement (approvals do not replace them) */
  debtorAuthorizations: DebtorAuthorization[];
  settlement: SettlementRecord | null;
  advice: { defaultProposal: Instruction[] | null; currentValidation: ValidationResult | null; currentIsDefault: boolean | null };
  next: string[];
}

export class TobinClient {
  readonly cfg: ClientConfig;
  /** authorization rounds (PreparedCall.authorizationId) that were already attempted. Failed settlement attempts are never retried with the same authorization (EQ-20). */
  private readonly attempted = new Set<string>();
  constructor(cfg: ClientConfig) {
    this.cfg = cfg;
  }

  get ranOn(): string {
    return this.cfg.transport.description;
  }

  // ---- low level ----

  /** Send a prepared call; returns the value or throws a typed TobinError. */
  async send(call: PreparedCall, options?: InvokeOptions): Promise<{ value: unknown; receipt: CallReceipt }> {
    if (call.authorizationId !== undefined) {
      // consumed BEFORE the attempt, so every outcome (contract refusal, transport failure, success) uses the round up
      if (this.attempted.has(call.authorizationId)) {
        throw new TobinError('policy', 'ReauthorizationRequired', null, call.fn, 'this authorization was already used in an attempt; after a failed settlement the old authorization is discarded and every debtor must authorize afresh: prepare the settlement again. A new transaction or sequence number alone is not fresh authorization');
      }
      this.attempted.add(call.authorizationId);
    }
    const r = await this.cfg.transport.invoke(call, options);
    if (!r.ok) throw toTobinError(call.fn, r.errorType, r.code, r.codeName);
    const receipt: CallReceipt = { fn: call.fn, ranOn: this.ranOn };
    if (r.eventCount !== undefined) receipt.eventCount = r.eventCount;
    if (r.resources !== undefined) receipt.resources = r.resources;
    return { value: r.value, receipt };
  }

  private async read(fn: string, args: PreparedCall['args']): Promise<unknown> {
    return (await this.send(prepareQuery(this.cfg.clearing, fn, args))).value;
  }

  // ---- preparation (pure: no transport call; states what each signer must authorize) ----

  prepareCreateSession = (p: Parameters<typeof prepareCreateSession>[1]): PreparedCall => prepareCreateSession(this.cfg.clearing, p);

  async prepareJoin(p: { sessionId: string; participant: string }): Promise<PreparedCall> {
    const s = await this.getSession(p.sessionId);
    return prepareJoin(this.cfg.clearing, { ...p, creator: s.creator });
  }

  prepareSubmitObligation = (p: Parameters<typeof prepareSubmitObligation>[1]): PreparedCall => prepareSubmitObligation(this.cfg.clearing, p);
  prepareFinalize = (p: Parameters<typeof prepareFinalize>[1]): PreparedCall => prepareFinalize(this.cfg.clearing, p);
  preparePropose = (p: Parameters<typeof preparePropose>[1]): PreparedCall => preparePropose(this.cfg.clearing, p);
  prepareApprove = (p: Parameters<typeof prepareApprove>[1]): PreparedCall => prepareApprove(this.cfg.clearing, p);

  /** Settlement for the CURRENT proposal (read from the contract). `digest` defaults to the current digest; passing a stale one lets the
   *  contract reject it with DigestMismatch. */
  async prepareSettle(sessionId: string, digest?: string): Promise<PreparedCall> {
    const s = await this.getSession(sessionId);
    const p = await this.getProposal(sessionId);
    return prepareSettle(this.cfg.clearing, { sessionId, digest: digest ?? p?.digest ?? '00'.repeat(32), instructions: p?.instructions ?? [], token: s.token });
  }

  // ---- state-changing calls ----

  async createSession(p: Parameters<typeof prepareCreateSession>[1], o?: InvokeOptions): Promise<CallReceipt> {
    return (await this.send(this.prepareCreateSession(p), o)).receipt;
  }

  async joinSession(p: { sessionId: string; participant: string }, o?: InvokeOptions): Promise<CallReceipt> {
    return (await this.send(await this.prepareJoin(p), o)).receipt;
  }

  async submitObligation(p: { sessionId: string; obligation: Obligation }, o?: InvokeOptions): Promise<CallReceipt> {
    return (await this.send(this.prepareSubmitObligation(p), o)).receipt;
  }

  /** Returns the obligation commitment (64 hex). */
  async finalizeObligations(p: { sessionId: string; caller: string }, o?: InvokeOptions): Promise<{ commitment: string; receipt: CallReceipt }> {
    const { value, receipt } = await this.send(this.prepareFinalize(p), o);
    return { commitment: String(value), receipt };
  }

  /** Create or replace the proposal. Returns the new digest and how many approvals the replacement invalidated. */
  async proposeSettlement(
    p: { sessionId: string; proposer: string; instructions: readonly Instruction[] },
    o?: InvokeOptions,
  ): Promise<{ digest: string; approvalsInvalidated: number; replacedDigest: string | null; receipt: CallReceipt }> {
    const before = await this.getProposal(p.sessionId).catch(() => null);
    const approvalsBefore = before ? (await this.getApprovals(p.sessionId)).filter((a) => a.digest === before.digest).length : 0;
    const { value, receipt } = await this.send(this.preparePropose(p), o);
    return { digest: String(value), approvalsInvalidated: approvalsBefore, replacedDigest: before ? before.digest : null, receipt };
  }

  /** Returns `completed: true` when this approval completed the set (the session is then APPROVED). */
  async approveSettlement(p: { sessionId: string; participant: string; digest: string }, o?: InvokeOptions): Promise<{ completed: boolean; receipt: CallReceipt }> {
    const { value, receipt } = await this.send(this.prepareApprove(p), o);
    return { completed: value === true, receipt };
  }

  /** Submit the settlement. ANY caller may submit; every debtor must authorize its own transfers. Success means the CONTRACT recorded SETTLED
   *  in the world the transport runs; the receipt says which world that is. */
  async settle(p: { sessionId: string; digest?: string }, o?: InvokeOptions): Promise<CallReceipt> {
    return (await this.send(await this.prepareSettle(p.sessionId, p.digest), o)).receipt;
  }

  async mint(token: string, p: { minter: string; to: string; amount: bigint }, o?: InvokeOptions): Promise<CallReceipt> {
    return (await this.send(prepareMint(token, p), o)).receipt;
  }

  // ---- reads ----

  async config(): Promise<{ participantCeiling: number; obligationCeiling: number; instructionCeiling: number }> {
    const v = (await this.read('config', [])) as Record<string, number>;
    return { participantCeiling: Number(v['participant_ceiling']), obligationCeiling: Number(v['obligation_ceiling']), instructionCeiling: Number(v['instruction_ceiling']) };
  }

  async getSession(sessionId: string): Promise<SessionRecord> {
    return parseSession(await this.read('get_session', [arg.bytes32(sessionId)]));
  }

  async getObligations(sessionId: string): Promise<Obligation[]> {
    return ((await this.read('get_obligations', [arg.bytes32(sessionId)])) as unknown[]).map(parseObligation);
  }

  /** The current proposal, or null when none exists yet. */
  async getProposal(sessionId: string): Promise<ProposalRecord | null> {
    try {
      return parseProposal(await this.read('get_proposal', [arg.bytes32(sessionId)]));
    } catch (e) {
      if (e instanceof TobinError && e.errorName === 'NoProposal') return null;
      throw e;
    }
  }

  /** The terminal record, or null before settlement. */
  async getSettlement(sessionId: string): Promise<SettlementRecord | null> {
    try {
      return parseSettlement(await this.read('get_settlement', [arg.bytes32(sessionId)]));
    } catch (e) {
      if (e instanceof TobinError && e.errorName === 'WrongState') return null;
      throw e;
    }
  }

  async getApprovals(sessionId: string): Promise<ApprovalRecord[]> {
    return ((await this.read('get_approvals', [arg.bytes32(sessionId)])) as unknown[]).map(parseApproval);
  }

  async commitmentBytes(sessionId: string): Promise<string> {
    return String(await this.read('commitment_bytes', [arg.bytes32(sessionId)]));
  }

  async proposalBytes(sessionId: string): Promise<string> {
    return String(await this.read('proposal_bytes', [arg.bytes32(sessionId)]));
  }

  async tokenBalance(token: string, who: string): Promise<bigint> {
    return BigInt(String((await this.send(prepareQuery(token, 'balance', [arg.addr(who)]))).value));
  }

  // ---- proposal and digest helpers ----

  /** The deterministic default proposal for the session\'s frozen obligations. A convenience: the contract accepts any valid plan and has never
   *  been told this one is canonical. Not valid until the contract accepts it. */
  async generateDefaultProposal(sessionId: string): Promise<Instruction[]> {
    const s = await this.getSession(sessionId);
    return defaultProposal(s.participants, await this.getObligations(sessionId));
  }

  /** Advisory pre-check of a plan against the contract\'s published rules. NOT authority. */
  async validateProposal(sessionId: string, plan: readonly Instruction[]): Promise<ValidationResult> {
    const s = await this.getSession(sessionId);
    return validatePlan(s.participants, await this.getObligations(sessionId), plan);
  }

  digestContext(sessionId: string, token: string): DigestContext {
    if (!this.cfg.networkId) throw new EngineError('INVALID_ID', 'networkId is required to compute digests locally');
    return { networkId: this.cfg.networkId, contract: this.cfg.clearing, sessionId, token };
  }

  /** Recompute BOTH digests locally from the contract\'s own data and compare bytes and hashes with what the contract reports. */
  async verifyDigests(sessionId: string): Promise<{ commitmentMatches: boolean; proposalMatches: boolean | null; bytesMatch: boolean }> {
    const s = await this.getSession(sessionId);
    if (!s.obligationCommitment) throw new EngineError('INVALID_ID', 'the obligations are not finalized yet');
    const ctx = this.digestContext(sessionId, s.token);
    const obs = await this.getObligations(sessionId);
    const oBytes = obligationBytes(ctx, s.participants, obs);
    const commitment = obligationCommitment(ctx, s.participants, obs);
    const oMatch = toHex(commitment) === s.obligationCommitment;
    let bytesMatch = toHex(oBytes) === (await this.commitmentBytes(sessionId));
    const p = await this.getProposal(sessionId);
    let pMatch: boolean | null = null;
    if (p) {
      pMatch = toHex(proposalDigest(ctx, commitment, p.revision, p.instructions)) === p.digest;
      bytesMatch = bytesMatch && toHex(proposalBytes(ctx, commitment, p.revision, p.instructions)) === (await this.proposalBytes(sessionId));
    }
    return { commitmentMatches: oMatch, proposalMatches: pMatch, bytesMatch };
  }

  /**
   * The expected intent for signing a debtor's settlement authorization (see intent.ts). The data is READ from the transport, which may be untrusted;
   * it is accepted only if it recomputes approvedDigest, the digest the debtor approved and holds independently, under the PINNED deployment record.
   * Nothing from a simulated envelope is used.
   */
  async settlementIntent(sessionId: string, approvedDigest: string, dep: DeploymentRecord): Promise<ExpectedIntent> {
    if (dep.clearing !== this.cfg.clearing) throw new EngineError('INVALID_ID', 'the client is configured for a different clearing contract than the pinned deployment record');
    const s = await this.getSession(sessionId);
    const p = await this.getProposal(sessionId);
    if (!p) throw new EngineError('INVALID_ID', 'there is no proposal to authorize a settlement for');
    const obligations = await this.getObligations(sessionId);
    return settlementIntent(dep, approvedDigest, { sessionId, participants: s.participants, obligations, revision: p.revision, instructions: p.instructions, sessionToken: s.token });
  }

  /** The digest a participant should compute BEFORE approving, from a plan, without trusting any reported value. */
  /** The digest a proposal WOULD have at `revision` (EQ-05: the revision is part of the digest, so identical instructions at another revision differ). */
  expectedProposalDigest(sessionId: string, token: string, commitmentHex: string, revision: number, plan: readonly Instruction[]): string {
    return toHex(proposalDigest(this.digestContext(sessionId, token), fromHex(commitmentHex), revision, plan));
  }

  /** The digest the NEXT accepted proposal will have: current revision + 1 (or 1 when there is none), read from the contract. */
  async expectedNextProposalDigest(sessionId: string, plan: readonly Instruction[]): Promise<{ revision: number; digest: string }> {
    const s = await this.getSession(sessionId);
    if (!s.obligationCommitment) throw new EngineError('INVALID_ID', 'the obligations are not finalized yet');
    const cur = await this.getProposal(sessionId);
    const revision = (cur?.revision ?? 0) + 1;
    return { revision, digest: this.expectedProposalDigest(sessionId, s.token, s.obligationCommitment, revision, plan) };
  }

  // ---- status ----

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const s = await this.getSession(sessionId);
    const obligations = await this.getObligations(sessionId);
    const proposal = await this.getProposal(sessionId);
    const approvalsAll = await this.getApprovals(sessionId);
    const settlement = await this.getSettlement(sessionId);
    const nets = computeNets(s.participants, obligations);
    const approved = new Set(proposal ? approvalsAll.filter((a) => a.digest === proposal.digest).map((a) => a.participant) : []);
    const approvals = s.participants.map((participant) => ({ participant, approved: approved.has(participant) }));
    const missingApprovals = proposal ? s.participants.filter((p) => !approved.has(p)) : [...s.participants];
    const frozen = s.state !== 'Open';
    const def = frozen ? defaultProposal(s.participants, obligations) : null;
    const sameList = (a: readonly Instruction[], b: readonly Instruction[]): boolean => a.length === b.length && a.every((x, i) => x.payer === (b[i] as Instruction).payer && x.payee === (b[i] as Instruction).payee && x.amount === (b[i] as Instruction).amount);
    const next: string[] = [];
    if (s.state === 'Open') next.push('Participants can still join (the joiner and the creator both authorize) and debtors can submit obligations. Any admitted participant may finalize.');
    if (s.state === 'Committed' && !proposal) next.push('Obligations are frozen. Any admitted participant may propose a settlement; the default plan is available as a starting point.');
    if (s.state === 'Committed' && proposal) next.push(`Waiting for approval of the current proposal from: ${missingApprovals.length} participant(s). Nothing completes by itself; a missing approval keeps the session here.`);
    if (s.state === 'Approved') next.push('Every admitted participant approved the current proposal. Any caller may settle, once every debtor authorizes its own transfers.');
    if (s.state === 'Settled') next.push('The contract recorded SETTLED. Check the receipt\'s transport to see which world that was.');
    return {
      sessionId,
      state: s.state,
      creator: s.creator,
      token: s.token,
      participants: s.participants,
      maxParticipants: s.maxParticipants,
      maxObligations: s.maxObligations,
      obligations,
      nets,
      allZero: allZero(nets),
      commitment: s.obligationCommitment,
      proposal,
      approvals,
      missingApprovals,
      debtorAuthorizations: proposal ? debtorAuthorizations(proposal.instructions) : [],
      settlement,
      advice: {
        defaultProposal: def,
        currentValidation: proposal ? validatePlan(s.participants, obligations, proposal.instructions) : null,
        currentIsDefault: proposal && def ? sameList(proposal.instructions, def) : null,
      },
      next,
    };
  }
}
