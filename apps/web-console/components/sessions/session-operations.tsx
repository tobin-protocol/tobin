'use client';
// Clearing operations panels (participants, obligations, net positions, readiness) for an operational session. Presentation only: every rule,
// calculation and permission is enforced by the server. Application level: no wallet, no Stellar call, no signing, no settlement anywhere in this file.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api-client.ts';

export interface Participant { userId: string; name: string; organization: string; status: 'active' | 'removed'; addedAt: string; walletClaim?: string }
export interface ObligationView { assetRef?: string | null; assetIdentity?: 'canonical' | 'legacy-unresolved'; id: string; debtor: string; debtorName: string; creditor: string; creditorName: string; amount: string; asset: string; reference: string; status: 'active' | 'voided'; revision: number; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string }
interface Position { userId: string; name: string; organization: string; net: string; role: 'debtor' | 'creditor' | 'flat' }
interface CalcView { currency: 'current' | 'stale' | 'none'; asset: string | null; calculation: null | { id: string; asset: string; createdAt: string; createdBy: string; gross: string; obligationCount: number; positions: Position[] }; note: string }
interface Check { key: string; label: string; ok: boolean; fix: string }
interface Readiness { state: 'configuring' | 'ready' | 'closed'; ready: boolean; checks: Check[]; currency: 'current' | 'stale' | 'none'; note?: string }
interface Member { userId: string; name: string }

const Badge = ({ tone, children }: { tone: string; children: string }) => <span className={`ss-badge ss-${tone}`}>{children}</span>;
export const WORKFLOW_LABEL = { configuring: 'Being configured', ready: 'Marked ready (frozen)', closed: 'Closed' } as const;

/** shared load + mutate helper: one error line and one success line per panel */
function usePanel() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, success?: string) => {
    setError(null); setOk(null);
    try { await fn(); if (success) setOk(success); } catch (e) { setError((e as Error).message); }
  };
  return { error, ok, run, setError };
}
const Msg = ({ p }: { p: ReturnType<typeof usePanel> }) => <>{p.error && <p className="ss-error" role="alert">{p.error}</p>}{p.ok && <p className="ss-notice" role="status">{p.ok}</p>}</>;

interface Props { orgId: string; sessionId: string; canEdit: boolean; workflow: 'configuring' | 'ready' | 'closed'; onChanged: () => Promise<void> | void }

