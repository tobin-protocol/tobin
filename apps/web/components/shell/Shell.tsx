"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { client, SAMPLE_DATA } from "../../lib/tobin/index.ts";
import { cn, INSTITUTION_LABEL, middle } from "../../lib/format.ts";
import { roleLabels } from "../../lib/permissions/can.ts";
import { Button } from "../ui/Button.tsx";
import { PageTabs, type TabItem } from "../ui/Data.tsx";
import { CommandPanel, Dialog, Popover } from "../ui/Overlays.tsx";
import { SampleDataBanner } from "../ui/Surfaces.tsx";
import { useWallet } from "../wallet/WalletProvider.tsx";
import { Wordmark } from "./BrandMark.tsx";
import { useWorkspace } from "./session.tsx";
import { useApprovalsPending } from "../approvals/usePending.ts";

export const NAV: TabItem[] = [
  { href: "/", label: "Overview" },
  { href: "/sessions", label: "Clearing Sessions" },
  { href: "/obligations", label: "Obligations" },
  { href: "/organization", label: "Organization" },
  { href: "/activity", label: "Activity" },
  { href: "/wallets", label: "Wallets" },
  { href: "/settings", label: "Settings" },
];

/** Reached from the bottom bar, the command panel and the attention list. It is not one of the seven destinations of the top navigation. */
const APPROVALS = { href: "/approvals", label: "Approvals" };
const activeOf = (path: string) => (path === "/notifications" ? "" : path === "/approvals" || path.startsWith("/approvals/") ? "/approvals" : NAV.find((n) => (n.href === "/" ? path === "/" : path === n.href || path.startsWith(n.href + "/")))?.href ?? "/");
const IconBtn = "flex h-9 min-w-9 max-md:h-11 max-md:min-w-11 items-center justify-center gap-2 rounded-btn bg-ink-5 px-2 text-body font-medium transition-colors duration-150 hover:bg-ink-10";

