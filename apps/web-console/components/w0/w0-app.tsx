'use client';
// W0 Web Console UI. Presentation only: every permission is enforced by the server; disabled buttons are a convenience, not a control.
// Nothing here can reach a signer: the browser talks only to /api/w0/*, which is backed by the MOCK adapter.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { OPERATIONS } from '../../lib/w0/types.ts';
import type { AuditEvent, Operation, OperatorApprovalIntent, ReadinessReport, Role } from '../../lib/w0/types.ts';

interface Me { subject: string; role: Role }
interface PreviewRec { requestId: string; operation: Operation; requestedBy: string; requestedAt: string; result: { outcome: string; exitCode: number; summary?: string; redactedOutput: string; baselineHash?: string } | null }
type Tab = 'overview' | 'readiness' | 'previews' | 'approvals' | 'audit' | 'identity';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['readiness', 'Readiness'], ['previews', 'Preview requests'], ['approvals', 'Approval intents'], ['audit', 'Audit events'], ['identity', 'Identity']];

let csrf = '';
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-w0-csrf'] = csrf;
  const res = await fetch(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), credentials: 'same-origin', cache: 'no-store' });
  const data = (await res.json().catch(() => ({ ok: false, message: 'unreadable response' }))) as T & { ok?: boolean; message?: string };
  if (!res.ok || data.ok === false) throw new Error(`${res.status}: ${data.message ?? 'request failed'}`);
  return data;
}

const CAN_REQUEST: Role[] = ['requester'];
const CAN_APPROVE: Role[] = ['approver'];

