'use client';
// Institutional session experience (MVP-1.2). Presentation only: authorization and every provenance rule live on the server (lib/registry).
// No wallet, no Stellar call, no transaction anywhere in this file. Creating a session records a LOCAL DRAFT.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '../api-client.ts';
import { activityLabel, listingState } from '../../lib/registry/session-view.ts';
import type { ListingRow, Workspace } from '../../lib/registry/session-view.ts';
import { NetPositionsPanel, ObligationsPanel, ParticipantsPanel, ReadinessPanel, WORKFLOW_LABEL } from './session-operations.tsx';

interface Org { id: string; name: string }
type Tab = 'overview' | 'participants' | 'obligations' | 'nets' | 'activity';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['participants', 'Participants'], ['obligations', 'Obligations'], ['nets', 'Net positions'], ['activity', 'Activity and history']];

const Badge = ({ tone, children }: { tone: string; children: string }) => <span className={`ss-badge ss-${tone}`}>{children}</span>;

export function SessionsApp() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [org, setOrg] = useState('');
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [workflow, setWorkflow] = useState<'configuring' | 'ready' | 'closed'>('configuring');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [sid, setSid] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [label, setLabel] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [orgsLoaded, setOrgsLoaded] = useState(false);

  const loadOrgs = useCallback(async () => {
    try {
      const who = await api<{ user: { displayName: string } }>('GET', '/api/auth/me'); setMe(who.user.displayName);
      const r = await api<{ organizations: Org[] }>('GET', '/api/registry/orgs'); setOrgs(r.organizations); setOrgsLoaded(true); setOrg((cur) => cur || r.organizations[0]?.id || '');
    } catch (e) { if (e instanceof ApiError && e.status === 401) setSignedOut(true); else setError((e as Error).message); setLoading(false); }
  }, []);
  const loadRows = useCallback(async (o: string) => {
    if (!o) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { const r = await api<{ rows: ListingRow[] }>('GET', `/api/registry/orgs/${o}/sessions`); setRows(r.rows); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadOrgs(); }, [loadOrgs]);
  useEffect(() => { setWs(null); void loadRows(org); }, [org, loadRows]);

  const refresh = useCallback(async (id: string, o: string) => {
    const r = await api<{ workspace: Workspace; workflow: 'configuring' | 'ready' | 'closed' }>('GET', `/api/registry/orgs/${o}/sessions/${id}`);
    setWs(r.workspace); setWorkflow(r.workflow);
  }, []);
  const open = async (id: string) => {
    setError(null); setTab('overview');
    try {
      const d = await api<{ role: 'admin' | 'member' }>('GET', `/api/registry/orgs/${org}`); setRole(d.role);
      await refresh(id, org); setSid(id);
    } catch (e) { setError((e as Error).message); }
  };
  const changed = useCallback(async () => { try { await refresh(sid, org); } catch (e) { setError((e as Error).message); } }, [refresh, sid, org]);
  const create = async (ev: FormEvent) => {
    ev.preventDefault(); setFormError(null); setNotice(null);
    try { const r = await api<{ notice: string }>('POST', `/api/registry/orgs/${org}/sessions`, { label }); setNotice(r.notice); setLabel(''); await loadRows(org); }
    catch (e) { setFormError((e as Error).message); }
  };

  const operational = !!ws && ws.overview.provenance !== 'fixture';
  const ops = { orgId: org, sessionId: sid, canEdit: role === 'admin', workflow, onChanged: changed };
  const state = listingState({ loading, error: ws ? null : error, rows });
  return (
    <main className="ss" aria-live="polite">
      {signedOut ? (
        <p className="ss-banner" role="note">You are not signed in. <Link href="/sign-in">Sign in</Link> to see your organization sessions.</p>
      ) : (
        <p className="ss-banner" role="note">{me ? <>Signed in as <strong>{me}</strong>. </> : null}No wallet or Stellar network is used on this page. Sessions are saved in the application database; a local draft is not an on-chain session.</p>
      )}
      <h2>Sessions</h2>
      {signedOut ? null : orgsLoaded && orgs.length === 0 ? (
        <p className="ss-empty">You are not a member of any organization yet. <Link href="/organizations">Create one or accept an invitation</Link> under Organizations.</p>
      ) : null}
      {signedOut || (orgsLoaded && orgs.length === 0) ? null : <label>Organization{' '}
        <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Organization">
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>}
      {error && ws && <p className="ss-error" role="alert">{error}</p>}

      {signedOut || (orgsLoaded && orgs.length === 0) ? null : ws ? (
        <section aria-label="Session workspace">
          <p><button type="button" onClick={() => setWs(null)}>Back to sessions</button></p>
          <div className={`ss-provenance ss-${ws.banner.tone}`} role="status"><strong>{ws.banner.label}.</strong> {ws.banner.meaning}</div>
          <h3>{ws.overview.label}</h3>
          <ul className="ss-tabs" role="tablist">
            {TABS.map(([k, t]) => <li key={k}><button type="button" role="tab" aria-selected={tab === k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{t}</button></li>)}
          </ul>
          {tab === 'overview' && (
            <>
            <dl className="ss-dl">
              <dt>Session ID</dt><dd><code>{ws.overview.sessionId}</code></dd>
              <dt>Status</dt><dd>{ws.overview.status}</dd>
              <dt>Created</dt><dd>{ws.overview.createdAt}</dd>
              <dt>Provenance</dt><dd><Badge tone={ws.banner.tone}>{ws.banner.label}</Badge></dd>
              {ws.overview.chainReadLedger !== null && <><dt>Read at ledger</dt><dd>{ws.overview.chainReadLedger}</dd></>}
              {ws.overview.confirmedTxHash && <><dt>Creating transaction</dt><dd><code>{ws.overview.confirmedTxHash}</code></dd></>}
              {ws.overview.provenance !== 'fixture' && <><dt>Workflow</dt><dd>{WORKFLOW_LABEL[workflow]}</dd></>}
            </dl>
            {ws.overview.provenance !== 'fixture' && <ReadinessPanel {...ops} />}
            </>
          )}
          {tab === 'participants' && !operational && <Section caption="Participants" s={ws.participants} cols={['Name', 'Address']} row={(p) => [p.name, <code key="a">{p.address}</code>]} />}
          {tab === 'obligations' && !operational && <Section caption="Obligations" s={ws.obligations} cols={['ID', 'Debtor', 'Creditor', 'Amount (base units)']} row={(o) => [o.id, o.debtor, o.creditor, o.amount]} />}
          {tab === 'participants' && operational && <ParticipantsPanel {...ops} />}
          {tab === 'obligations' && operational && <ObligationsPanel {...ops} />}
          {tab === 'nets' && operational && <NetPositionsPanel {...ops} />}
          {tab === 'nets' && !operational && (
            <>
              <Section caption="Net positions" s={ws.netPositions} cols={['Participant', 'Net (positive = debtor)', 'Role']} row={(n) => [n.name, n.net, n.role]} />
              {ws.netPositions.grossTotal !== null && <p>Gross obligations {ws.netPositions.grossTotal}; value that would move after netting {ws.netPositions.netMoved}. <small>(fixture figures)</small></p>}
            </>
          )}
          {tab === 'activity' && (ws.activity.empty ? <p className="ss-empty">{ws.activity.empty}</p> : (
            <table><caption className="ss-sr">Session activity</caption><thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Who</th><th scope="col">Detail</th></tr></thead>
              <tbody>{ws.activity.items.map((a, i) => <tr key={i}><td>{a.at}</td><td>{activityLabel(a.kind)}</td><td>{a.actor}</td><td>{a.detail}</td></tr>)}</tbody></table>
          ))}
        </section>
      ) : (
        <>
          <section aria-label="New session">
            <h3>New local draft</h3>
            <p className="ss-note">A draft is recorded in this application only. It is not an on-chain session: no contract is called and no wallet is used.</p>
            <form onSubmit={create}>
              <label>Name <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required /></label>
              <button type="submit" disabled={!org}>Create local draft</button>
            </form>
            {formError && <p className="ss-error" role="alert">Could not create the draft: {formError}</p>}
            {notice && <p className="ss-notice" role="status">{notice}</p>}
          </section>
          <section aria-label="Session list">
            <h3>Sessions</h3>
            {state.kind === 'loading' && <p className="ss-empty" role="status">Loading sessions…</p>}
            {state.kind === 'error' && <p className="ss-error" role="alert">Could not load sessions: {state.message} <button type="button" onClick={() => void loadRows(org)}>Retry</button></p>}
            {state.kind === 'empty' && <p className="ss-empty">{state.message}</p>}
            {state.kind === 'rows' && (
              <table className="ss-list">
                <caption className="ss-sr">Sessions of the selected organization</caption>
                <thead><tr>{['Name', 'Session ID', 'Status', 'Participants', 'Created', 'Provenance', 'Activity'].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>{state.rows.map((r) => (
                  <tr key={r.sessionId}>
                    <td data-label="Name"><button type="button" className="ss-link" onClick={() => void open(r.sessionId)}>{r.label}</button></td>
                    <td data-label="Session ID"><code title={r.sessionId}>{r.shortId}</code></td><td data-label="Status">{r.status}</td><td data-label="Participants">{r.participants}</td><td data-label="Created">{r.createdAt.slice(0, 10)}</td>
                    <td data-label="Provenance"><Badge tone={r.tone}>{r.provenanceLabel}</Badge></td><td data-label="Activity">{r.activityCount}{r.lastActivity ? ` (last ${r.lastActivity.slice(0, 10)})` : ''}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Section<T>({ caption, s, cols, row }: { caption: string; s: { available: boolean; note: string; items: T[] }; cols: string[]; row: (x: T) => React.ReactNode[] }) {
  return (
    <div>
      <p className={s.available ? 'ss-note' : 'ss-empty'}>{s.note}</p>
      {s.available && s.items.length > 0 && (
        <table><caption className="ss-sr">{caption}</caption><thead><tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{s.items.map((it, i) => <tr key={i}>{row(it).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
      )}
    </div>
  );
}
