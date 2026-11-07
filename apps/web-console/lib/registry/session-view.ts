// Presentation model for the session experience. Pure functions: no I/O, so every rule (provenance wording, empty and error states, what a workspace
// may show) is testable without a browser. Nothing here fabricates chain data: obligations and net positions appear ONLY for fixture records, labelled as fixture.
import { computeNets } from 'tobin-mvp1-sdk/engine';
import type { ActivityRecord, Provenance, SessionRecord } from './types.ts';

export interface ProvenanceInfo {
  label: string;
  /** css tone: neutral | warn | info | ok */
  tone: 'neutral' | 'warn' | 'info' | 'ok';
  meaning: string;
  onChain: boolean;
}

export const PROVENANCE: Record<Provenance, ProvenanceInfo> = {
  fixture: { label: 'Fixture', tone: 'neutral', onChain: false, meaning: 'Demonstration data. It was never created on Stellar and nothing here reflects a real session.' },
  'local-draft': { label: 'Local draft', tone: 'warn', onChain: false, meaning: 'Recorded in this application only. No contract was called and no wallet was used: this is not an on-chain session.' },
  'chain-read': { label: 'Chain read', tone: 'info', onChain: true, meaning: 'A read-only RPC observation of this session id exists. The transaction that created it has not been verified here.' },
  'chain-confirmed': { label: 'Chain confirmed', tone: 'ok', onChain: true, meaning: 'The session was read from the chain and the creating transaction was independently confirmed as successful.' },
};

export interface ListingRow {
  sessionId: string;
  shortId: string;
  label: string;
  status: string;
  participants: string;
  createdAt: string;
  provenance: Provenance;
  provenanceLabel: string;
  tone: ProvenanceInfo['tone'];
  activityCount: number;
  lastActivity: string | null;
}

export const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);

/** Status wording never claims an on-chain state the record does not carry. */
export function statusOf(s: SessionRecord): string {
  if (s.chain) return s.chain.state;
  if (s.provenance === 'fixture') return 'Fixture (no chain state)';
  return 'Draft (not on-chain)';
}

export function listingRows(records: readonly SessionRecord[], activity: readonly ActivityRecord[]): ListingRow[] {
  return [...records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => {
      const mine = activity.filter((a) => a.subject === s.sessionId);
      const p = PROVENANCE[s.provenance];
      return {
        sessionId: s.sessionId, shortId: shortId(s.sessionId), label: s.label, status: statusOf(s),
        participants: s.chain ? String(s.chain.participants.length) : 'not read',
        createdAt: s.createdAt, provenance: s.provenance, provenanceLabel: p.label, tone: p.tone,
        activityCount: mine.length, lastActivity: mine.length ? (mine[mine.length - 1] as ActivityRecord).at : null,
      };
    });
}

export type ListingState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'rows'; rows: ListingRow[] };

export function listingState(input: { loading: boolean; error?: string | null; rows?: ListingRow[] }): ListingState {
  if (input.loading) return { kind: 'loading' };
  if (input.error) return { kind: 'error', message: input.error };
  const rows = input.rows ?? [];
  if (rows.length === 0) return { kind: 'empty', message: 'No sessions yet. Create a local draft to start; a draft is not an on-chain session.' };
  return { kind: 'rows', rows };
}

// ---- workspace ----
export const FIXTURE_PARTICIPANTS = [
  { name: 'Fixture Org A', address: 'GDRHND3Y4FO6TM6ZT2TU27QO2TRNKOIXXWYBC75NW73DCYSTNSMYT5CR' },
  { name: 'Fixture Org B', address: 'GB2G73P37CQCQR7U3RAZWRFJKLPEH2ONT3DC7E3FB5ADQRA3LPC4SV3T' },
  { name: 'Fixture Org C', address: 'GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL' },
] as const;
const FIXTURE_OBLIGATIONS = [
  { id: '01'.repeat(32), debtor: 0, creditor: 1, amount: 100n },
  { id: '02'.repeat(32), debtor: 1, creditor: 2, amount: 80n },
  { id: '03'.repeat(32), debtor: 2, creditor: 0, amount: 70n },
] as const;

export interface WorkspaceSection<T> { available: boolean; note: string; items: T[] }

export interface Workspace {
  banner: { label: string; tone: ProvenanceInfo['tone']; meaning: string };
  overview: { sessionId: string; label: string; status: string; createdAt: string; provenance: Provenance; confirmedTxHash: string | null; chainReadLedger: number | null; creator: string | null };
  participants: WorkspaceSection<{ name: string; address: string }>;
  obligations: WorkspaceSection<{ id: string; debtor: string; creditor: string; amount: string }>;
  netPositions: WorkspaceSection<{ name: string; net: string; role: 'debtor' | 'creditor' | 'flat' }> & { grossTotal: string | null; netMoved: string | null };
  activity: { items: { at: string; kind: string; actor: string; detail: string }[]; empty: string | null };
}

const NOT_READ = 'Not read from the chain in this phase. Nothing is shown rather than an invented value.';

