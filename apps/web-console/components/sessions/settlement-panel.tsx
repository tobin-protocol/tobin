'use client';
// Settlement PREPARATION panel (MVP-1.4). Presentation only: eligibility, validation, instruction generation and every decision are computed and enforced by the
// server. A prepared or approved batch is a set of application records. It is NOT signed, NOT submitted and NOT settled: no wallet, no Stellar transaction and no
// network appears in this file, and no funds have moved. Wallet signing, submission and on-chain confirmation do not exist in this application yet.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api-client.ts';
import { browserName, connectWallet, inspectWallet } from '../../lib/stellar/freighter.ts';
import type { FreighterLike, WalletState } from '../../lib/stellar/freighter.ts';

type Status = 'awaiting-review' | 'approved' | 'rejected' | 'invalidated' | 'superseded';
interface Check { key: string; label: string; ok: boolean; detail: string }
interface Asset { id: string; network: string; kind: string; code: string; issuer?: string }
interface Summary { attempt: number; id: string; calculationId: string; status: Status; asset: Asset; instructionCount: number; totalAmount: string; preparedBy: string; preparedAt: string; decision?: { decision: 'approved' | 'rejected'; reason: string; decidedBy: string; decidedAt: string }; invalidation?: { cause: string; at: string } }
interface ListView { preview: { checks: Check[]; ready: boolean; calculationId: string | null }; note: string; batches: Summary[] }
interface Instruction { id: string; seq: number; payerName: string; payeeName: string; assetId: string; amount: string; validation: string; calculationId: string; batchId: string }
interface BatchView { batch: { attempt: number; id: string; calculationId: string; asset: Asset; instructionCount: number; totalAmount: string; instructionsHash: string; algorithm: string; preparedBy: string; preparedAt: string }; status: Status; validation: Check[]; eligibility: { canDecide: boolean; reasons: string[] }; instructions: Instruction[]; review?: { decision: 'approved' | 'rejected'; reason: string; decidedBy: string; decidedAt: string }; invalidation?: { cause: string; at: string }; note: string }

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
    try { const r = await api<{ batchId: string }>('POST', `${base}/prepare`, { calculationId: list.preview.calculationId, attempt: nextAttempt }); setOk('Settlement batch prepared. Nothing has been signed, submitted or settled.'); await load(r.batchId); await onChanged(); }
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
  const mineAll = list?.batches.filter((b) => b.calculationId === pv?.calculationId) ?? [];
  const mine = mineAll[mineAll.length - 1];
  const nextAttempt = mineAll.length + 1;
  const stage = (text: string, on: boolean, yes: string, no: string) => <li>{text}: <strong>{on ? yes : no}</strong></li>;
  const preparing = pv && !(mine && (mine.status === 'awaiting-review' || mine.status === 'approved'));

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
              <h4>{nextAttempt > 1 ? 'Can a new batch be prepared? (an earlier batch was rejected)' : 'Can a batch be prepared?'}</h4>
              <ul className="ss-checks">{pv.checks.map((c) => <li key={c.key}><Mark ok={c.ok} />{c.label}<small> — {c.detail}</small></li>)}</ul>
              {canEdit && workflow !== 'closed'
                ? <p className="ss-actions"><button type="button" onClick={() => void prepare()} disabled={!pv.ready || busy}>{busy ? 'Preparing…' : nextAttempt > 1 ? `Prepare again (attempt ${nextAttempt})` : 'Prepare settlement batch'}</button>{!pv.ready && <small>Fix the failed checks first.</small>}</p>
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
                <dt>Attempt</dt><dd>{view.batch.attempt}{view.batch.attempt > 1 ? ' (an earlier batch of this calculation was rejected; it is kept in the history)' : ''}</dd>
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

          {view && view.status === 'approved' && <ExecutionSection base={base} batchId={view.batch.id} canEdit={canEdit} onChanged={onChanged} />}
          <h4>Batch history</h4>
          {list.batches.length === 0 ? <p className="ss-empty">No batches yet. Once a calculation is approved, an administrator can prepare one.</p> : (
            <table className="ss-list"><caption className="ss-sr">Settlement batch history</caption>
              <thead><tr>{['Batch', 'Attempt', 'Calculation', 'Status', 'Asset', 'Instructions', 'Prepared', 'Decision', 'Actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{[...list.batches].reverse().map((b) => (
                <tr key={b.id}>
                  <td data-label="Batch"><code title={b.id}>{b.id.slice(0, 12)}</code></td><td data-label="Attempt">{b.attempt}</td><td data-label="Calculation"><code title={b.calculationId}>{b.calculationId.slice(0, 13)}</code></td>
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

interface ExecView {
  network: string; batchStatus: string; note: string; unavailable: string[];
  participants: { userId: string; name: string; verifiedAccount: string | null; verifiedCount: number }[];
  execution: null | { id: string; state: string; accounts: Record<string, string>; createdAt: string; events: { from: string | null; to: string; at: string; actor: string; detail: string }[] };
}
/** Stellar-side preconditions for an approved batch. Wallet connection, construction, signing, submission and on-chain verification are NOT implemented in this build. */
function ExecutionSection({ base, batchId, canEdit, onChanged }: { base: string; batchId: string; canEdit: boolean; onChanged: () => Promise<void> | void }) {
  const [v, setV] = useState<ExecView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const load = useCallback(async () => { try { setV(await api<ExecView>('GET', `${base}/batches/${batchId}/execution`)); setLoadError(null); } catch (e) { setLoadError((e as Error).message); } }, [base, batchId]);
  useEffect(() => { void load(); }, [load]);
  const start = async () => {
    setErr(null); setOkMsg(null);
    try { await api('POST', `${base}/batches/${batchId}/execution/start`, {}); setOkMsg('Execution prepared and awaiting a signer. Nothing has been signed, submitted or settled.'); await load(); await onChanged(); }
    catch (e) { setErr((e as Error).message); }
  };
  const missing = v?.participants.filter((p) => !p.verifiedAccount) ?? [];
  return (
    <section aria-label="Stellar execution">
      <h4>Stellar execution (preconditions only)</h4>
      <p className="ss-note">A prepared, approved batch is not a transaction. Before anything could be signed, every payer and payee needs exactly one Stellar account whose ownership was proven (Organizations page). A connected wallet or a typed public key does not count.</p>
      {err && <p className="ss-error" role="alert">{err}</p>}
      {okMsg && <p className="ss-notice" role="status">{okMsg}</p>}
      {loadError && <p className="ss-error" role="alert">Could not load execution status: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {v === null && !loadError && <p className="ss-empty" role="status">Loading execution status…</p>}
      {v && (
        <>
          <table className="ss-list"><caption className="ss-sr">Verified Stellar accounts of the participants</caption>
            <thead><tr>{['Participant', 'Network', 'Verified Stellar account'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{v.participants.map((p) => <tr key={p.userId}><td data-label="Participant">{p.name}</td><td data-label="Network">{v.network}</td><td data-label="Verified Stellar account">{p.verifiedAccount ? <code>{p.verifiedAccount}</code> : p.verifiedCount > 1 ? 'ambiguous: more than one verified account' : 'none verified'}</td></tr>)}</tbody>
          </table>
          {v.execution ? (
            <>
              <p>Execution state: <span className="ss-badge ss-info">{v.execution.state}</span></p>
              <ul className="ss-checks">{v.execution.events.map((e, i) => <li key={i}>{e.at.slice(0, 19)}: {e.from ?? 'start'} to {e.to} by {e.actor}<small> — {e.detail}</small></li>)}</ul>
            </>
          ) : canEdit ? (
            <p className="ss-actions"><button type="button" onClick={() => void start()} disabled={missing.length > 0}>Record execution preconditions</button>{missing.length > 0 && <small>{missing.length} participant(s) have no verified account.</small>}</p>
          ) : <p className="ss-note">An administrator records the execution preconditions.</p>}
          <WalletBox verified={v.participants} network={v.network} />
          {v.execution && <AttemptsBox base={base} batchId={batchId} canEdit={canEdit} participants={v.participants} onChanged={onChanged} />}
          <p className="ss-note"><strong>Not available in this build:</strong> {v.unavailable.join('; ')}. {v.note}</p>
        </>
      )}
    </section>
  );
}

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
async function loadFreighter(): Promise<FreighterLike | undefined> {
  try { const m = (await import('@stellar/freighter-api')) as unknown as { default?: FreighterLike } & FreighterLike; return (m.default ?? m) as FreighterLike; } catch { return undefined; }
}
/**
 * Reads the Freighter state in THIS browser. "Check" never prompts; "Connect" asks Freighter for access. Nothing is signed and nothing is sent. A wallet is shown as
 * connected only if Freighter reports it, on Stellar Testnet, and the account is compared with the verified participant accounts. A connected wallet is not an
 * institutional identity and grants no role.
 */
function WalletBox({ verified, network }: { verified: { userId: string; name: string; verifiedAccount: string | null }[]; network: string }) {
  const [st, setSt] = useState<WalletState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const browser = typeof navigator === 'undefined' ? 'other' : browserName(navigator.userAgent);
  const expected = network === 'testnet' ? TESTNET_PASSPHRASE : '';
  const check = async (connect: boolean) => {
    setBusy(true); setNote(null);
    try {
      const api = await loadFreighter();
      if (connect) { const c = await connectWallet(api); if (!c.ok) setNote(c.rejected ? 'Freighter did not grant access: ' + c.reason : 'Could not reach Freighter: ' + c.reason); }
      setSt(await inspectWallet(api, { passphrase: expected }));
    } finally { setBusy(false); }
  };
  const mine = st?.kind === 'READY' ? verified.find((p) => p.verifiedAccount === st.address) : undefined;
  return (
    <section aria-label="Wallet">
      <h5>Wallet (Freighter)</h5>
      <p className="ss-note">Browser: {browser}{browser === 'Edge' ? '' : ' (Microsoft Edge is the validated environment)'}. This reads the wallet only: nothing is signed or sent. A connected wallet is not an institutional identity and grants no role.</p>
      <p className="ss-actions"><button type="button" onClick={() => void check(false)} disabled={busy}>Check wallet</button><button type="button" onClick={() => void check(true)} disabled={busy}>Connect Freighter</button></p>
      {note && <p className="ss-error" role="alert">{note}</p>}
      {st === null && <p className="ss-empty">Wallet not checked yet.</p>}
      {st?.kind === 'UNAVAILABLE' && <p className="ss-error" role="status">Freighter is unavailable: {st.reason}. Install the Freighter extension in this browser and reload.</p>}
      {st?.kind === 'NOT_ALLOWED' && <p className="ss-note" role="status">Freighter is installed but this site has no access, or it is locked: {st.reason}. Unlock Freighter and choose Connect.</p>}
      {st?.kind === 'WRONG_NETWORK' && <p className="ss-error" role="alert">Freighter is on {st.network}, not Stellar Testnet. Switch Freighter to Testnet. Execution is blocked on the wrong network.</p>}
      {st?.kind === 'READY' && (
        <dl className="ss-dl"><dt>Connected account</dt><dd><code>{st.address}</code></dd><dt>Network</dt><dd>{st.network} (Stellar Testnet confirmed by the wallet)</dd>
          <dt>Verified participant?</dt><dd>{mine ? 'Yes: ' + mine.name + ' (ownership was verified in Tobin)' : 'No: this account is not a verified account of any participant of this batch. It cannot sign for them.'}</dd></dl>
      )}
    </section>
  );
}

interface AttemptView { attemptNo: number; state: string; network: string; planFingerprint: string; createdAt: string; onChainSessionId: string | null; expectedDigest: string | null; requiredSigners: string[]; steps: { index: number; fn: string; signers: string[]; note: string }[]; transactions: { txHash: string; stepIndex: number }[]; events: { kind: string; from: string | null; to: string; at: string; actor: string; detail: string }[] }
/** Execution attempts: each is one technical try. A PLAN is not a transaction: creating one constructs, signs and submits nothing. */
function AttemptsBox({ base, batchId, canEdit, participants, onChanged }: { base: string; batchId: string; canEdit: boolean; participants: { userId: string; name: string; verifiedAccount: string | null }[]; onChanged: () => Promise<void> | void }) {
  const [list, setList] = useState<AttemptView[] | null>(null);
  const [initiator, setInitiator] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setList((await api<{ attempts: AttemptView[] }>('GET', `${base}/batches/${batchId}/execution/attempts`)).attempts); setLoadError(null); } catch (e) { setLoadError((e as Error).message); } }, [base, batchId]);
  useEffect(() => { void load(); }, [load]);
  const begin = async () => {
    setErr(null); setOkMsg(null);
    try { await api('POST', `${base}/batches/${batchId}/execution/attempts/begin`, { initiator, ...(reviewed ? { reviewedFailure: true } : {}) }); setOkMsg('Execution plan prepared. No transaction has been constructed, signed or submitted.'); await load(); await onChanged(); }
    catch (e) { setErr((e as Error).message); }
  };
  const next = (list?.length ?? 0) + 1;
  return (
    <section aria-label="Execution attempts">
      <h5>Execution attempts</h5>
      <p className="ss-note">An attempt is one technical try to execute the approved batch on Stellar; the batch itself never changes. Only one attempt may be live. An unknown outcome blocks every new attempt until the network has been read. A confirmed settlement is never retried.</p>
      {err && <p className="ss-error" role="alert">{err}</p>}
      {okMsg && <p className="ss-notice" role="status">{okMsg}</p>}
      {loadError && <p className="ss-error" role="alert">Could not load attempts: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {list === null && !loadError && <p className="ss-empty" role="status">Loading attempts…</p>}
      {list !== null && list.length === 0 && <p className="ss-empty">No attempt has been started.</p>}
      {list?.map((a) => (
        <article key={a.attemptNo} className="ss-attempt" aria-label={`Attempt ${a.attemptNo}`}>
          <h6>Attempt {a.attemptNo}: <span className="ss-badge ss-info">{a.state}</span></h6>
          <dl className="ss-dl"><dt>Plan fingerprint</dt><dd><code>{a.planFingerprint.slice(0, 24)}…</code></dd><dt>On-chain session id</dt><dd><code>{a.onChainSessionId ? a.onChainSessionId.slice(0, 24) + '…' : 'n/a'}</code></dd><dt>Network</dt><dd>{a.network}</dd><dt>Required signers</dt><dd>{a.requiredSigners.length} verified account(s)</dd><dt>Transactions recorded</dt><dd>{a.transactions.length === 0 ? 'none: nothing has been submitted' : a.transactions.map((t) => 'step ' + t.stepIndex + ' ' + t.txHash.slice(0, 12) + '…').join(', ')}</dd></dl>
          <table className="ss-list"><caption className="ss-sr">{`Plan steps of attempt ${a.attemptNo}`}</caption>
            <thead><tr>{['Step', 'Contract call', 'Signers needed', 'Purpose'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{a.steps.map((st) => <tr key={st.index}><td data-label="Step">{st.index}</td><td data-label="Contract call"><code>{st.fn}</code></td><td data-label="Signers needed">{st.signers.length}</td><td data-label="Purpose">{st.note}</td></tr>)}</tbody></table>
          <ul className="ss-checks">{a.events.map((e, i) => <li key={i}>{e.at.slice(0, 19)}: {e.kind === 'note' ? 'note' : (e.from ?? 'start') + ' to ' + e.to} by {e.actor}<small> — {e.detail}</small></li>)}</ul>
        </article>
      ))}
      {canEdit && (
        <form className="inst-form" onSubmit={(e) => { e.preventDefault(); void begin(); }} aria-label="Prepare execution plan">
          <label>Settlement initiator <select value={initiator} onChange={(e) => setInitiator(e.target.value)} aria-label="Settlement initiator"><option value="">Choose…</option>{participants.filter((p) => p.verifiedAccount).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select></label>
          {list && list.length > 0 && <label><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} aria-label="I reviewed the failure" /> I reviewed the earlier failure and a new attempt is safe</label>}
          <button type="submit" disabled={!initiator}>{`Prepare execution plan (attempt ${next})`}</button>
          <small>The initiator creates the on-chain session and authorizes memberships only; every participant signs for themselves. The initiator never signs for anyone else.</small>
        </form>
      )}
    </section>
  );
}
