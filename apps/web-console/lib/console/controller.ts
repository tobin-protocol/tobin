// The Console\'s behaviour, free of any DOM or framework, so it can be tested against the real contract. It drives the SDK; the contract stays
// authoritative; nothing here is shown as confirmed unless the contract itself returned success in the LOCAL SANDBOX the transport describes.
// There is no wallet and no network: every "authorization" is a simulated local grant that the real contract still checks against the exact call.
import { EngineError, parsePositiveAmount, toHex } from 'tobin-mvp1-sdk/amount';
import { sha256 } from 'tobin-mvp1-sdk/sha256';
import { sortInstructions } from 'tobin-mvp1-sdk/engine';
import type { Instruction, ValidationResult } from 'tobin-mvp1-sdk/engine';
import { validatePlan } from 'tobin-mvp1-sdk/engine';
import { TobinClient, TobinError } from 'tobin-mvp1-sdk/sdk';
import type { PreparedCall, Resources, SessionStatus } from 'tobin-mvp1-sdk/sdk';

export interface Persona {
  name: string;
  address: string;
}

export interface TokenInfo {
  name: string;
  address: string;
  cap: string;
}

export interface LogEntry {
  n: number;
  title: string;
  ok: boolean;
  /** what happened, in words: success text or the typed error */
  message: string;
  ranOn: string;
  resources?: Resources;
}

export type ActionKind = 'create' | 'join' | 'obligation' | 'finalize' | 'propose' | 'approve' | 'settle' | 'mint';

export interface PendingAction {
  kind: ActionKind;
  title: string;
  call: PreparedCall;
  /** every account that must authorize this exact call, and whether the user has (simulated-)granted it */
  grants: { signer: string; purpose: string; granted: boolean }[];
  /** for a proposal: the approvals that will be invalidated when it replaces the current one */
  willInvalidate: number;
}

export interface ReplacementNotice {
  fromRevision: number;
  toRevision: number;
  fromDigest: string;
  toDigest: string;
  invalidated: number;
}

export interface DigestCheck {
  commitmentMatches: boolean;
  proposalMatches: boolean | null;
  bytesMatch: boolean;
}

export interface Model {
  ranOn: string;
  personas: Persona[];
  tokens: TokenInfo[];
  balances: Record<string, Record<string, string>>;
  sessionLabel: string | null;
  sessionId: string | null;
  status: SessionStatus | null;
  digestCheck: DigestCheck | null;
  pending: PendingAction | null;
  replacement: ReplacementNotice | null;
  draft: Instruction[] | null;
  draftAdvice: ValidationResult | null;
  draftDigest: string | null;
  /** set only when the contract itself returned success for settle in the sandbox */
  settledInSandbox: boolean;
  log: LogEntry[];
}

/** A whole number that fits a u32 (what the contract takes for a capacity). Accepts a number or the text a form field gives; refuses blank, fractional,
 *  negative, exponent, non-numeric and out-of-range input instead of letting it reach the contract as NaN or a float. */
export function parseU32(v: unknown, what: string): number {
  const text = typeof v === 'number' ? (Number.isSafeInteger(v) ? String(v) : '') : typeof v === 'string' ? v.trim() : '';
  if (!/^(0|[1-9][0-9]*)$/.test(text) || Number(text) > 0xffffffff) throw new EngineError('INVALID_AMOUNT', `${what} must be a whole number between 0 and 4294967295, got ${JSON.stringify(v)}`);
  return Number(text);
}

export function sessionIdFromLabel(label: string): string {
  return toHex(sha256(new TextEncoder().encode(`tobin-console/session/${label}`)));
}

export function obligationIdFrom(label: string, key: string): string {
  return toHex(sha256(new TextEncoder().encode(`tobin-console/obligation/${label}/${key}`)));
}

export class ConsoleController {
  readonly client: TobinClient;
  private m: Model;
  private listeners: (() => void)[] = [];
  private logN = 0;

  constructor(client: TobinClient, init: { personas: Persona[]; tokens: TokenInfo[] }) {
    this.client = client;
    this.m = {
      ranOn: client.ranOn,
      personas: init.personas,
      tokens: init.tokens,
      balances: {},
      sessionLabel: null,
      sessionId: null,
      status: null,
      digestCheck: null,
      pending: null,
      replacement: null,
      draft: null,
      draftAdvice: null,
      draftDigest: null,
      settledInSandbox: false,
      log: [],
    };
  }

  get model(): Model {
    return this.m;
  }

