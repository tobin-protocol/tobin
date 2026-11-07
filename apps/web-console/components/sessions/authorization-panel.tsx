'use client';
// Institutional authorization panel (MVP-1.3). Presentation only: eligibility, snapshot binding, separation of duties and every decision are enforced and
// computed by the server. An approval here is an application-level record bound to one calculation. It is not readiness, not a Stellar signature, not a
// transaction, not a settlement and not an on-chain confirmation. No wallet or network is used anywhere in this file.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api-client.ts';

interface DecisionView { id: string; calculationId: string; decision: 'approved' | 'rejected'; reason: string; decidedBy: string; decidedAt: string; status: 'active' | 'superseded' | 'invalidated'; invalidatedAt?: string; invalidationCause?: string }
interface AuthView { state: 'no-calculation' | 'stale' | 'awaiting-review' | 'approved' | 'rejected'; sessionState: string; currency: 'current' | 'stale' | 'none'; calculationId: string | null; eligibility: { canDecide: boolean; isReviewer: boolean; reasons: string[] }; decisions: DecisionView[]; note: string }
interface Position { userId: string; name: string; net: string; role: 'debtor' | 'creditor' | 'flat' }
interface CalcView { calculation: null | { id: string; asset: string; createdAt: string; createdBy: string; gross: string; obligationCount: number; positions: Position[] } }

const STATE_LABEL: Record<AuthView['state'], { text: string; tone: string }> = {
  'no-calculation': { text: 'No calculation to review', tone: 'neutral' },
  stale: { text: 'Calculation is stale: not reviewable', tone: 'warn' },
  'awaiting-review': { text: 'Awaiting review', tone: 'info' },
  approved: { text: 'Approved (institutional)', tone: 'ok' },
  rejected: { text: 'Rejected', tone: 'warn' },
};
const STATUS_LABEL = { active: 'Current', superseded: 'Superseded by a newer calculation', invalidated: 'No longer applies' } as const;
const Badge = ({ tone, children }: { tone: string; children: string }) => <span className={`ss-badge ss-${tone}`}>{children}</span>;

interface Props { orgId: string; sessionId: string; workflow: 'configuring' | 'ready' | 'closed'; onChanged: () => Promise<void> | void }

