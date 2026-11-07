'use client';
// Public entry point for an invitation link (/join#invite=CODE). The code is in the URL fragment, which the browser never sends to a server. Joining needs a signed-in account: the server
// checks the invitation (unexpired, unused, bound to this person where it names an email or a wallet) and gives exactly the role it offers.
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from './api-client.ts';

export function JoinApp() {
  const [token, setToken] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const m = /(?:^|&)invite=([A-Za-z0-9_-]+)/.exec(window.location.hash.slice(1));
    if (m?.[1]) { setToken(m[1]); history.replaceState(null, '', window.location.pathname); }
    api('GET', '/api/auth/me').then(() => setSignedIn(true), () => setSignedIn(false));
  }, []);
  const accept = async (ev: FormEvent) => {
    ev.preventDefault(); setError(null); setBusy(true);
    try {
      const r = await api<{ membership: { orgId: string } }>('POST', '/api/registry/invitations/accept', { token: token.trim() });
      await api('POST', '/api/auth/workspace', { orgId: r.membership.orgId });
      window.location.assign('/sessions');
    } catch (e) { setError(e instanceof ApiError && e.status === 401 ? 'Sign in first, then open the invitation link again.' : (e as Error).message); setBusy(false); }
  };
  return (
    <main className="ss wf">
      <h2>Join an institution</h2>
      {signedIn === false && <p className="ss-banner" role="note">You are not signed in. <Link href="/sign-in">Sign in with your wallet</Link>, then open your invitation link again. Signing in does not join you to anything by itself.</p>}
      <form className="wf-card inst-form" onSubmit={accept} aria-label="Accept an invitation">
        <label>Invitation code <input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Invitation code" /></label>
        <small>You will get exactly the role the invitation offers. An invitation addressed to an email or a wallet can only be accepted by that person.</small>
        <button type="submit" className="wf-primary" disabled={busy || signedIn !== true || token.trim().length < 16}>Accept invitation</button>
      </form>
      {error && <p className="ss-error" role="alert">{error}</p>}
    </main>
  );
}
