// Independent comparison of what is ON CHAIN with what Tobin APPROVED (the ExecutionPlan). Pure. It never trusts a transaction hash or a session id alone:
// it compares participants, obligations (id, debtor, creditor, amount), the obligation commitment, the net positions the obligations produce (recomputed here
// with the netting engine), the proposal (exact instructions, order, digest, revision), the approvals, the asset (token) and the settlement result.
// ANY difference means STOP: the execution is flagged reconciliation-required and nothing further is submitted. A different netting result is never accepted.
import { computeNets } from 'tobin-mvp1-sdk/engine';
import type { ExecutionPlan } from './execution-plan.ts';

export type OnChainState = 'Open' | 'Committed' | 'Approved' | 'Settled';
export interface ObservedChain {
  session: { creator: string; token: string; maxParticipants: number; maxObligations: number; state: OnChainState; participants: string[]; obligationCommitment: string | null } | null;
  obligations: { id: string; debtor: string; creditor: string; amount: string }[];
  proposal: { digest: string; instructions: { payer: string; payee: string; amount: string }[]; proposer: string; revision: number } | null;
  approvals: { participant: string; digest: string }[];
  settlement: { digest: string; ledgerSequence: number; totalMoved: string; instructionCount: number } | null;
}
export type Progress = 'not-started' | 'created' | 'obligations-recorded' | 'finalized' | 'proposed' | 'approved' | 'settled';
export interface Comparison {
  /** true only when every observed fact equals the plan (a partial but consistent progress is ok) */
  ok: boolean;
  progress: Progress;
  mismatches: string[];
}

const ORDER: OnChainState[] = ['Open', 'Committed', 'Approved', 'Settled'];

export function compareWithPlan(plan: ExecutionPlan, seen: ObservedChain): Comparison {
  const mm: string[] = [];
  if (!seen.session) return { ok: seen.obligations.length === 0 && !seen.proposal && seen.approvals.length === 0 && !seen.settlement, progress: 'not-started', mismatches: seen.obligations.length || seen.proposal || seen.approvals.length || seen.settlement ? ['session data exists without a session'] : [] };
  const s = seen.session;
  if (s.creator !== plan.creator) mm.push(`creator is ${s.creator} on chain, expected ${plan.creator}`);
  if (s.token !== plan.token) mm.push(`session token is ${s.token}, expected ${plan.token}`);
  if (s.maxParticipants !== plan.participants.length) mm.push(`participant capacity ${s.maxParticipants}, expected ${plan.participants.length}`);
  if (s.maxObligations !== plan.obligations.length) mm.push(`obligation capacity ${s.maxObligations}, expected ${plan.obligations.length}`);

  // participants: admitted so far must be a prefix-consistent subset, creator first
  const want = new Set(plan.participants);
  for (const p of s.participants) if (!want.has(p)) mm.push(`unexpected participant ${p}`);
  if (s.participants[0] !== plan.creator) mm.push('the creator is not the first participant');
  if (new Set(s.participants).size !== s.participants.length) mm.push('a participant appears twice');

  // obligations
  const ob = (o: { id: string; debtor: string; creditor: string; amount: string }) => `${o.id}|${o.debtor}|${o.creditor}|${o.amount}`;
  const wantOb = new Map(plan.obligations.map((o) => [o.id, ob({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: o.amount.toString() })]));
  for (const o of seen.obligations) { const e = wantOb.get(o.id); if (!e) mm.push(`unexpected obligation ${o.id.slice(0, 12)}`); else if (e !== ob(o)) mm.push(`obligation ${o.id.slice(0, 12)} differs: on chain ${o.debtor.slice(0, 6)}>${o.creditor.slice(0, 6)} ${o.amount}`); }
  if (new Set(seen.obligations.map((o) => o.id)).size !== seen.obligations.length) mm.push('an obligation id appears twice');
  const stateIdx = ORDER.indexOf(s.state);
  const complete = seen.obligations.length === plan.obligations.length;
  if (stateIdx >= 1) {
    if (!complete) mm.push(`the session is ${s.state} but only ${seen.obligations.length} of ${plan.obligations.length} obligations are recorded`);
    if (s.participants.length !== plan.participants.length) mm.push('the session is frozen with a different participant set');
    if (s.obligationCommitment !== plan.expectedCommitment) mm.push(`obligation commitment ${s.obligationCommitment ?? 'none'} differs from the expected ${plan.expectedCommitment}`);
  }
  // net positions: recomputed independently from what is ON CHAIN, compared with the approved positions
  if (complete && s.participants.length === plan.participants.length) {
    try {
      const nets = computeNets(s.participants, seen.obligations.map((o) => ({ id: o.id, debtor: o.debtor, creditor: o.creditor, amount: BigInt(o.amount) })));
      const approved = new Map(plan.expectedNets.map((n) => [n.account, n.net]));
      for (const n of nets) if ((approved.get(n.participant) ?? '0') !== n.net.toString()) mm.push(`net position of ${n.participant.slice(0, 8)}... is ${n.net} on chain, approved ${approved.get(n.participant) ?? '0'}`);
    } catch (e) { mm.push('the on-chain obligations cannot be netted: ' + (e as Error).message); }
  }

  // proposal
  if (seen.proposal) {
    const p = seen.proposal;
    if (p.revision !== plan.expectedProposalRevision) mm.push(`proposal revision ${p.revision}, expected ${plan.expectedProposalRevision}`);
    const mine = plan.instructions.map((i) => `${i.payer}>${i.payee}:${i.amount}`);
    const theirs = p.instructions.map((i) => `${i.payer}>${i.payee}:${i.amount}`);
    if (mine.length !== theirs.length) mm.push(`the proposal has ${theirs.length} instructions, the approved batch ${mine.length}`);
    for (let k = 0; k < Math.max(mine.length, theirs.length); k++) if (mine[k] !== theirs[k]) mm.push(`instruction ${k + 1} is ${theirs[k] ?? 'missing'} on chain, approved ${mine[k] ?? 'absent'}`);
    if (p.digest !== plan.expectedDigest) mm.push(`proposal digest ${p.digest} differs from the expected ${plan.expectedDigest}`);
    if (p.proposer !== plan.creator && !want.has(p.proposer)) mm.push('the proposer is not a participant');
  }
  // approvals
  for (const a of seen.approvals) { if (!want.has(a.participant)) mm.push(`approval by a non-participant ${a.participant}`); if (a.digest !== plan.expectedDigest) mm.push(`${a.participant.slice(0, 8)}... approved a different digest`); }
  const approvedAll = plan.participants.every((p) => seen.approvals.some((a) => a.participant === p && a.digest === plan.expectedDigest));
  // settlement
  if (seen.settlement) {
    const t = seen.settlement;
    if (t.digest !== plan.expectedDigest) mm.push('the settled digest differs from the approved one');
    if (t.totalMoved !== plan.expectedTotalMoved) mm.push(`total moved ${t.totalMoved}, approved ${plan.expectedTotalMoved}`);
    if (t.instructionCount !== plan.instructions.length) mm.push(`settled ${t.instructionCount} instructions, approved ${plan.instructions.length}`);
    if (s.state !== 'Settled') mm.push('a settlement result exists but the session is not Settled');
  } else if (s.state === 'Settled') mm.push('the session is Settled but no settlement result is readable');

  const progress: Progress = seen.settlement ? 'settled' : approvedAll ? 'approved' : seen.proposal ? 'proposed' : stateIdx >= 1 ? 'finalized' : seen.obligations.length > 0 ? 'obligations-recorded' : 'created';
  return { ok: mm.length === 0, progress, mismatches: mm };
}
