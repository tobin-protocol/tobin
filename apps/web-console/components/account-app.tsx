'use client';
// Account: profile name, verified wallets (add with a fresh proof of the NEW key, remove with history kept), session control and the authentication audit trail.
// A verified wallet is proof of control of a key. It is never an institutional role, never a reviewer grant and never a Stellar signer.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from './api-client.ts';
import { loadFreighter, runWalletSignIn } from '../lib/stellar/wallet-signin.ts';
import type { SignInState } from '../lib/stellar/wallet-signin.ts';

interface View { user: { id: string; displayName: string; authMethod: 'password' | 'wallet'; email?: string }; wallets: { id: string; publicKey: string; network: string; verifiedAt: string }[] }
interface Ev { at: string; kind: string; subject: string; detail: string }

export function AccountApp() {
  const [view, setView] = useState<View | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState<{ s: SignInState; d: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await api<View>('GET', '/api/auth/me'); setView(v); setName(v.user.displayName);
      setEvents((await api<{ events: Ev[] }>('GET', '/api/auth/audit')).events);
    } catch (e) { if (e instanceof ApiError && e.status === 401) window.location.assign('/sign-in'); else setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>) => { setError(null); setNotice(null); setBusy(true); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const saveName = (ev: FormEvent) => { ev.preventDefault(); void run(async () => { await api('POST', '/api/auth/profile', { displayName: name }); setNotice('Name saved.'); await load(); }); };
  const addWallet = () => void run(async () => {
    setState(null);
    const out = await runWalletSignIn({ api: await loadFreighter(), post: (p, b) => api('POST', p, b), base: '/api/auth/wallet/link', onState: (s, d) => setState({ s, d }) });
    setState({ s: out.state, d: out.detail });
    if (out.state === 'authenticated') { setNotice('Wallet verified and added to your account.'); await load(); }
  });
  const removeWallet = (id: string) => void run(async () => { await api('POST', '/api/auth/wallet/remove', { walletId: id }); setNotice('Wallet removed. Its history is kept.'); await load(); });
  const signOutEverywhere = () => void run(async () => { await api('POST', '/api/auth/logout-all', {}); window.location.assign('/sign-in'); });

  if (!view) return <main className="ss"><p role="status">{error ?? 'Loading…'}</p></main>;
  return (
    <main className="ss wf">
      <h2>Account</h2>
      <p className="ss-note">A verified wallet proves you control that key. It does not make you a member, administrator or reviewer of any institution, and it is not a Stellar signer. <Link href="/organizations">Organizations</Link></p>
      {error && <p className="ss-error" role="alert">{error}</p>}
      {notice && <p className="ss-notice" role="status">{notice}</p>}

      <form className="wf-card inst-form" onSubmit={saveName} aria-label="Profile">
        <h3 style={{ flexBasis: '100%' }}>Profile</h3>
        <label>Display name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-label="Display name" /></label>
        <button type="submit" disabled={busy}>Save name</button>
        <small>Sign-in method: {view.user.authMethod === 'wallet' ? 'wallet' : `email (${view.user.email ?? ''})`}.</small>
      </form>

      <section className="wf-card" aria-label="Verified wallets">
        <h3>Verified wallets</h3>
        {view.wallets.length === 0 ? <p className="ss-empty">No wallet is verified for this account.</p> : (
          <table className="ss-list"><caption className="ss-sr">Verified wallets</caption>
            <thead><tr>{['Public key', 'Network', 'Verified', 'Actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{view.wallets.map((w) => (
              <tr key={w.id}><td data-label="Public key"><code>{w.publicKey}</code></td><td data-label="Network">{w.network}</td><td data-label="Verified">{w.verifiedAt.slice(0, 19)}</td>
                <td data-label="Actions"><button type="button" disabled={busy} onClick={() => removeWallet(w.id)} aria-label={`Remove wallet ${w.publicKey.slice(0, 6)}…${w.publicKey.slice(-6)}`}>Remove</button></td></tr>))}</tbody>
          </table>
        )}
        <p className="ss-note">To add a wallet, switch Freighter to that account, then press Add wallet and approve the message. A wallet that belongs to another Tobin account cannot be added, and accounts are never merged. Keep at least one verified wallet that you control. If you lose access to every verified wallet, Tobin cannot restore your account: there is no administrator override and no support recovery. For that reason removing your only wallet is refused.</p>
        <div className="wf-actions"><button type="button" onClick={addWallet} disabled={busy}>Add wallet</button></div>
        {state && <div className="wf-status" data-tone={state.s === 'authenticated' ? 'ok' : ['detecting', 'connecting', 'requesting-challenge', 'awaiting-approval', 'verifying'].includes(state.s) ? 'busy' : 'warn'} role="status" aria-live="polite"><strong>{state.s.replace(/-/g, ' ')}</strong>: {state.d}</div>}
      </section>

      <section className="wf-card" aria-label="Sessions">
        <h3>Sessions</h3>
        <p className="ss-note">Signing out everywhere ends every session of this account, including this one.</p>
        <div className="wf-actions"><button type="button" onClick={signOutEverywhere} disabled={busy}>Sign out everywhere</button></div>
      </section>

      <section className="wf-card" aria-label="Authentication activity">
        <h3>Authentication activity</h3>
        {events.length === 0 ? <p className="ss-empty">No recorded activity.</p> : (
          <table className="ss-list"><caption className="ss-sr">Authentication activity</caption>
            <thead><tr>{['When', 'Event', 'Detail'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{[...events].reverse().slice(0, 25).map((e, i) => <tr key={i}><td data-label="When">{e.at.slice(0, 19).replace('T', ' ')}</td><td data-label="Event">{e.kind}</td><td data-label="Detail">{e.detail}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </main>
  );
}
