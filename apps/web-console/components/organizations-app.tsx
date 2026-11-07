'use client';
// Minimal organization management: list and select, create, details, members and roles, invitations (create, revoke, accept). Presentation only:
// every rule is enforced server-side. No wallet, no Stellar call. Invitations are NOT emailed: the one-time code is shown once to the administrator.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from './api-client.ts';

interface Org { id: string; name: string; description: string }
interface Member { userId: string; role: 'admin' | 'member'; reviewer?: boolean; name: string; email?: string; since: string; you: boolean }
interface Invitation { id: string; invitee: string; role: string; status: string; expiresAt: string }

export function OrganizationsApp() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [org, setOrg] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [issued, setIssued] = useState<{ token: string; note: string } | null>(null);
  const [acceptToken, setAcceptToken] = useState('');

  const fail = (e: unknown) => { if (e instanceof ApiError && e.status === 401) setSignedOut(true); else setError((e as Error).message); };

  const loadOrgs = useCallback(async (select?: string) => {
    try {
      const who = await api<{ user: { displayName: string } }>('GET', '/api/auth/me'); setMe(who.user.displayName);
      const r = await api<{ organizations: Org[] }>('GET', '/api/registry/orgs');
      setOrgs(r.organizations); setLoaded(true);
      setOrg((cur) => select ?? (r.organizations.some((o) => o.id === cur) ? cur : r.organizations[0]?.id ?? ''));
    } catch (e) { fail(e); setLoaded(true); }
  }, []);
  const loadOrg = useCallback(async (id: string) => {
    if (!id) { setMembers([]); setInvites([]); setRole(null); return; }
    try {
      const d = await api<{ role: 'admin' | 'member' }>('GET', `/api/registry/orgs/${id}`); setRole(d.role);
      const m = await api<{ members: Member[] }>('GET', `/api/registry/orgs/${id}/members`); setMembers(m.members);
      if (d.role === 'admin') { const i = await api<{ invitations: Invitation[] }>('GET', `/api/registry/orgs/${id}/invitations`); setInvites(i.invitations); } else setInvites([]);
    } catch (e) { fail(e); }
  }, []);

  useEffect(() => { void loadOrgs(); }, [loadOrgs]);
  useEffect(() => { setIssued(null); void loadOrg(org); }, [org, loadOrg]);
  // An invitation link carries the code in the URL fragment (#invite=...), which the browser never sends to any server. Read it, then clear it.
  useEffect(() => {
    const m = /(?:^|&)invite=([A-Za-z0-9_-]+)/.exec(window.location.hash.slice(1));
    if (m?.[1]) { setAcceptToken(m[1]); history.replaceState(null, '', window.location.pathname); }
  }, []);

  const run = async (fn: () => Promise<void>) => { setError(null); setNotice(null); try { await fn(); } catch (e) { fail(e); } };
  const create = (ev: FormEvent) => { ev.preventDefault(); void run(async () => { const r = await api<{ organization: Org }>('POST', '/api/registry/orgs', { name }); setName(''); await loadOrgs(r.organization.id); setNotice(`Organization "${r.organization.name}" created. You are its administrator.`); }); };
  const invite = (ev: FormEvent) => { ev.preventDefault(); void run(async () => { const r = await api<{ token: string; delivery: { note: string } }>('POST', `/api/registry/orgs/${org}/invitations`, { invitee: inviteEmail, role: inviteRole }); setIssued({ token: r.token, note: r.delivery.note }); setInviteEmail(''); await loadOrg(org); }); };
  const accept = (ev: FormEvent) => { ev.preventDefault(); void run(async () => { await api('POST', '/api/registry/invitations/accept', { token: acceptToken.trim() }); setAcceptToken(''); await loadOrgs(); await loadOrg(org); setNotice('Invitation accepted. You are now a member.'); }); };
  const setMemberRole = (id: string, r: 'admin' | 'member') => void run(async () => { await api('POST', `/api/registry/orgs/${org}/members/${id}/role`, { role: r }); await loadOrg(org); });
  const setReviewer = (id: string, grant: boolean) => void run(async () => { await api('POST', `/api/registry/orgs/${org}/reviewers/${id}/${grant ? 'grant' : 'revoke'}`, {}); await loadOrg(org); });
  const remove = (id: string) => void run(async () => { await api('POST', `/api/registry/orgs/${org}/members/${id}/remove`, {}); await loadOrg(org); });
  const revoke = (id: string) => void run(async () => { await api('POST', `/api/registry/orgs/${org}/invitations/${id}/revoke`, {}); await loadOrg(org); });

  const current = orgs.find((o) => o.id === org);
  if (signedOut) return <main className="ss"><p className="ss-banner" role="note">You are not signed in. <Link href="/sign-in">Sign in</Link> to manage organizations.</p></main>;

  return (
    <main className="ss" aria-live="polite">
      <p className="ss-banner" role="note">{me ? <>Signed in as <strong>{me}</strong>. </> : null}Roles here are application roles. They grant no authority on Stellar, and no wallet is used.</p>
      <h2>Organizations</h2>
      {error && <p className="ss-error" role="alert">{error}</p>}
      {notice && <p className="ss-notice" role="status">{notice}</p>}

      {loaded && orgs.length === 0 && <p className="ss-empty">You are not a member of any organization yet. Create one below, or accept an invitation.</p>}
      {orgs.length > 0 && (
        <label>Active organization{' '}
          <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Active organization">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
      )}

      {current && (
        <section aria-label="Organization details">
          <h3>{current.name}</h3>
          <p className="ss-note">{current.description || 'No description.'} Your role: <strong>{role ?? '…'}</strong>.</p>
          <h3>Members</h3>
          <p className="ss-note">A reviewer can approve or reject a calculation result. Being an administrator does not make someone a reviewer, and nobody can decide on a result they recorded, changed or calculated. A reviewer decision is an application record, not a Stellar signature.</p>
          <table className="ss-list">
            <caption className="ss-sr">Members of {current.name}</caption>
            <thead><tr>{['Name', 'Role', 'Since', 'Actions'].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.userId}>
                <td data-label="Name">{m.name}{m.you ? ' (you)' : ''}{m.email ? <><br /><small>{m.email}</small></> : null}</td>
                <td data-label="Role">{m.role}{m.reviewer ? ', reviewer' : ''}</td>
                <td data-label="Since">{m.since.slice(0, 10)}</td>
                <td data-label="Actions">{role === 'admin' ? (
                  <>
                    <button type="button" onClick={() => setMemberRole(m.userId, m.role === 'admin' ? 'member' : 'admin')}>{m.role === 'admin' ? `Make ${m.name} a member` : `Make ${m.name} an admin`}</button>{' '}
                    <button type="button" onClick={() => setReviewer(m.userId, !m.reviewer)}>{m.reviewer ? `Revoke reviewer from ${m.name}` : `Grant reviewer to ${m.name}`}</button>{' '}
                    <button type="button" onClick={() => remove(m.userId)}>{`Remove ${m.name}`}</button>
                  </>) : '—'}</td>
              </tr>))}</tbody>
          </table>

          {role === 'admin' && (
            <>
              <h3>Invitations</h3>
              <form onSubmit={invite} className="inst-form">
                <label>Invitee email <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} maxLength={120} required /></label>
                <label>Role <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}><option value="member">member</option><option value="admin">admin</option></select></label>
                <button type="submit">Create invitation</button>
              </form>
              {issued && (
                <div className="ss-provenance ss-warn" role="status">
                  <strong>One-time invitation code.</strong> {issued.note} It is shown once and cannot be retrieved later.
                  <p><code>{issued.token}</code></p>
                  <p><small>Invitation link: <code>{`${typeof window === 'undefined' ? '' : window.location.origin}/organizations#invite=${issued.token}`}</code></small></p>
                </div>
              )}
              {invites.length === 0 ? <p className="ss-empty">No invitations yet.</p> : (
                <table className="ss-list">
                  <caption className="ss-sr">Invitations of {current.name}</caption>
                  <thead><tr>{['Invitee', 'Role', 'Status', 'Expires', 'Actions'].map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                  <tbody>{invites.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Invitee">{i.invitee}</td><td data-label="Role">{i.role}</td><td data-label="Status">{i.status}</td><td data-label="Expires">{i.expiresAt.slice(0, 10)}</td>
                      <td data-label="Actions">{i.status === 'pending' ? <button type="button" onClick={() => revoke(i.id)}>{`Revoke invitation for ${i.invitee}`}</button> : '—'}</td>
                    </tr>))}</tbody>
                </table>
              )}
            </>
          )}
        </section>
      )}

      <section aria-label="New organization">
        <h3>New organization</h3>
        <form onSubmit={create} className="inst-form">
          <label>Name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
          <button type="submit">Create organization</button>
        </form>
      </section>
      <section aria-label="Accept an invitation">
        <h3>Accept an invitation</h3>
        <form onSubmit={accept} className="inst-form">
          <label>Invitation code <input value={acceptToken} onChange={(e) => setAcceptToken(e.target.value)} maxLength={128} required autoComplete="off" /></label>
          <button type="submit">Accept invitation</button>
        </form>
      </section>
    </main>
  );
}
