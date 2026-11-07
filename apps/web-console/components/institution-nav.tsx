'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from './api-client.ts';

// Navigation of the institutional area only. Add entries here as institutional screens appear; never link the signer console (/w0).
const ITEMS = [{ href: '/sessions', label: 'Sessions' }, { href: '/organizations', label: 'Organizations' }] as const;

export function InstitutionNav() {
  const path = usePathname() ?? '';
  const [user, setUser] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api<{ user: { displayName: string } }>('GET', '/api/auth/me').then((r) => setUser(r.user.displayName), () => setUser(null));
  }, [path]);
  const signOut = async () => { try { await api('POST', '/api/auth/logout', {}); } finally { window.location.assign('/sign-in'); } };
  return (
    <nav className="inst-nav" aria-label="Institution">
      <ul>
        {ITEMS.map((i) => {
          const active = path === i.href || path.startsWith(`${i.href}/`);
          return <li key={i.href}><Link href={i.href} aria-current={active ? 'page' : undefined} className={active ? 'inst-active' : undefined}>{i.label}</Link></li>;
        })}
        {user === null && <li className="inst-end"><Link href="/sign-in" aria-current={path === '/sign-in' ? 'page' : undefined} className={path === '/sign-in' ? 'inst-active' : undefined}>Sign in</Link></li>}
        {user && <li className="inst-end"><span className="inst-user">Signed in as {user}</span> <button type="button" onClick={() => void signOut()}>Sign out</button></li>}
      </ul>
    </nav>
  );
}