  subscribe(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  nameOf(address: string): string {
    return this.m.personas.find((p) => p.address === address)?.name ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private addr(name: string): string {
    const p = this.m.personas.find((x) => x.name === name);
    if (!p) throw new EngineError('UNKNOWN_PARTY', `no such account: ${name}`);
    return p.address;
  }

  private token(name: string): TokenInfo {
    const t = this.m.tokens.find((x) => x.name === name);
    if (!t) throw new EngineError('UNKNOWN_PARTY', `no such token: ${name}`);
    return t;
  }

  private log(title: string, ok: boolean, message: string, resources?: Resources): void {
    const e: LogEntry = { n: ++this.logN, title, ok, message, ranOn: this.m.ranOn };
    if (resources) e.resources = resources;
    this.m.log.unshift(e);
  }

  // ---- reading ----

  async refreshBalances(): Promise<void> {
    for (const t of this.m.tokens) {
      const row: Record<string, string> = {};
      for (const p of this.m.personas) row[p.name] = (await this.client.tokenBalance(t.address, p.address)).toString();
      this.m.balances[t.address] = row;
    }
  }

  async refresh(): Promise<void> {
    await this.refreshBalances();
    if (this.m.sessionId) {
      try {
        this.m.status = await this.client.getSessionStatus(this.m.sessionId);
        this.m.digestCheck = this.m.status.commitment ? await this.client.verifyDigests(this.m.sessionId).catch(() => null) : null;
      } catch (e) {
        this.m.status = null;
        this.m.digestCheck = null;
        if (!(e instanceof TobinError && e.errorName === 'SessionNotFound')) throw e;
      }
    }
    this.updateDraftAdvice();
    this.emit();
  }

  /** Select the session by label (its id is a hash of the label); loads it if it exists. */
  async selectSession(label: string): Promise<void> {
    this.m.sessionLabel = label;
    this.m.sessionId = sessionIdFromLabel(label);
    this.m.replacement = null;
    this.m.draft = null;
    this.m.settledInSandbox = false;
    this.m.pending = null;
    await this.refresh();
  }

  // ---- the draft proposal ----

  /** The deterministic default proposal as a starting point. It is not authority: the contract validates whatever is submitted. */
  async useDefaultProposal(): Promise<void> {
    if (!this.m.sessionId) throw new EngineError('INVALID_ID', 'select a session first');
    this.m.draft = await this.client.generateDefaultProposal(this.m.sessionId);
    this.updateDraftAdvice();
    this.emit();
  }

  setDraft(list: Instruction[] | null): void {
    this.m.draft = list ? sortInstructions(list) : null;
    this.updateDraftAdvice();
    this.emit();
  }

  private updateDraftAdvice(): void {
    const st = this.m.status;
    const d = this.m.draft;
    if (!st || !d || st.state === 'Open') {
      this.m.draftAdvice = null;
      this.m.draftDigest = null;
      return;
    }
    this.m.draftAdvice = validatePlan(st.participants, st.obligations, d);
    try {
      this.m.draftDigest = st.commitment ? this.client.expectedProposalDigest(st.sessionId, st.token, st.commitment, (st.proposal?.revision ?? 0) + 1, d) : null;
    } catch {
      this.m.draftDigest = null;
    }
  }

  // ---- preparing actions (nothing is sent until confirmPending) ----

  private setPending(kind: ActionKind, title: string, call: PreparedCall, willInvalidate = 0): PendingAction {
    const pending: PendingAction = {
      kind,
      title,
      call,
      grants: call.auths.map((a) => ({ signer: a.signer, purpose: a.purpose, granted: true })),
      willInvalidate,
    };
    this.m.pending = pending;
    this.emit();
    return pending;
  }

  private needSession(): string {
    if (!this.m.sessionId) throw new EngineError('INVALID_ID', 'select a session first');
    return this.m.sessionId;
  }

  prepareCreate(p: { creator: string; token: string; maxParticipants: number | string; maxObligations: number | string }): PendingAction {
    const sessionId = this.needSession();
    const maxParticipants = parseU32(p.maxParticipants, 'max participants');
    const maxObligations = parseU32(p.maxObligations, 'max obligations');
    const call = this.client.prepareCreateSession({ creator: this.addr(p.creator), sessionId, token: this.token(p.token).address, maxParticipants, maxObligations });
    return this.setPending('create', `Create session "${this.m.sessionLabel}" with token ${p.token}`, call);
  }

  async prepareJoin(p: { participant: string }): Promise<PendingAction> {
    const call = await this.client.prepareJoin({ sessionId: this.needSession(), participant: this.addr(p.participant) });
    return this.setPending('join', `Admit ${p.participant} (joiner and creator both authorize)`, call);
  }

  prepareObligation(p: { debtor: string; creditor: string; amount: string; key: string }): PendingAction {
    const sessionId = this.needSession();
    if (p.debtor === p.creditor) throw new EngineError('SAME_PARTY', 'a debtor cannot owe itself: choose two different accounts');
    const amount = parsePositiveAmount(p.amount.trim());
    const obligation = { id: obligationIdFrom(this.m.sessionLabel as string, p.key), debtor: this.addr(p.debtor), creditor: this.addr(p.creditor), amount };
    return this.setPending('obligation', `${p.debtor} owes ${p.creditor} ${amount}`, this.client.prepareSubmitObligation({ sessionId, obligation }));
  }

  prepareFinalize(p: { caller: string }): PendingAction {
    return this.setPending('finalize', `Freeze the obligations (as ${p.caller})`, this.client.prepareFinalize({ sessionId: this.needSession(), caller: this.addr(p.caller) }));
  }

  prepareProposal(p: { proposer: string }): PendingAction {
    const sessionId = this.needSession();
    if (!this.m.draft) throw new EngineError('INVALID_ID', 'there is no draft proposal: generate the default or write one first');
    const cur = this.m.status?.proposal ?? null;
    const willInvalidate = cur ? this.m.status?.approvals.filter((a) => a.approved).length ?? 0 : 0;
    const title = cur ? `Replace the proposal (revision ${cur.revision}) as ${p.proposer}` : `Propose a settlement as ${p.proposer}`;
    return this.setPending('propose', title, this.client.preparePropose({ sessionId, proposer: this.addr(p.proposer), instructions: this.m.draft }), willInvalidate);
  }

  prepareApproval(p: { participant: string }): PendingAction {
    const sessionId = this.needSession();
    const cur = this.m.status?.proposal;
    if (!cur) throw new EngineError('INVALID_ID', 'there is no proposal to approve');
    return this.setPending('approve', `${p.participant} approves proposal ${cur.digest.slice(0, 12)}...`, this.client.prepareApprove({ sessionId, participant: this.addr(p.participant), digest: cur.digest }));
  }

  async prepareSettlement(): Promise<PendingAction> {
    const call = await this.client.prepareSettle(this.needSession());
    return this.setPending('settle', 'Execute the settlement (any caller may submit; each debtor authorizes its own transfers)', call);
  }

  async prepareMint(p: { to: string; token: string; amount: string }): Promise<PendingAction> {
    const t = this.token(p.token);
    const minter = await this.client.send({ contract: t.address, fn: 'minter', args: [], auths: [], description: 'read the minter' });
    return this.setPending('mint', `Mint ${p.amount} ${p.token} to ${p.to}`, this.minting(t.address, String(minter.value), this.addr(p.to), parsePositiveAmount(p.amount.trim())));
  }

  private minting(token: string, minter: string, to: string, amount: bigint): PreparedCall {
    return {
      contract: token,
      fn: 'mint',
      args: [{ t: 'addr', v: to }, { t: 'i128', v: amount.toString() }],
      auths: [{ signer: minter, purpose: 'mint this amount (only the token\'s fixed minter can)', invocation: { contract: token, fn: 'mint', args: [{ t: 'addr', v: to }, { t: 'i128', v: amount.toString() }], subs: [] } }],
      description: 'Mint test tokens',
    };
  }

  setGrant(signer: string, granted: boolean): void {
    const g = this.m.pending?.grants.find((x) => x.signer === signer);
    if (g) g.granted = granted;
    this.emit();
  }

  cancelPending(): void {
    this.m.pending = null;
    this.emit();
  }

  // ---- sending ----

  /** Send the pending action with only the granted authorizations. Returns true on success. A rejection by the contract is logged as such. */
  async confirmPending(): Promise<boolean> {
    const pending = this.m.pending;
    if (!pending) return false;
    const before = this.m.status?.proposal ?? null;
    const approvedBefore = before && this.m.status ? this.m.status.approvals.filter((a) => a.approved).length : 0;
    try {
      const { value, receipt } = await this.client.send(pending.call, { authorize: pending.grants.filter((g) => g.granted).map((g) => g.signer) });
      this.log(pending.title, true, this.successText(pending, value), receipt.resources);
      this.m.pending = null;
      if (pending.kind === 'create' || pending.kind === 'join' || pending.kind === 'obligation' || pending.kind === 'finalize') this.m.replacement = null;
      if (pending.kind === 'settle') this.m.settledInSandbox = true;
      await this.refresh();
      if (pending.kind === 'propose' && this.m.status?.proposal) {
        this.m.replacement = before
          ? { fromRevision: before.revision, toRevision: this.m.status.proposal.revision, fromDigest: before.digest, toDigest: this.m.status.proposal.digest, invalidated: approvedBefore }
          : null;
        this.m.draft = null;
        this.emit();
      }
      return true;
    } catch (e) {
      const why = e instanceof TobinError ? (e.kind === 'policy' ? `REFUSED by the SDK policy: ${e.message}` : `REJECTED by the contract: ${e.message}`) : `failed before reaching the contract: ${String(e)}`;
      // EQ-20: a failed settlement attempt discards its authorization. The pending action is dropped so it cannot be confirmed again; a retry means preparing
      // the settlement anew and granting each debtor's authorization afresh.
      if (pending.kind === 'settle') {
        this.m.pending = null;
        this.log(pending.title, false, `${why} Re-authorization is required: the authorization of this failed attempt was discarded; prepare the settlement again and grant each debtor's authorization afresh.`);
      } else {
        this.log(pending.title, false, why);
      }
      await this.refresh().catch(() => {});
      return false;
    }
  }

  private successText(p: PendingAction, value: unknown): string {
    switch (p.kind) {
      case 'finalize': return `the contract froze the obligations (commitment ${String(value).slice(0, 12)}...)`;
      case 'propose': return `the contract accepted the proposal (digest ${String(value).slice(0, 12)}...)`;
      case 'approve': return value === true ? 'approval recorded; this completed the set (the contract moved the session to APPROVED)' : 'approval recorded';
      case 'settle': return 'the contract recorded SETTLED in the local sandbox';
      default: return 'accepted by the contract';
    }
  }
}