/** Application participants: recorded in this application only. Not an on-chain admission; a wallet shown is an unproven claim. */
export interface AppParticipant { name: string; walletClaim?: string }

export function workspaceOf(s: SessionRecord, activity: readonly ActivityRecord[], appParticipants: readonly AppParticipant[] = []): Workspace {
  const p = PROVENANCE[s.provenance];
  const isFixture = s.provenance === 'fixture';
  const mine = activity.filter((a) => a.subject === s.sessionId).map((a) => ({ at: a.at, kind: a.kind, actor: a.actor, detail: a.detail }));

  let participants: Workspace['participants'];
  if (s.chain) participants = { available: true, note: `Read-only RPC observation at ledger ${s.chain.readAtLedger}.`, items: s.chain.participants.map((a) => ({ name: 'Address', address: a })) };
  else if (isFixture) participants = { available: true, note: 'FIXTURE participants.', items: FIXTURE_PARTICIPANTS.map((x) => ({ ...x })) };
  else if (appParticipants.length > 0) participants = { available: true, note: 'APPLICATION participants: recorded in this application only. This is not an on-chain admission, and any wallet shown is an unproven claim.', items: appParticipants.map((p) => ({ name: p.name, address: p.walletClaim ? `${p.walletClaim} (claim, unproven)` : 'no wallet claim' })) };
  else participants = { available: false, note: s.provenance === 'local-draft' ? 'A local draft has no admitted participants: joining is an on-chain action (not available yet).' : NOT_READ, items: [] };

  let obligations: Workspace['obligations'];
  let netPositions: Workspace['netPositions'];
  if (isFixture) {
    const obs = FIXTURE_OBLIGATIONS.map((o) => ({ id: o.id, debtor: FIXTURE_PARTICIPANTS[o.debtor].address, creditor: FIXTURE_PARTICIPANTS[o.creditor].address, amount: o.amount }));
    obligations = { available: true, note: 'FIXTURE obligations (demonstration only).', items: obs.map((o) => ({ id: shortId(o.id), debtor: nameOf(o.debtor), creditor: nameOf(o.creditor), amount: o.amount.toString() })) };
    const nets = computeNets(FIXTURE_PARTICIPANTS.map((x) => x.address), obs);
    const gross = obs.reduce((t, o) => t + o.amount, 0n);
    const moved = nets.reduce((t, n) => (n.net > 0n ? t + n.net : t), 0n);
    netPositions = {
      available: true, note: 'Computed by the real netting engine from the FIXTURE obligations above. Not a real settlement result.',
      items: nets.map((n) => ({ name: nameOf(n.participant), net: n.net.toString(), role: n.net > 0n ? 'debtor' : n.net < 0n ? 'creditor' : 'flat' })),
      grossTotal: gross.toString(), netMoved: moved.toString(),
    };
  } else {
    obligations = { available: false, note: s.provenance === 'local-draft' ? 'Obligations are submitted on-chain by each debtor (not available yet). A draft holds none.' : NOT_READ, items: [] };
    netPositions = { available: false, note: 'Net positions are derived from submitted obligations, which this session does not have here.', items: [], grossTotal: null, netMoved: null };
  }
  return {
    banner: { label: p.label, tone: p.tone, meaning: p.meaning },
    overview: { sessionId: s.sessionId, label: s.label, status: statusOf(s), createdAt: s.createdAt, provenance: s.provenance, confirmedTxHash: s.confirmedTxHash ?? null, chainReadLedger: s.chain?.readAtLedger ?? null, creator: s.chain?.creator ?? null },
    participants, obligations, netPositions,
    activity: { items: mine, empty: mine.length ? null : 'No activity recorded for this session yet.' },
  };
}

function nameOf(address: string): string {
  return FIXTURE_PARTICIPANTS.find((p) => p.address === address)?.name ?? address;
}

/** Human-readable names for activity kinds; an unknown kind is shown as recorded. */
const ACTIVITY_LABEL: Record<string, string> = {
  'session.recorded': 'Session created', 'session.participant-added': 'Participant added', 'session.participant-removed': 'Participant removed',
  'session.state-changed': 'Session state changed', 'session.readiness-evaluated': 'Readiness evaluated', 'session.chain-read': 'Chain read recorded', 'session.confirmed': 'Chain confirmation recorded',
  'obligation.created': 'Obligation created', 'obligation.updated': 'Obligation updated', 'obligation.voided': 'Obligation voided',
  'netting.calculated': 'Net positions calculated', 'netting.failed': 'Calculation refused',
  'authorization.approved': 'Calculation approved', 'authorization.rejected': 'Calculation rejected', 'authorization.invalidated': 'Decision no longer applies',
  'settlement.batch-prepared': 'Settlement batch prepared', 'settlement.batch-approved': 'Settlement batch approved', 'settlement.batch-rejected': 'Settlement batch rejected', 'settlement.batch-invalidated': 'Settlement batch no longer eligible',
  'reviewer.granted': 'Reviewer capability granted', 'reviewer.revoked': 'Reviewer capability revoked',
};
export const activityLabel = (kind: string): string => ACTIVITY_LABEL[kind] ?? kind;
