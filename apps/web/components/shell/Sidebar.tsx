"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquareLock01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Icon } from "../tobin/Icon.tsx";
import { Button } from "@/components/kit/button";
import { Wordmark } from "./BrandMark.tsx";
import { EXTERNAL, NAV, activeNav } from "./nav.ts";
import { OrgSelector } from "./OrgSelector.tsx";

const SECTION = "px-4 pb-1 pt-5 font-label text-label uppercase tracking-wider text-muted";

/** The 256px sidebar. Signed in: organization selector, NAVIGATION, EXTERNAL. Signed out: Discover active, everything else shown locked (a link to sign-in that returns there), and a Connect wallet button. */
export function SidebarContent({ signedIn, pending, onNavigate }: { signedIn: boolean; pending?: number | null; onNavigate?: () => void }) {
  const path = usePathname();
  const active = activeNav(path);
  return (
    <div className="flex h-full flex-col bg-page">
      <div className="flex h-[58px] shrink-0 items-center border-b border-divider px-4">
        <Link href={signedIn ? "/" : "/discover"} aria-label="Tobin home" onClick={onNavigate} className="flex min-h-11 items-center"><Wordmark /></Link>
      </div>
      {signedIn ? <div className="border-b border-divider p-2"><OrgSelector onNavigate={onNavigate} /></div> : null}
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto pb-4">
        <p className={SECTION}>Navigation</p>
        <ul>
          {NAV.map((n) => {
            const locked = !signedIn && n.id !== "discover";
            const on = active === n.id;
            const href = locked ? `/sign-in?next=${encodeURIComponent(n.href)}` : n.href;
            return (
              <li key={n.id}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-l-2 px-4 text-[14px] font-medium uppercase tracking-wide transition-colors hover:bg-tile",
                    on ? "border-ink bg-tile text-ink" : "border-transparent",
                    locked ? "text-muted" : "text-ink",
                  )}
                >
                  <Icon icon={n.icon} size={20} />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  {n.id === "reviews" && pending ? <><span aria-hidden="true" className="min-w-6 bg-ink px-1.5 text-center font-label text-label text-on-button">{pending}</span><span className="sr-only">{pending} awaiting your review, derived from up to 10 sessions</span></> : null}
                  {locked ? <><Icon icon={SquareLock01Icon} size={16} /><span className="sr-only">Locked: sign in first</span></> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        {signedIn ? (
          <>
            <p className={SECTION}>External</p>
            <ul>
              {EXTERNAL.map((e) => (
                <li key={e.id}>
                  <a href={e.href} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center gap-3 border-l-2 border-transparent px-4 text-[14px] font-medium uppercase tracking-wide hover:bg-tile">
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    <span className="sr-only">(opens in a new tab)</span>
                    <span aria-hidden="true" className="text-muted">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>
      {!signedIn ? (
        <div className="shrink-0 border-t border-divider p-4">
          <Button asChild size="lg" className="w-full"><Link href="/sign-in" onClick={onNavigate}>Connect wallet</Link></Button>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar(props: { signedIn: boolean; pending?: number | null }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-divider lg:block" aria-label="Sidebar">
      <SidebarContent {...props} />
    </aside>
  );
}
