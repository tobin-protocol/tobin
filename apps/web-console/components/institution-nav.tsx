'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from './api-client.ts';
import { loadFreighter, watchWallet } from '../lib/stellar/wallet-signin.ts';
import type { WalletWatch } from '../lib/stellar/wallet-signin.ts';

// Navigation of the institutional area only. Add entries here as institutional screens appear; never link the signer console (/w0).
const ITEMS = [{ href: '/sessions', label: 'Sessions' }, { href: '/organizations', label: 'Organizations' }, { href: '/account', label: 'Account' }] as const;

interface Me { user: { displayName: string }; wallets?: { publicKey: string }[]; organizations?: { id: string; name: string }[]; lastOrgId?: string | null }
const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;

export function InstitutionNav() {
  const path = usePathname() ?? '';
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [watch, setWatch] = useState<WalletWatch | null>(null);
  useEffect(() => {
    api<Me>('GET', '/api/auth/me').then((r) => setMe(r), () => setMe(null));
  }, [path]);
  const signOut = async () => { try { await api('POST', '/api/auth/logout', {}); } finally { window.location.assign('/sign-in'); } };

  // Notice (without prompting) when the user switches Freighter to another account or network after signing in. The session stays as it is; the banner only says what changed.
  const known = (me?.wallets ?? []).map((w) => w.publicKey).join(',');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tick = useCallback(async () => {
    const keys = known ? known.split(',') : [];
    if (keys.length === 0) return;
    const w = await watchWallet(await loadFreighter(), keys);
    setWatch(w);
    if (w.kind !== 'unavailable') timer.current = setTimeout(() => void tick(), 5000); // an absent wallet is not polled again until the window regains focus
  }, [known]);
  useEffect(() => {
    if (!known) { setWatch(null); return; }
    void tick();
    const onFocus = () => { if (timer.current) clearTimeout(timer.current); void tick(); };
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('focus', onFocus); if (timer.current) clearTimeout(timer.current); };
  }, [known, tick]);

  const orgs = me?.organizations ?? [];
  const switchOrg = (orgId: string) => { void api('POST', '/api/auth/workspace', { orgId }).finally(() => window.location.reload()); };
  return (
    <>
      <nav className="inst-nav" aria-label="Institution">
        <ul>
          {ITEMS.map((i) => {
            const active = path === i.href || path.startsWith(`${i.href}/`);
            return <li key={i.href}><Link href={i.href} aria-current={active ? 'page' : undefined} className={active ? 'inst-active' : undefined}>{i.label}</Link></li>;
          })}
          {me === null && <li className="inst-end"><Link href="/sign-in" aria-current={path === '/sign-in' ? 'page' : undefined} className={path === '/sign-in' ? 'inst-active' : undefined}>Sign in</Link></li>}
          {me && <li className="inst-end">
            {orgs.length > 1 && <label>Workspace <select aria-label="Workspace" value={me.lastOrgId ?? ''} onChange={(e) => switchOrg(e.target.value)}>{!me.lastOrgId && <option value="">Choose…</option>}{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
            <span className="inst-user">Signed in as {me.user.displayName}</span> <button type="button" onClick={() => void signOut()}>Sign out</button>
          </li>}
        </ul>
      </nav>
      {watch?.kind === 'account-changed' && <div className="wf-banner" role="status" data-wallet-banner="account-changed"><p>Freighter is now on <code>{short(watch.address)}</code>, which is not a verified wallet of your account. You are still signed in as {me?.user.displayName}. Switch Freighter back, or sign out and sign in with that wallet.</p></div>}
      {watch?.kind === 'network-changed' && <div className="wf-banner" role="status" data-wallet-banner="network-changed"><p>Freighter is on &quot;{watch.network}&quot;, not Stellar Testnet. Wallet actions will not work until you switch it back to Testnet.</p></div>}
    </>
  );
}
