'use client';
// Settlement PREPARATION panel (MVP-1.4). Presentation only: eligibility, validation, instruction generation and every decision are computed and enforced by the
// server. A prepared or approved batch is a set of application records. It is NOT signed, NOT submitted and NOT settled: no wallet, no Stellar transaction and no
// network appears in this file, and no funds have moved. Wallet signing, submission and on-chain confirmation do not exist in this application yet.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api-client.ts';

type Status = 'awaiting-review' | 'approved' | 'rejected' | 'invalidated' | 'superseded';
interface Check { key: string; label: string; ok: boolean; detail: string }
interface Asset { id: string; network: string; kind: string; code: string; issuer?: string }
interface Summary { id: string; calculationId: string; status: Status; asset: Asset; instructionCount: number; totalAmount: string; preparedBy: string; preparedAt: string; decision?: { decision: 'approved' | 'rejected'; reason: string; decidedBy: string; decidedAt: string }; invalidation?: { cause: string; at: string } }
interface ListView { preview: { checks: Check[]; ready: boolean; calculationId: string | null }; note: string; batches: Summary[] }
interface Instruction { id: string; seq: number; payerName: string; payeeName: string; assetId: string; amount: string; validation: string; calculationId: string; batchId: string }
interface BatchView { batch: { id: string; calculationId: string; asset: Asset; instructionCount: number; totalAmount: string; instructionsHash: string; algorithm: string; preparedBy: string; preparedAt: string }; status: Status; validation: Check[]; eligibility: { canDecide: boolean; reasons: string[] }; instructions: Instruction[]; review?: { decision: 'approved' | 'rejected'; reason: string; decidedBy: string; decidedAt: string }; invalidation?: { cause: string; at: string }; note: string }

const STATUS: Record<Status, { text: string; tone: string }> = {
  'awaiting-review': { text: 'Awaiting review', tone: 'info' },
  approved: { text: 'Batch approved (not signed, not settled)', tone: 'ok' },
  rejected: { text: 'Batch rejected', tone: 'warn' },
  invalidated: { text: 'No longer eligible', tone: 'neutral' },
  superseded: { text: 'Superseded by a newer calculation', tone: 'neutral' },
};
const Badge = ({ tone, children }: { tone: string; children: string }) => <span className={`ss-badge ss-${tone}`}>{children}</span>;
const Mark = ({ ok }: { ok: boolean }) => <><span aria-hidden="true">{ok ? '✓' : '✗'}</span><span className="ss-sr">{ok ? 'Passed: ' : 'Failed: '}</span></>;
const assetText = (a: Asset) => (a.kind === 'native' ? `${a.code} (native, ${a.network})` : `${a.code} issued by ${a.issuer?.slice(0, 6)}…${a.issuer?.slice(-4)} (${a.network})`);

interface Props { orgId: string; sessionId: string; canEdit: boolean; workflow: 'configuring' | 'ready' | 'closed'; onChanged: () => Promise<void> | void }