export function W0App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [me, setMe] = useState<Me | null>(null);
  const [choices, setChoices] = useState<Me[]>([]);
  const [idp, setIdp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadSession = useCallback(async () => {
    try {
      const s = await api<{ authenticated: boolean; principal?: Me; csrf?: string; idp: string; choices?: Me[] }>('GET', '/api/w0/session');
      setIdp(s.idp);
      if (s.authenticated && s.principal && s.csrf) { csrf = s.csrf; setMe(s.principal); } else { csrf = ''; setMe(null); setChoices(s.choices ?? []); }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
  }, []);
  useEffect(() => { void loadSession(); }, [loadSession]);

  const guard = async (fn: () => Promise<void>) => { setError(''); setNotice(''); try { await fn(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } };

  if (!me) {
    return (
      <main className="w0">
        <Banner />
        <section aria-labelledby="signin">
          <h2 id="signin">Sign in</h2>
          <p className="w0-dev" role="note"><strong>DEVELOPMENT IDENTITY, NOT PRODUCTION AUTHENTICATION.</strong> No production identity provider has been selected. These accounts have no credentials and exist only to exercise roles locally.</p>
          {idp === 'NONE' && <p className="w0-blocked">No identity provider is configured on this server, so nobody can sign in.</p>}
          <ul className="w0-plain">
            {choices.map((c) => (
              <li key={c.subject}><button type="button" onClick={() => guard(async () => { const r = await api<{ principal: Me; csrf: string }>('POST', '/api/w0/session', { subject: c.subject }); csrf = r.csrf; setMe(r.principal); })}>Sign in as {c.subject}</button> <small>role: {c.role}</small></li>
            ))}
          </ul>
          {error && <p className="w0-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="w0">
      <Banner />
      <p className="w0-dev" role="note">Signed in as <strong>{me.subject}</strong> ({me.role}) through the <strong>{idp}</strong> identity provider (development only).{' '}
        <button type="button" onClick={() => guard(async () => { await api('DELETE', '/api/w0/session'); csrf = ''; setMe(null); await loadSession(); })}>Sign out</button></p>
      <nav aria-label="W0 sections"><ul className="w0-tabs">
        {TABS.map(([id, label]) => <li key={id}><button type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button></li>)}
      </ul></nav>
      {error && <p className="w0-error" role="alert">{error}</p>}
      {notice && <p className="w0-notice" role="status">{notice}</p>}
      {tab === 'overview' && <Overview />}
      {tab === 'readiness' && <Readiness guard={guard} />}
      {tab === 'previews' && <Previews me={me} guard={guard} setNotice={setNotice} />}
      {tab === 'approvals' && <Approvals me={me} guard={guard} setNotice={setNotice} />}
      {tab === 'audit' && <Audit guard={guard} />}
      {tab === 'identity' && <Identity me={me} idp={idp} />}
    </main>
  );
}

function Banner() {
  return (
    <div className="w0-banner" role="note">
      <strong>W0 · MOCK ADAPTER · NON-EXECUTING.</strong> This console is a foundation. It does not invoke the real signer, hold keys, sign, submit transactions, contact Stellar RPC or deploy. Everything shown is mock data and proves nothing about the real signer.
    </div>
  );
}

function Overview() {
  return (
    <section aria-labelledby="ov">
      <h2 id="ov">Overview</h2>
      <p>These are separate stages. Completing one never implies the next.</p>
      <ol className="w0-stages">
        <li><strong>1. Preview request</strong>: a requester asks for a read-only preview of <code>deploy</code>, <code>mint-C</code> or <code>mint-D</code>.</li>
        <li><strong>2. Preview result</strong>: the adapter (mock here) answers with an outcome. Refusals are normal results.</li>
        <li><strong>3. Approval intent</strong>: a different person records <em>evidence</em> bound to a baseline and configuration hash. It is not authority and not an approved transaction.</li>
        <li><strong>4. Local operator authorization</strong>: only the operator, at the signer host, in a terminal, by typing the confirmation. Outside this console, always.</li>
        <li><strong>5. Execution</strong>: <span className="w0-blocked">not available and not implemented in W0.</span></li>
      </ol>
      <p>Unresolved by design: production identity provider, production audit storage, backend-to-signer transport, deployment topology, and the process-invocation hazard that blocks any real execution.</p>
    </section>
  );
}

function Readiness({ guard }: { guard: (fn: () => Promise<void>) => Promise<void> }) {
  const [r, setR] = useState<ReadinessReport | null>(null);
  const load = useCallback(() => guard(async () => { setR((await api<{ report: ReadinessReport }>('GET', '/api/w0/readiness')).report); }), [guard]);
  useEffect(() => { void load(); }, [load]);
  return (
    <section aria-labelledby="rd">
      <h2 id="rd">Readiness <span className="w0-tag">MOCK DATA</span></h2>
      {r && <>
        <p>Overall: <span className={`w0-status w0-s-${r.overall === 'BLOCKED' ? 'BLOCKED' : 'PASS'}`}>{r.overall}</span> <small>(generated {r.generatedAt}; source: {r.source})</small></p>
        {r.overall === 'BLOCKED' && <p className="w0-blocked">Blocked is an expected security restriction, not an application failure. A mock result never proves real signer readiness.</p>}
        <table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>
          {r.checks.map((c) => <tr key={c.id}><td><code>{c.id}</code></td><td><span className={`w0-status w0-s-${c.status}`}>{c.status}</span></td><td>{c.detail}</td></tr>)}
        </tbody></table>
      </>}
      <button type="button" onClick={() => void load()}>Re-check (mock)</button>
    </section>
  );
}

function Previews({ me, guard, setNotice }: { me: Me; guard: (fn: () => Promise<void>) => Promise<void>; setNotice: (s: string) => void }) {
  const [items, setItems] = useState<PreviewRec[]>([]);
  const [op, setOp] = useState<Operation>('deploy');
  const load = useCallback(() => guard(async () => { setItems((await api<{ previews: PreviewRec[] }>('GET', '/api/w0/previews')).previews); }), [guard]);
  useEffect(() => { void load(); }, [load]);
  const submit = (e: FormEvent) => { e.preventDefault(); void guard(async () => { await api('POST', '/api/w0/previews', { requestId: crypto.randomUUID(), operation: op }); setNotice('Preview requested from the MOCK adapter. This is not an approval and not an execution.'); await load(); }); };
  return (
    <section aria-labelledby="pv">
      <h2 id="pv">Preview requests <span className="w0-tag">MOCK ADAPTER</span></h2>
      <form onSubmit={submit}>
        <label>Operation <select value={op} onChange={(e) => setOp(e.target.value as Operation)}>{OPERATIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>{' '}
        <button type="submit" disabled={!CAN_REQUEST.includes(me.role)}>Request preview</button>
        {!CAN_REQUEST.includes(me.role) && <small> Your role ({me.role}) cannot request previews. The server enforces this independently.</small>}
      </form>
      <table><thead><tr><th>Request</th><th>Operation</th><th>By</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>
        {items.map((p) => (
          <tr key={p.requestId}>
            <td><code>{p.requestId.slice(0, 8)}</code></td><td>{p.operation}</td><td>{p.requestedBy}</td>
            <td>{p.result ? <span className={`w0-status w0-o-${p.result.outcome}`}>{p.result.outcome}</span> : 'no result recorded'}</td>
            <td>{p.result?.outcome === 'INTEGRITY_REFUSED' && <strong className="w0-security">SECURITY EVENT, not retryable. </strong>}{p.result?.redactedOutput}{p.result?.summary ? ` ${p.result.summary}` : ''}</td>
          </tr>
        ))}
      </tbody></table>
    </section>
  );
}

function Approvals({ me, guard, setNotice }: { me: Me; guard: (fn: () => Promise<void>) => Promise<void>; setNotice: (s: string) => void }) {
  const [items, setItems] = useState<OperatorApprovalIntent[]>([]);
  const [previews, setPreviews] = useState<PreviewRec[]>([]);
  const [sel, setSel] = useState('');
  const [baseline, setBaseline] = useState('');
  const [config, setConfig] = useState('');
  const [hours, setHours] = useState('1');
  const load = useCallback(() => guard(async () => {
    setItems((await api<{ intents: OperatorApprovalIntent[] }>('GET', '/api/w0/approvals')).intents);
    setPreviews((await api<{ previews: PreviewRec[] }>('GET', '/api/w0/previews')).previews);
  }), [guard]);
  useEffect(() => { void load(); }, [load]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = previews.find((x) => x.requestId === sel);
    if (!p) return;
    void guard(async () => {
      const now = new Date();
      const intent: OperatorApprovalIntent = {
        approvalId: crypto.randomUUID(), operation: p.operation, baselineHash: baseline.trim(), configSha256: config.trim(), requestedBy: p.requestedBy,
        approvedBy: me.subject, approvedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'), expiresAt: new Date(now.getTime() + Number(hours) * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z'),
      };
      await api('POST', '/api/w0/approvals', intent);
      setNotice('Approval intent recorded as evidence only. It authorizes nothing; the operator must still act locally at the signer host.');
      await load();
    });
  };
  return (
    <section aria-labelledby="ap">
      <h2 id="ap">Approval intents <span className="w0-tag">EVIDENCE ONLY</span></h2>
      <p className="w0-note">An approval intent is a record. It is not execution authority, not an approved transaction, and cannot trigger the signer or supply the typed confirmation.</p>
      <form onSubmit={submit}>
        <p><label>Request <select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">choose…</option>{previews.map((p) => <option key={p.requestId} value={p.requestId}>{p.operation} by {p.requestedBy} ({p.requestId.slice(0, 8)})</option>)}</select></label></p>
        <p><label>Baseline hash (from your independent record) <input value={baseline} onChange={(e) => setBaseline(e.target.value)} size={66} spellCheck={false} /></label></p>
        <p><label>Configuration SHA-256 <input value={config} onChange={(e) => setConfig(e.target.value)} size={66} spellCheck={false} /></label></p>
        <p><label>Valid for (hours, max 24) <input value={hours} onChange={(e) => setHours(e.target.value)} size={4} inputMode="decimal" /></label></p>
        <button type="submit" disabled={!CAN_APPROVE.includes(me.role) || !sel}>Record approval intent</button>
        {!CAN_APPROVE.includes(me.role) && <small> Your role ({me.role}) cannot record approval intents. The server enforces this independently.</small>}
      </form>
      <table><thead><tr><th>Approval</th><th>Operation</th><th>Requested by</th><th>Approved by</th><th>Expires</th></tr></thead><tbody>
        {items.map((i) => <tr key={i.approvalId}><td><code>{i.approvalId.slice(0, 8)}</code></td><td>{i.operation}</td><td>{i.requestedBy}</td><td>{i.approvedBy}</td><td>{i.expiresAt}</td></tr>)}
      </tbody></table>
    </section>
  );
}

function Audit({ guard }: { guard: (fn: () => Promise<void>) => Promise<void> }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [f, setF] = useState({ actor: '', operation: '', type: '', outcome: '', from: '', to: '' });
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const load = useCallback(() => guard(async () => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v.trim()) q.set(k, v.trim());
    setEvents((await api<{ events: AuditEvent[] }>('GET', `/api/w0/audit${q.size ? `?${q}` : ''}`)).events);
  }), [guard, f]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <section aria-labelledby="au">
      <h2 id="au">Audit events <span className="w0-tag">MOCK EVENTS, IN MEMORY</span></h2>
      <p className="w0-note">These are this console&apos;s own mock events. Real signer state-file events are not shown and are never read in W0.</p>
      <form onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <label>Actor <input value={f.actor} onChange={set('actor')} /></label>{' '}
        <label>Operation <select value={f.operation} onChange={set('operation')}><option value="">any</option>{OPERATIONS.map((o) => <option key={o}>{o}</option>)}</select></label>{' '}
        <label>Type <input value={f.type} onChange={set('type')} placeholder="e.g. integrity_refused" /></label>{' '}
        <label>Outcome <input value={f.outcome} onChange={set('outcome')} /></label>{' '}
        <label>From (UTC) <input value={f.from} onChange={set('from')} placeholder="2026-11-06T00:00:00Z" /></label>{' '}
        <label>To (UTC) <input value={f.to} onChange={set('to')} placeholder="2026-11-07T00:00:00Z" /></label>{' '}
        <button type="submit">Filter</button>
      </form>
      <table><thead><tr><th>Time</th><th>Type</th><th>Actor</th><th>Operation</th><th>Outcome</th><th /></tr></thead><tbody>
        {events.map((e) => <tr key={e.eventId} className={e.type === 'integrity_refused' ? 'w0-security-row' : undefined}><td>{e.timestamp}</td><td>{e.type}</td><td>{e.actor}</td><td>{e.operation ?? ''}</td><td>{e.outcome ?? ''}</td><td><button type="button" onClick={() => setOpen(e)}>Inspect</button></td></tr>)}
      </tbody></table>
      {open && <div role="region" aria-label="Event detail"><h3>Event {open.eventId.slice(0, 8)} <span className="w0-tag">MOCK</span></h3><pre>{JSON.stringify(open, null, 2)}</pre><button type="button" onClick={() => setOpen(null)}>Close</button></div>}
    </section>
  );
}

function Identity({ me, idp }: { me: Me; idp: string }) {
  return (
    <section aria-labelledby="id">
      <h2 id="id">Identity and roles</h2>
      <p>Subject <strong>{me.subject}</strong>, role <strong>{me.role}</strong>, identity provider <strong>{idp}</strong> (not production authentication).</p>
      <table><thead><tr><th>Role</th><th>May</th></tr></thead><tbody>
        <tr><td>viewer</td><td>read readiness, previews, approval intents and audit events</td></tr>
        <tr><td>requester</td><td>everything a viewer may, and request a preview</td></tr>
        <tr><td>approver</td><td>everything a viewer may, and record an approval intent (never for their own request)</td></tr>
      </tbody></table>
      <p>The <strong>operator</strong> is the local OS account on the signer host. It is not a web role and cannot be assigned here.</p>
    </section>
  );
}