export function AuthorizationPanel({ orgId, sessionId, workflow, onChanged }: Props) {
  const base = `/api/registry/orgs/${orgId}/sessions/${sessionId}`;
  const [a, setA] = useState<AuthView | null>(null);
  const [calc, setCalc] = useState<CalcView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [x, y] = await Promise.all([api<AuthView>('GET', `${base}/authorization`), api<CalcView>('GET', `${base}/calculation`)]);
      setA(x); setCalc(y); setLoadError(null);
    } catch (e) { setLoadError((e as Error).message); }
  }, [base]);
  useEffect(() => { void load(); }, [load, workflow]);

  const decide = async (kind: 'approve' | 'reject') => {
    if (!a?.calculationId) return;
    if (kind === 'reject' && reason.trim().length === 0) { setReasonError('A rejection needs a reason.'); return; }
    setReasonError(null); setError(null); setOk(null);
    try {
      await api('POST', `${base}/authorization/${kind}`, { calculationId: a.calculationId, ...(kind === 'reject' ? { reason } : {}) });
      setOk(kind === 'approve' ? 'Calculation approved. This is an institutional decision, not a Stellar signature.' : 'Calculation rejected. Your reason is recorded.');
      setReason(''); setRejecting(false);
    } catch (e) { setError((e as Error).message); }
    await load(); await onChanged();
  };

  const s = a ? STATE_LABEL[a.state] : null;
  const c = calc?.calculation ?? null;
  return (
    <div>
      <p className="ss-note">Institutional authorization is a recorded approval or rejection of one exact calculation by a reviewer. It is not readiness, not a Stellar signature, not a transaction and not a settlement.</p>
      <ol className="ss-ladder" aria-label="Stages">
        <li>Calculation readiness: <strong>{workflow === 'configuring' ? 'being configured' : workflow}</strong></li>
        <li>Institutional authorization: <strong>{s?.text ?? 'loading'}</strong></li>
        <li>Stellar signing: <strong>not available</strong></li>
        <li>Transaction submission: <strong>not available</strong></li>
        <li>On-chain confirmation: <strong>not available</strong></li>
      </ol>
      {error && <p className="ss-error" role="alert">{error}</p>}
      {ok && <p className="ss-notice" role="status">{ok}</p>}
      {loadError && <p className="ss-error" role="alert">Could not load authorization: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {a === null && !loadError && <p className="ss-empty" role="status">Loading authorization…</p>}
      {a && s && (
        <>
          <p>Status: <Badge tone={s.tone}>{s.text}</Badge></p>
          {a.state === 'no-calculation' && <p className="ss-empty">There is nothing to review yet. An administrator calculates net positions on the Net positions tab.</p>}
          {c && (
            <section aria-label="Calculation under review">
              <h4>Calculation under review</h4>
              <dl className="ss-dl">
                <dt>Calculation</dt><dd><code>{c.id}</code></dd>
                <dt>Calculated</dt><dd>{c.createdAt} by {c.createdBy}</dd>
                <dt>Asset</dt><dd>{c.asset}</dd>
                <dt>Source</dt><dd>{c.obligationCount} active obligation(s); gross {c.gross} {c.asset}</dd>
                <dt>Currency</dt><dd>{a.currency === 'current' ? 'Current' : 'Stale'}</dd>
              </dl>
              <table className="ss-list"><caption className="ss-sr">Net positions under review</caption>
                <thead><tr>{['Participant', 'Net position', 'Position'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{c.positions.map((x) => (
                  <tr key={x.userId}><td data-label="Participant">{x.name}</td>
                    <td data-label="Net position"><strong className={`ss-net ss-net-${x.role}`}>{x.role === 'debtor' ? '+' : ''}{x.net}</strong></td>
                    <td data-label="Position">{x.role === 'debtor' ? 'Owes' : x.role === 'creditor' ? 'Is owed' : 'Flat'}</td></tr>))}</tbody>
              </table>
              <p className="ss-note">The obligations behind these positions are listed on the Obligations tab.</p>
            </section>
          )}
          {a.eligibility.canDecide ? (
            <section aria-label="Your decision">
              <h4>Your decision</h4>
              <p className="ss-note">You are eligible to decide on this exact calculation. If anything changes afterwards, the decision stops applying and a new review is needed.</p>
              <p className="ss-actions">
                <button type="button" onClick={() => void decide('approve')}>Approve this calculation</button>
                <button type="button" onClick={() => setRejecting((r) => !r)} aria-expanded={rejecting}>Reject this calculation</button>
              </p>
              {rejecting && (
                <form className="inst-form" onSubmit={(e) => { e.preventDefault(); void decide('reject'); }} aria-label="Reject calculation" noValidate>
                  <label>Reason (required) <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Rejection reason" /></label>
                  <button type="submit">Confirm rejection</button>
                  {reasonError && <p className="ss-error" role="alert">{reasonError}</p>}
                </form>
              )}
            </section>
          ) : (
            <section aria-label="Why you cannot decide">
              <h4>You cannot decide right now</h4>
              <ul>{a.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}
          <h4>Decision history</h4>
          {a.decisions.length === 0 ? <p className="ss-empty">No decisions yet.</p> : (
            <table className="ss-list"><caption className="ss-sr">Authorization decision history</caption>
              <thead><tr>{['Decision', 'Calculation', 'By', 'When', 'Reason', 'Status'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{[...a.decisions].reverse().map((d) => (
                <tr key={d.id}>
                  <td data-label="Decision">{d.decision === 'approved' ? 'Approved' : 'Rejected'}</td>
                  <td data-label="Calculation"><code title={d.calculationId}>{d.calculationId.slice(0, 13)}</code></td>
                  <td data-label="By">{d.decidedBy}</td><td data-label="When">{d.decidedAt}</td><td data-label="Reason">{d.reason || '—'}</td>
                  <td data-label="Status"><Badge tone={d.status === 'active' ? (d.decision === 'approved' ? 'ok' : 'warn') : 'neutral'}>{STATUS_LABEL[d.status]}</Badge>{d.invalidationCause ? <small> {d.invalidationCause}, {d.invalidatedAt?.slice(0, 19)}</small> : null}</td>
                </tr>))}</tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