export function SettlementPanel({ orgId, sessionId, canEdit, workflow, onChanged }: Props) {
  const base = `/api/registry/orgs/${orgId}/sessions/${sessionId}/settlement`;
  const [list, setList] = useState<ListView | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<BatchView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (keep?: string | null) => {
    try {
      const l = await api<ListView>('GET', base); setList(l); setLoadError(null);
      const current = keep ?? sel;
      const pick = (current && l.batches.some((b) => b.id === current)) ? current : (l.batches[l.batches.length - 1]?.id ?? null);
      setSel(pick);
      setView(pick ? await api<BatchView>('GET', `${base}/batches/${pick}`) : null);
    } catch (e) { setLoadError((e as Error).message); }
  }, [base, sel]);
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [base, workflow]);

  const prepare = async () => {
    if (!list?.preview.calculationId) return;
    setBusy(true); setError(null); setOk(null);
    try { const r = await api<{ batchId: string }>('POST', `${base}/prepare`, { calculationId: list.preview.calculationId }); setOk('Settlement batch prepared. Nothing has been signed, submitted or settled.'); await load(r.batchId); await onChanged(); }
    catch (e) { setError((e as Error).message); await load(); }
    finally { setBusy(false); }
  };
  const decide = async (kind: 'approve' | 'reject') => {
    if (!view) return;
    if (kind === 'reject' && reason.trim().length === 0) { setReasonError('A rejection needs a reason.'); return; }
    setReasonError(null); setError(null); setOk(null);
    try {
      await api('POST', `${base}/batches/${view.batch.id}/${kind}`, { instructionsHash: view.batch.instructionsHash, ...(kind === 'reject' ? { reason } : {}) });
      setOk(kind === 'approve' ? 'Batch approved. This is an institutional decision on the prepared instructions: it is not a signature and nothing has been settled.' : 'Batch rejected. Your reason is recorded.');
      setReason(''); setRejecting(false);
    } catch (e) { setError((e as Error).message); }
    await load(view.batch.id); await onChanged();
  };

  const pv = list?.preview;
  const check = (k: string) => pv?.checks.find((c) => c.key === k)?.ok ?? false;
  const mine = list?.batches.find((b) => b.calculationId === pv?.calculationId);
  const stage = (text: string, on: boolean, yes: string, no: string) => <li>{text}: <strong>{on ? yes : no}</strong></li>;
  const preparing = pv && !(mine && (mine.status === 'awaiting-review' || mine.status === 'approved' || mine.status === 'rejected'));

  return (
    <div>
      <p className="ss-note">Settlement preparation turns an approved calculation into a reviewable set of transfer instructions. It prepares; it does not execute. No funds have moved, and nothing here is signed, submitted or confirmed on Stellar.</p>
      <ol className="ss-ladder" aria-label="Stages">
        {stage('Clearing calculation', check('calculation'), 'complete', 'unavailable')}
        {stage('Institutional calculation approval', check('approval'), 'approved', 'unavailable')}
        {stage('Settlement preparation', !!mine && (mine.status === 'awaiting-review' || mine.status === 'approved' || mine.status === 'rejected'), 'prepared', 'not prepared')}
        {stage('Batch institutional approval', mine?.status === 'approved', 'approved (application-level)', 'not approved')}
        <li>Wallet signing: <strong>not available in MVP-1.4</strong></li>
        <li>Transaction submission: <strong>not available in MVP-1.4</strong></li>
        <li>On-chain confirmation: <strong>not available in MVP-1.4</strong></li>
      </ol>
      {error && <p className="ss-error" role="alert">{error}</p>}
      {ok && <p className="ss-notice" role="status">{ok}</p>}
      {loadError && <p className="ss-error" role="alert">Could not load settlement preparation: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {list === null && !loadError && <p className="ss-empty" role="status">Loading settlement preparation…</p>}

      {list && pv && (
        <>
          {preparing && (
            <section aria-label="Preparation checks">
              <h4>Can a batch be prepared?</h4>
              <ul className="ss-checks">{pv.checks.map((c) => <li key={c.key}><Mark ok={c.ok} />{c.label}<small> — {c.detail}</small></li>)}</ul>
              {canEdit && workflow !== 'closed'
                ? <p className="ss-actions"><button type="button" onClick={() => void prepare()} disabled={!pv.ready || busy}>{busy ? 'Preparing…' : 'Prepare settlement batch'}</button>{!pv.ready && <small>Fix the failed checks first.</small>}</p>
                : <p className="ss-note">{workflow === 'closed' ? 'The session is closed.' : 'An administrator prepares the batch.'}</p>}
            </section>
          )}
          {mine && <p>Batch from the current calculation: <Badge tone={STATUS[mine.status].tone}>{STATUS[mine.status].text}</Badge></p>}

          {view && (
            <section aria-label="Batch under review">
              <h4>Batch {view.batch.id.slice(0, 12)}</h4>
              <p>Status: <Badge tone={STATUS[view.status].tone}>{STATUS[view.status].text}</Badge></p>
              {view.invalidation && <p className="ss-note">No longer eligible since {view.invalidation.at.slice(0, 19)}: {view.invalidation.cause}. Calculate again, obtain a fresh approval and prepare a new batch.</p>}
              <dl className="ss-dl">
                <dt>Source calculation</dt><dd><code>{view.batch.calculationId}</code></dd>
                <dt>Asset</dt><dd>{assetText(view.batch.asset)}<br /><small><code>{view.batch.asset.id}</code> (operator-configured list; no on-chain check)</small></dd>
                <dt>Instructions</dt><dd>{view.batch.instructionCount} instruction(s), total {view.batch.totalAmount} base units</dd>
                <dt>Prepared</dt><dd>{view.batch.preparedAt} by {view.batch.preparedBy}</dd>
                <dt>Fingerprint</dt><dd><code>{view.batch.instructionsHash.slice(0, 24)}…</code></dd>
                <dt>Algorithm</dt><dd>{view.batch.algorithm} (one valid allocation, not claimed minimal or unique)</dd>
              </dl>
              <h5>Instructions</h5>
              {view.instructions.length === 0 ? <p className="ss-empty">No transfers are required: every net position is zero.</p> : (
                <table className="ss-list"><caption className="ss-sr">Settlement instructions</caption>
                  <thead><tr>{['#', 'ID', 'From (pays)', 'To (receives)', 'Asset', 'Amount', 'Validation'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                  <tbody>{view.instructions.map((i) => (
                    <tr key={i.id}><td data-label="#">{i.seq}</td><td data-label="ID"><code title={i.id}>{i.id.slice(0, 12)}</code></td><td data-label="From (pays)">{i.payerName}</td><td data-label="To (receives)">{i.payeeName}</td><td data-label="Asset">{view.batch.asset.code}</td><td data-label="Amount">{i.amount}</td><td data-label="Validation"><Badge tone="ok">valid</Badge></td></tr>))}</tbody>
                </table>
              )}
              <h5>Validation</h5>
              <ul className="ss-checks">{view.validation.map((c) => <li key={c.key}><Mark ok={c.ok} />{c.label}<small> — {c.detail}</small></li>)}</ul>

              {view.review && (
                <p className="ss-note">Decision: <strong>{view.review.decision === 'approved' ? 'Approved' : 'Rejected'}</strong> by {view.review.decidedBy} at {view.review.decidedAt}{view.review.reason ? `. Reason: ${view.review.reason}` : ''}.</p>
              )}
              {view.eligibility.canDecide ? (
                <section aria-label="Batch decision">
                  <h5>Your decision on this batch</h5>
                  <p className="ss-note">You are eligible to decide on these exact instructions. Approval is an application-level decision, not a Stellar signature.</p>
                  <p className="ss-actions"><button type="button" onClick={() => void decide('approve')}>Approve this batch</button><button type="button" onClick={() => setRejecting((r) => !r)} aria-expanded={rejecting}>Reject this batch</button></p>
                  {rejecting && (
                    <form className="inst-form" onSubmit={(e) => { e.preventDefault(); void decide('reject'); }} aria-label="Reject batch" noValidate>
                      <label>Reason (required) <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Batch rejection reason" /></label>
                      <button type="submit">Confirm rejection</button>
                      {reasonError && <p className="ss-error" role="alert">{reasonError}</p>}
                    </form>
                  )}
                </section>
              ) : (
                <section aria-label="Why you cannot decide on this batch">
                  <h5>You cannot decide on this batch</h5>
                  <ul>{view.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </section>
              )}
            </section>
          )}

          <h4>Batch history</h4>
          {list.batches.length === 0 ? <p className="ss-empty">No batches yet. Once a calculation is approved, an administrator can prepare one.</p> : (
            <table className="ss-list"><caption className="ss-sr">Settlement batch history</caption>
              <thead><tr>{['Batch', 'Calculation', 'Status', 'Asset', 'Instructions', 'Prepared', 'Decision', 'Actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{[...list.batches].reverse().map((b) => (
                <tr key={b.id}>
                  <td data-label="Batch"><code title={b.id}>{b.id.slice(0, 12)}</code></td><td data-label="Calculation"><code title={b.calculationId}>{b.calculationId.slice(0, 13)}</code></td>
                  <td data-label="Status"><Badge tone={STATUS[b.status].tone}>{STATUS[b.status].text}</Badge></td><td data-label="Asset">{b.asset.code}</td>
                  <td data-label="Instructions">{b.instructionCount} (total {b.totalAmount})</td><td data-label="Prepared">{b.preparedAt.slice(0, 19)} by {b.preparedBy}</td>
                  <td data-label="Decision">{b.decision ? `${b.decision.decision === 'approved' ? 'Approved' : 'Rejected'} by ${b.decision.decidedBy}` : '—'}{b.invalidation ? ` (${b.invalidation.cause})` : ''}</td>
                  <td data-label="Actions"><span className="ss-actions"><button type="button" onClick={() => void load(b.id)} aria-label={`View batch ${b.id.slice(0, 12)}`} aria-current={sel === b.id ? 'true' : undefined}>View</button></span></td>
                </tr>))}</tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