function OrgSelector() {
  const { orgs, org, switchOrg } = useWorkspace();
  const detail = useQuery({ queryKey: ["org", org.id], queryFn: () => client.organizations.get(org.id) });
  const type = detail.data?.organization.institutionType;
  return (
    <Popover
      trigger={({ open, toggle, ref, id }) => (
        <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Organization: ${org.name}. Change organization`} className="flex h-10 max-md:h-11 max-w-full items-center gap-2.5 rounded-btn px-2 transition-colors duration-150 hover:bg-ink-5 sm:max-w-xs">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-btn bg-ink-10 text-body font-medium max-sm:hidden">{org.name.trim()[0]?.toUpperCase() ?? "?"}</span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-body font-medium">{org.name}</span>
            <span className="hidden truncate text-label text-muted sm:block">{type ? INSTITUTION_LABEL[type] ?? type : "Organization"}</span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0 text-muted"><path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="px-3 pb-1 pt-2 text-label uppercase tracking-wide text-muted">Your organizations</p>
          <ul>
            {orgs.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={async () => { close(); if (o.id !== org.id) await switchOrg(o.id); }} aria-current={o.id === org.id ? "true" : undefined} className="flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left hover:bg-ink-5">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", o.id === org.id ? "bg-button" : "border border-muted")} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{o.name}</span><span className="block text-label text-muted">{o.role === "admin" ? "Admin" : "Member"}</span></span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 pb-2 pt-1 text-label text-muted">You are acting under <span className="font-medium text-ink">{org.name}</span>. Everything in the app is scoped to it.</p>
        </div>
      )}
    </Popover>
  );
}

function EnvIndicator() {
  return (
    <Popover
      align="right"
      trigger={({ open, toggle, ref, id }) => (
        <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={id} className={IconBtn} title="Active network">
          <span aria-hidden="true" className="size-2 rounded-full border border-ink" />
          <span className="whitespace-nowrap"><span className="sm:hidden">Testnet</span><span className="hidden sm:inline">Stellar Testnet</span></span>
        </button>
      )}
    >
      {() => (
        <div className="p-3 text-body">
          <p className="font-medium">Stellar Testnet</p>
          <p className="mt-1 text-muted">Tobin runs on Stellar Testnet only, with test assets. Nothing in this app moves real funds, and there is no Mainnet state.</p>
        </div>
      )}
    </Popover>
  );
}

function WalletCell() {
  const { me } = useWorkspace();
  const { wallet, connect, refresh } = useWallet();
  const address = "address" in wallet ? wallet.address : null;
  const verified = !!address && (me.wallets ?? []).some((w) => w.publicKey === address);
  const state =
    wallet.kind === "DETECTING" ? "Checking" : wallet.kind === "READY" ? (verified ? "Connected, verified" : "Connected, not verified") : wallet.kind === "WRONG_NETWORK" ? "Wrong network" : wallet.kind === "NOT_ALLOWED" ? "Not connected" : "Freighter not found";
  return (
    <Popover
      align="right"
      trigger={({ open, toggle, ref, id }) => (
        <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Wallet: ${state}`} className={IconBtn}>
          <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-ink-15 text-label">{address ? address[0] : "·"}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block font-mono text-ident">{address ? middle(address, 4, 4) : "No wallet"}</span>
            <span className="block text-label text-muted">Freighter</span>
          </span>
          <span aria-hidden="true" className={cn("size-2 rounded-full", wallet.kind === "READY" && verified ? "bg-button" : "border border-muted")} />
        </button>
      )}
    >
      {() => (
        <div className="w-72 p-3 text-body">
          <p className="font-medium">Wallet</p>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd>Freighter</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Connected</dt><dd>{wallet.kind === "READY" ? "Yes" : "No"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Verified for your account</dt><dd>{verified ? "Yes" : "No"}</dd></div>
            {address ? <div className="flex justify-between gap-3"><dt className="text-muted">Address</dt><dd className="font-mono text-ident">{middle(address, 6, 6)}</dd></div> : null}
          </dl>
          <p className="mt-3 text-label text-muted">Connected means Freighter answered on Testnet. Verified means you proved control of this key to Tobin. A connected wallet is not a verified one, and neither grants a role or signing authority in Tobin.</p>
          {wallet.kind === "UNAVAILABLE" ? <p className="mt-2 text-label text-muted">Freighter was not found in this browser.</p> : null}
          {wallet.kind === "WRONG_NETWORK" ? <p className="mt-2 text-label text-muted">Freighter is on {wallet.network}. Switch it to Testnet.</p> : null}
          <div className="mt-3 flex gap-2">
            <Button size="md" onClick={() => connect()}>Connect Freighter</Button>
            <Button size="md" variant="quiet" onClick={() => refresh()}>Check again</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function Bell() {
  // Not supported: the backend has no notifications. A muted bell that leads to the explanation, with no badge, no count and no items.
  return (
    <Link href="/notifications" aria-label="Notifications: not supported" title="Notifications are not supported" className={`${IconBtn} text-disabled hover:text-muted`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5"><path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 3-1.5 4-1.5 4h12s-1.5-1-1.5-4A4.5 4.5 0 0010 3zM8.5 15a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </Link>
  );
}

function AccountMenu() {
  const { me, org, actor } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try { await client.auth.logout(); } finally { setBusy(false); setConfirming(false); qc.clear(); router.replace("/sign-in"); }
  };
  return (
    <>
      <Popover
        align="right"
        trigger={({ open, toggle, ref, id }) => (
          <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Account: ${me.user.displayName}`} className={IconBtn}>
            <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-ink-15 text-label">{me.user.displayName.trim()[0]?.toUpperCase() ?? "?"}</span>
          </button>
        )}
      >
        {(close) => (
          <div className="w-72 p-3 text-body">
            <p className="font-medium">{me.user.displayName}</p>
            <p className="text-muted">{me.user.email ?? "Wallet account"} · {me.user.authMethod === "wallet" ? "Wallet sign-in" : "Email sign-in"}</p>
            <p className="mt-2 text-muted">Acting under <span className="font-medium text-ink">{org.name}</span> as {roleLabels(actor).join(", ")}</p>
            <div className="mt-3 flex gap-2">
              <Link href="/settings" onClick={close} className="flex h-9 items-center rounded-btn bg-ink-5 px-3 font-medium hover:bg-ink-10">Settings</Link>
              <Button onClick={() => { close(); setConfirming(true); }}>Sign out</Button>
            </div>
          </div>
        )}
      </Popover>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Sign out of Tobin?" description="You will need to sign in again to use this app. Your records are kept." primary={{ label: "Sign out", onClick: signOut, loading: busy }} />
    </>
  );
}

function SearchButton() {
  const router = useRouter();
  const { org } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); } };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tobin-open-search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("tobin-open-search", onOpen); };
  }, []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search (Ctrl or Cmd plus K)" className={`${IconBtn} max-sm:hidden`}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5"><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <span className="hidden text-muted xl:inline">Search</span>
      </button>
      <CommandPanel
        open={open}
        onClose={() => setOpen(false)}
        commands={[
          ...[...NAV, APPROVALS].map((n) => ({ id: n.href, label: n.label, group: "Go to", onSelect: () => router.push(n.href) })),
          // only the sessions this browser has already loaded: there is no backend search
          ...((qc.getQueryData<{ sessionId: string; label: string }[]>(["sessions", org.id]) ?? []).slice(0, 50).map((x) => ({ id: `s-${x.sessionId}`, label: x.label, group: "Loaded sessions", onSelect: () => router.push(`/sessions/${x.sessionId}`) }))),
        ]}
        notice={<><span className="font-medium text-ink">Searches loaded sessions only.</span> This panel jumps between pages and to sessions this browser has already loaded. It is not a search of the organization: the backend has no search, so obligations, settlements, transactions and activity cannot be searched.</>}
      />
    </>
  );
}

function BottomNav({ active }: { active: string }) {
  const items = [NAV[0]!, NAV[1]!, APPROVALS, NAV[4]!];
  const more = [NAV[2]!, NAV[3]!, NAV[5]!, NAV[6]!];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch bg-page shadow-[0_-1px_0_var(--color-divider)] md:hidden">
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined} className={cn("flex flex-1 items-center justify-center text-body font-medium", active === n.href ? "text-ink" : "text-muted")}>{n.label === "Clearing Sessions" ? "Sessions" : n.label}</Link>
      ))}
      <div className="flex flex-1 items-stretch justify-center">
        <Popover
          align="right"
          panelClassName="bottom-full top-auto mb-2 mt-0"
          trigger={({ open, toggle, ref, id }) => <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={id} className={cn("flex h-full flex-1 items-center justify-center px-4 text-body font-medium", more.some((m) => m.href === active) ? "text-ink" : "text-muted")}>More</button>}
        >
          {(close) => <ul><li><button type="button" onClick={() => { close(); window.dispatchEvent(new Event("tobin-open-search")); }} className="flex h-11 w-full items-center rounded-btn px-3 text-left text-body font-medium hover:bg-ink-5">Search loaded sessions</button></li><li><Link href="/notifications" onClick={close} className="flex h-11 items-center rounded-btn px-3 text-body font-medium text-muted hover:bg-ink-5">Notifications (not supported)</Link></li>{more.map((m) => <li key={m.href}><Link href={m.href} onClick={close} className="flex h-11 items-center rounded-btn px-3 text-body font-medium hover:bg-ink-5">{m.label}</Link></li>)}</ul>}
        </Popover>
      </div>
    </nav>
  );
}

/** Two header rows (global bar, then the seven underline tabs), a pinned environment indicator, and a bottom bar under 768px. */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = activeOf(path);
  const pending = useApprovalsPending();
  const navItems: TabItem[] = NAV.map((n) => (n.href === "/sessions" && pending.count ? { ...n, count: pending.count, countLabel: `approval${pending.count === 1 ? "" : "s"} awaiting your review (derived from up to 10 sessions)` } : n));
  return (
    <div className="flex min-h-dvh flex-col">
      {SAMPLE_DATA ? <SampleDataBanner /> : null}
      <header className="sticky top-0 z-20 bg-page">
        <div className="border-b border-divider">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 sm:px-6">
            <Link href="/" aria-label="Tobin home" className="flex shrink-0 items-center rounded-btn max-md:min-h-11 max-md:min-w-11 max-md:justify-center"><Wordmark /></Link>
            <div className="ml-1 min-w-0 flex-1 sm:flex-none"><OrgSelector /></div>
            <div className="ml-auto flex items-center gap-2">
              <EnvIndicator />
              <WalletCell />
              <span className="hidden sm:block"><Bell /></span>
              <SearchButton />
              <AccountMenu />
            </div>
          </div>
        </div>
        <div className="hidden border-b border-divider md:block">
          <div className="mx-auto max-w-[1200px] px-6"><PageTabs items={navItems} activeHref={active} label="Primary" /></div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <BottomNav active={active} />
    </div>
  );
}