export function ParticipantsPanel({ orgId, sessionId, canEdit, workflow, onChanged }: Props) {
  const base = `/api/registry/orgs/${orgId}/sessions/${sessionId}`;
  const [items, setItems] = useState<Participant[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pick, setPick] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const p = usePanel();
  const editable = canEdit && workflow === 'configuring';

  const load = useCallback(async () => {
    try {
      const r = await api<{ participants: Participant[] }>('GET', `${base}/participants`); setItems(r.participants); setLoadError(null);
      if (canEdit) { const m = await api<{ members: Member[] }>('GET', `/api/registry/orgs/${orgId}/members`); setMembers(m.members); }
    } catch (e) { setLoadError((e as Error).message); }
  }, [base, orgId, canEdit]);
  useEffect(() => { void load(); }, [load]);

  const activeIds = new Set((items ?? []).filter((x) => x.status === 'active').map((x) => x.userId));
  const eligible = members.filter((m) => !activeIds.has(m.userId));
  const add = (ev: FormEvent) => { ev.preventDefault(); void p.run(async () => { await api('POST', `${base}/participants`, { userId: pick }); setPick(''); await load(); await onChanged(); }, 'Participant added.'); };
  const remove = (x: Participant) => void p.run(async () => { await api('POST', `${base}/participants/${x.userId}/remove`, {}); await load(); await onChanged(); }, `${x.name} removed from this session.`);

  return (
    <div>
      <p className="ss-note">Participants are application records for this session, kept apart from organization membership and from wallets. Adding one is not an on-chain admission and does not prove any wallet or signing authority. Only members of {items?.[0]?.organization ?? 'this organization'} can take part.</p>
      <Msg p={p} />
      {loadError && <p className="ss-error" role="alert">Could not load participants: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {items === null && !loadError && <p className="ss-empty" role="status">Loading participants…</p>}
      {items !== null && items.length === 0 && <p className="ss-empty">No participants yet. {editable ? 'Add the members who take part in this clearing run.' : 'An administrator can add participants.'}</p>}
      {items !== null && items.length > 0 && (
        <table className="ss-list"><caption className="ss-sr">Session participants</caption>
          <thead><tr>{['Name', 'Organization', 'Status', 'Wallet claim', 'Added', 'Actions'].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{items.map((x) => (
            <tr key={x.userId}>
              <td data-label="Name">{x.name}</td><td data-label="Organization">{x.organization}</td>
              <td data-label="Status"><Badge tone={x.status === 'active' ? 'ok' : 'neutral'}>{x.status === 'active' ? 'Active' : 'Removed'}</Badge></td>
              <td data-label="Wallet claim">{x.walletClaim ? <><code>{x.walletClaim.slice(0, 8)}…</code> (claim, unproven)</> : 'none'}</td>
              <td data-label="Added">{x.addedAt.slice(0, 10)}</td>
              <td data-label="Actions"><span className="ss-actions">
                <button type="button" onClick={() => setDetail(detail === x.userId ? null : x.userId)} aria-expanded={detail === x.userId}>Details</button>
                {editable && x.status === 'active' && <button type="button" onClick={() => remove(x)} aria-label={`Remove ${x.name}`}>Remove</button>}
              </span></td>
            </tr>))}</tbody>
        </table>
      )}
      {detail && items?.filter((x) => x.userId === detail).map((x) => (
        <dl key={x.userId} className="ss-dl" aria-label={`Details of ${x.name}`}>
          <dt>Name</dt><dd>{x.name}</dd><dt>Organization</dt><dd>{x.organization}</dd><dt>Status</dt><dd>{x.status}</dd><dt>Added</dt><dd>{x.addedAt}</dd>
          <dt>Wallet</dt><dd>{x.walletClaim ? `${x.walletClaim} (claim, unproven)` : 'no wallet claim'}</dd>
        </dl>
      ))}
      {editable && (
        <form className="inst-form" onSubmit={add} aria-label="Add participant">
          <label>Member <select value={pick} onChange={(e) => setPick(e.target.value)} required aria-label="Member to add">
            <option value="">Choose a member…</option>{eligible.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
          <button type="submit" disabled={!pick}>Add participant</button>
          {eligible.length === 0 && members.length > 0 && <small>Every member of the organization already takes part.</small>}
        </form>
      )}
      {!editable && workflow !== 'configuring' && <p className="ss-note">The session is {workflow === 'ready' ? 'marked ready: reopen it' : 'closed: it cannot change'}{workflow === 'ready' ? ' (Overview tab) to change participants.' : '.'}</p>}
    </div>
  );
}

export function ObligationsPanel({ orgId, sessionId, canEdit, workflow, onChanged }: Props) {
  const base = `/api/registry/orgs/${orgId}/sessions/${sessionId}`;
  const [items, setItems] = useState<ObligationView[] | null>(null);
  const [parts, setParts] = useState<Participant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ debtor: '', creditor: '', amount: '', asset: '', assetRef: '', reference: '' });
  const [assets, setAssets] = useState<{ id: string; code: string; status: string }[]>([]);
  const [editing, setEditing] = useState<ObligationView | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const p = usePanel();
  const editable = canEdit && workflow === 'configuring';

  const load = useCallback(async () => {
    try {
      const [o, q] = await Promise.all([api<{ obligations: ObligationView[] }>('GET', `${base}/obligations`), api<{ participants: Participant[] }>('GET', `${base}/participants`)]);
      setItems(o.obligations); setParts(q.participants.filter((x) => x.status === 'active')); setLoadError(null);
      try { setAssets((await api<{ assets: { id: string; code: string; status: string }[] }>('GET', '/api/registry/assets')).assets.filter((a) => a.status === 'supported')); } catch { setAssets([]); }
    } catch (e) { setLoadError((e as Error).message); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const sessionAsset = items?.find((o) => o.status === 'active')?.asset;
  const reset = () => { setEditing(null); setForm({ debtor: '', creditor: '', amount: '', asset: '', assetRef: '', reference: '' }); setFieldError(null); };
  const identityMode = assets.length > 0; // a registry is configured: an asset must be chosen by its full identity
  // Client checks only give fast feedback; the server re-validates everything.
  const quick = (f: typeof form) => {
    if (!editing && (!f.debtor || !f.creditor)) return 'Choose a debtor and a creditor.';
    if (f.debtor && f.debtor === f.creditor) return 'The debtor and the creditor must be different participants.';
    if (!/^[1-9][0-9]*$/.test(f.amount)) return 'Enter the amount as a whole number of base units, digits only (no decimals, signs or spaces).';
    if (identityMode) { if (!f.assetRef) return 'Choose the asset identity: a code alone does not identify an asset.'; }
    else if (!/^[A-Z0-9]{1,12}$/.test(f.asset)) return 'The asset is 1 to 12 upper-case letters or digits, for example USD.';
    return null;
  };
  const submit = (ev: FormEvent) => {
    ev.preventDefault(); const bad = quick(form); setFieldError(bad); if (bad) return;
    void p.run(async () => {
      const ident = identityMode ? { assetRef: form.assetRef } : { asset: form.asset };
      if (editing) await api('POST', `${base}/obligations/${editing.id}/update`, { debtor: form.debtor, creditor: form.creditor, amount: form.amount, ...ident, reference: form.reference });
      else await api('POST', `${base}/obligations`, { debtor: form.debtor, creditor: form.creditor, amount: form.amount, ...ident, reference: form.reference });
      const was = editing; reset(); await load(); await onChanged(); void was;
    }, editing ? 'Obligation updated. Any earlier calculation is now stale.' : 'Obligation recorded. Any earlier calculation is now stale.');
  };
  const edit = (o: ObligationView) => { setEditing(o); setForm({ debtor: o.debtor, creditor: o.creditor, amount: o.amount, asset: o.asset, assetRef: o.assetRef ?? '', reference: o.reference }); setFieldError(null); p.setError(null); };
  const voidIt = (o: ObligationView) => void p.run(async () => { await api('POST', `${base}/obligations/${o.id}/void`, {}); if (editing?.id === o.id) reset(); await load(); await onChanged(); }, 'Obligation voided. It stays in the history; any earlier calculation is now stale.');

  return (
    <div>
      <p className="ss-note">An obligation is an amount one participant owes another in this session, in whole base units of one asset. Voided obligations stay visible for the record and are not netted. Nothing here is sent to a network.</p>
      <Msg p={p} />
      {loadError && <p className="ss-error" role="alert">Could not load obligations: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {items === null && !loadError && <p className="ss-empty" role="status">Loading obligations…</p>}
      {items !== null && items.length === 0 && <p className="ss-empty">No obligations yet. {editable ? (parts.length < 2 ? 'Add at least two participants first, then record what they owe one another.' : 'Record what one participant owes another.') : ''}</p>}
      {items !== null && items.length > 0 && (
        <table className="ss-list"><caption className="ss-sr">Session obligations</caption>
          <thead><tr>{['Ref', 'Debtor', 'Creditor', 'Amount', 'Asset', 'Reference', 'Status', 'Actions'].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{items.map((o) => (
            <tr key={o.id} className={o.status === 'voided' ? 'ss-voided' : undefined}>
              <td data-label="Ref"><code title={o.id}>{o.id.slice(0, 8)}</code></td><td data-label="Debtor">{o.debtorName}</td><td data-label="Creditor">{o.creditorName}</td>
              <td data-label="Amount">{o.amount}</td><td data-label="Asset">{o.asset}{o.assetIdentity === 'canonical' ? <span className="ss-ref" title="canonical asset identity">{o.assetRef}</span> : identityMode ? <span className="ss-ref">legacy: code only, not settlement-eligible until you edit it and choose the asset identity</span> : null}</td><td data-label="Reference">{o.reference || '—'}</td>
              <td data-label="Status"><Badge tone={o.status === 'active' ? 'ok' : 'neutral'}>{o.status === 'active' ? `Active (rev ${o.revision})` : 'Voided'}</Badge></td>
              <td data-label="Actions"><span className="ss-actions">
                <button type="button" onClick={() => setDetail(detail === o.id ? null : o.id)} aria-expanded={detail === o.id}>Details</button>
                {editable && o.status === 'active' && <button type="button" onClick={() => edit(o)} aria-label={`Edit obligation ${o.id.slice(0, 8)}`}>Edit</button>}
                {editable && o.status === 'active' && <button type="button" onClick={() => voidIt(o)} aria-label={`Void obligation ${o.id.slice(0, 8)}`}>Void</button>}
              </span></td>
            </tr>))}</tbody>
        </table>
      )}
      {detail && items?.filter((o) => o.id === detail).map((o) => (
        <dl key={o.id} className="ss-dl" aria-label={`Details of obligation ${o.id.slice(0, 8)}`}>
          <dt>Obligation ID</dt><dd><code>{o.id}</code></dd><dt>Owes</dt><dd>{o.debtorName} owes {o.creditorName} {o.amount} {o.asset}</dd>
          <dt>Reference</dt><dd>{o.reference || 'none'}</dd><dt>Status</dt><dd>{o.status}, revision {o.revision}</dd>
          <dt>Created</dt><dd>{o.createdAt} by {o.createdBy}</dd><dt>Last changed</dt><dd>{o.updatedAt} by {o.updatedBy}</dd>
        </dl>
      ))}
      {editable && (
        <form className="inst-form ss-obligation-form" onSubmit={submit} aria-label={editing ? 'Edit obligation' : 'Record obligation'} noValidate>
          <h4 className="ss-formtitle">{editing ? `Edit obligation ${editing.id.slice(0, 8)}` : 'Record an obligation'}</h4>
          <label>Debtor (owes) <select value={form.debtor} onChange={set('debtor')} aria-label="Debtor"><option value="">Choose…</option>{parts.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}</select></label>
          <label>Creditor (is owed) <select value={form.creditor} onChange={set('creditor')} aria-label="Creditor"><option value="">Choose…</option>{parts.map((x) => <option key={x.userId} value={x.userId}>{x.name}</option>)}</select></label>
          <label>Amount (base units) <input value={form.amount} onChange={set('amount')} inputMode="numeric" autoComplete="off" aria-label="Amount in base units" /></label>
          {identityMode
            ? <label>Asset identity <select value={form.assetRef} onChange={set('assetRef')} aria-label="Asset identity"><option value="">Choose…</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.id.length > 44 ? a.id.slice(0, 30) + '…' + a.id.slice(-8) : a.id}</option>)}</select></label>
            : <label>Asset <input value={form.asset} onChange={set('asset')} maxLength={12} placeholder={sessionAsset ?? 'USD'} autoComplete="off" aria-label="Asset" /></label>}
          <label>Reference (optional) <input value={form.reference} onChange={set('reference')} maxLength={200} aria-label="Reference" /></label>
          <button type="submit">{editing ? 'Save changes' : 'Record obligation'}</button>
          {editing && <button type="button" onClick={reset}>Cancel</button>}
          {sessionAsset && <small>This session nets {sessionAsset}; other assets are rejected.</small>}
          {fieldError && <p className="ss-error" role="alert">{fieldError}</p>}
        </form>
      )}
      {!editable && workflow !== 'configuring' && <p className="ss-note">The session is {workflow === 'ready' ? 'marked ready: reopen it (Overview tab) to change obligations.' : 'closed: it cannot change.'}</p>}
    </div>
  );
}

export function NetPositionsPanel({ orgId, sessionId, canEdit, workflow, onChanged }: Props) {
  const base = `/api/registry/orgs/${orgId}/sessions/${sessionId}`;
  const [view, setView] = useState<CalcView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = usePanel();
  const load = useCallback(async () => { try { setView(await api<CalcView>('GET', `${base}/calculation`)); setLoadError(null); } catch (e) { setLoadError((e as Error).message); } }, [base]);
  useEffect(() => { void load(); }, [load]);
  const calc = () => { setBusy(true); void p.run(async () => { setView(await api<CalcView>('POST', `${base}/calculate`, {})); await onChanged(); }, 'Net positions calculated from the saved obligations.').finally(() => setBusy(false)); };
  const c = view?.calculation ?? null;
  const sum = c ? c.positions.reduce((t, x) => t + BigInt(x.net), 0n) : 0n;
  const tone = view?.currency === 'current' ? 'ok' : view?.currency === 'stale' ? 'warn' : 'neutral';

  return (
    <div>
      <p className="ss-note">Net positions are calculated on the server by the netting engine from the saved, active obligations (net = outgoing − incoming; positive = owes, negative = is owed). This is an application-level calculation: it is not approved, signed, settled or verified on any chain.</p>
      <Msg p={p} />
      {loadError && <p className="ss-error" role="alert">Could not load the calculation: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {view === null && !loadError && <p className="ss-empty" role="status">Loading calculation…</p>}
      {view && (
        <p><Badge tone={tone}>{view.currency === 'current' ? 'Current' : view.currency === 'stale' ? 'Stale' : 'Not calculated'}</Badge>{' '}
          {view.currency === 'stale' && <strong>Participants or obligations changed after this calculation. Calculate again before relying on it.</strong>}</p>
      )}
      {canEdit && workflow === 'configuring' && <p><button type="button" onClick={calc} disabled={busy}>{busy ? 'Calculating…' : c ? 'Recalculate net positions' : 'Calculate net positions'}</button></p>}
      {view && !c && <p className="ss-empty">No calculation yet. {canEdit && workflow === 'configuring' ? 'Record obligations, then calculate.' : 'An administrator can calculate once obligations are recorded.'}</p>}
      {c && (
        <>
          <dl className="ss-dl"><dt>Asset</dt><dd>{c.asset}</dd><dt>Calculated</dt><dd>{c.createdAt} by {c.createdBy}</dd><dt>Source</dt><dd>{c.obligationCount} active obligation(s) as saved at that time</dd><dt>Gross obligations</dt><dd>{c.gross} {c.asset}</dd><dt>Sum of net positions</dt><dd data-testid="net-sum">{sum.toString()} {sum === 0n ? '(balanced: value is conserved)' : '(NOT balanced)'}</dd></dl>
          <table className="ss-list"><caption className="ss-sr">Net positions{view?.currency === 'stale' ? ' (stale)' : ''}</caption>
            <thead><tr>{['Participant', 'Organization', 'Net position', 'Asset', 'Position'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{c.positions.map((x) => (
              <tr key={x.userId}><td data-label="Participant">{x.name}</td><td data-label="Organization">{x.organization}</td>
                <td data-label="Net position"><strong className={`ss-net ss-net-${x.role}`}>{x.role === 'debtor' ? '+' : ''}{x.net}</strong></td><td data-label="Asset">{c.asset}</td>
                <td data-label="Position">{x.role === 'debtor' ? 'Owes (net debtor)' : x.role === 'creditor' ? 'Is owed (net creditor)' : 'Flat'}</td></tr>))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function ReadinessPanel({ orgId, sessionId, canEdit, workflow, onChanged }: Props) {
  const base = `/api/registry/orgs/${orgId}/sessions/${sessionId}`;
  const [r, setR] = useState<Readiness | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const p = usePanel();
  const load = useCallback(async () => { try { setR(await api<Readiness>('GET', `${base}/readiness`)); setLoadError(null); } catch (e) { setLoadError((e as Error).message); } }, [base]);
  useEffect(() => { void load(); }, [load, workflow]);
  const act = (what: 'ready' | 'reopen' | 'close', msg: string) => void p.run(async () => { await api('POST', `${base}/${what}`, {}); await onChanged(); await load(); }, msg).then(() => load());
  const failed = r?.checks.filter((c) => !c.ok && c.key !== 'state') ?? [];
  return (
    <section aria-label="Readiness">
      <h4>Readiness</h4>
      <p className="ss-note">Ready means the application records are consistent: participants, obligations, one asset and a current balanced calculation. It does not mean anyone has signed, authorized or settled anything.</p>
      <Msg p={p} />
      {loadError && <p className="ss-error" role="alert">Could not load readiness: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {r === null && !loadError && <p className="ss-empty" role="status">Evaluating…</p>}
      {r && (
        <>
          <p>Workflow state: <Badge tone={r.state === 'configuring' ? 'info' : r.state === 'ready' ? 'ok' : 'neutral'}>{WORKFLOW_LABEL[r.state]}</Badge>{' '}
            {r.state === 'configuring' && <Badge tone={failed.length === 0 ? 'ok' : 'warn'}>{failed.length === 0 ? 'All checks pass' : `${failed.length} check(s) to fix`}</Badge>}</p>
          <ul className="ss-checks">{r.checks.filter((c) => r.state === 'configuring' || c.key !== 'state').map((c) => (
            <li key={c.key}><span aria-hidden="true">{c.ok ? '✓' : '✗'}</span> <span className="ss-sr">{c.ok ? 'Passed: ' : 'Failed: '}</span>{c.label}{!c.ok && c.key !== 'state' && <small> — {c.fix}</small>}</li>))}</ul>
          {canEdit && (
            <p className="ss-actions">
              {r.state === 'configuring' && <button type="button" onClick={() => act('ready', 'Session marked ready.')} disabled={failed.length > 0}>Mark session ready</button>}
              {r.state === 'ready' && <button type="button" onClick={() => act('reopen', 'Session reopened for changes.')}>Reopen for changes</button>}
              {r.state === 'ready' && <button type="button" onClick={() => act('close', 'Session closed.')}>Close session</button>}
            </p>
          )}
        </>
      )}
    </section>
  );
}
