"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HelpCircleIcon, Logout01Icon, NotificationOff01Icon, Search01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/kit/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/kit/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/kit/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/kit/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/kit/popover";
import { cn } from "@/lib/utils";
import { client } from "../../../lib/tobin/index.ts";
import { middle } from "../../../lib/format.ts";
import { roleLabels } from "../../../lib/permissions/can.ts";
import { Icon } from "../../tobin/Icon.tsx";
import { useWallet } from "../../wallet/WalletProvider.tsx";
import { NAV } from "../nav.ts";
import { useWorkspace } from "../session.tsx";

/** 40px (44px under 768px) square control used across the top bar. */
export const BAR_BTN = "flex min-h-10 min-w-10 items-center justify-center gap-2 border border-transparent px-2.5 text-body font-medium uppercase tracking-wide hover:bg-tile max-md:min-h-11 max-md:min-w-11 aria-expanded:bg-tile";

/** The active network. Always Stellar Testnet. */
export function EnvironmentButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={BAR_BTN} title="Active network">
          <span aria-hidden="true" className="size-2 bg-ink" />
          <span className="whitespace-nowrap font-label text-label"><span className="sm:hidden">Testnet</span><span className="hidden sm:inline">Stellar Testnet</span></span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-body">
        <p className="font-medium">Stellar Testnet</p>
        <p className="mt-1 text-muted">Tobin runs on Stellar Testnet only, with test assets. Nothing in this app moves real funds, and there is no Mainnet state.</p>
      </PopoverContent>
    </Popover>
  );
}

/** Connected and verified are two different facts and are shown as two rows. */
export function WalletCell() {
  const { me } = useWorkspace();
  const { wallet, connect, refresh } = useWallet();
  const address = "address" in wallet ? wallet.address : null;
  const verified = !!address && (me.wallets ?? []).some((w) => w.publicKey === address);
  const state = wallet.kind === "DETECTING" ? "Checking" : wallet.kind === "READY" ? (verified ? "Connected, verified" : "Connected, not verified") : wallet.kind === "WRONG_NETWORK" ? "Wrong network" : wallet.kind === "NOT_ALLOWED" ? "Not connected" : "Freighter not found";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Wallet: ${state}`} className={BAR_BTN}>
          <span aria-hidden="true" className="flex size-6 items-center justify-center bg-ink-10 text-label">{address ? address[0] : "·"}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block font-mono text-ident normal-case">{address ? middle(address, 4, 4) : "No wallet"}</span>
            <span className="block font-label text-label normal-case text-muted">{state}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-body">
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => connect()}>Connect Freighter</Button>
          <Button size="sm" variant="outline" onClick={() => refresh()}>Check again</Button>
        </div>
        <Link href="/wallets" className="mt-3 inline-flex min-h-11 items-center text-body underline underline-offset-4">Manage wallets</Link>
      </PopoverContent>
    </Popover>
  );
}

/** Not supported: the backend has no notifications. A muted bell that leads to the explanation, with no badge, no count and no items. */
export function NotificationsLink() {
  return (
    <Link href="/notifications" aria-label="Notifications: not supported" title="Notifications are not supported" className={cn(BAR_BTN, "text-muted")}>
      <Icon icon={NotificationOff01Icon} size={20} />
    </Link>
  );
}

export function HelpLink() {
  return (
    <a href="https://docs.tobinprotocol.xyz" target="_blank" rel="noreferrer noopener" aria-label="Help: documentation (opens in a new tab)" className={cn(BAR_BTN, "max-sm:hidden")}>
      <Icon icon={HelpCircleIcon} size={20} />
    </a>
  );
}

export function AccountMenu() {
  const { me, org, actor } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try { await client.auth.logout(); } finally { setBusy(false); setConfirming(false); qc.clear(); router.replace("/discover"); }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Account: ${me.user.displayName}`} className={BAR_BTN}>
            <span aria-hidden="true" className="flex size-6 items-center justify-center bg-ink text-label text-on-button">{me.user.displayName.trim()[0]?.toUpperCase() ?? "?"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="normal-case">
            <span className="block text-body font-medium text-ink">{me.user.displayName}</span>
            <span className="block text-label font-normal text-muted">{me.user.email ?? "Wallet account"} · {me.user.authMethod === "wallet" ? "Wallet sign-in" : "Email sign-in"}</span>
            <span className="mt-1 block text-label font-normal text-muted">Acting under {org.name} as {roleLabels(actor).join(", ")}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" onSelect={() => router.push("/settings")}><Icon icon={UserIcon} size={16} />Settings</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => setConfirming(true)}><Icon icon={Logout01Icon} size={16} />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of Tobin?</DialogTitle>
            <DialogDescription>You will need to sign in again to use this app. Your records are kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button onClick={signOut} disabled={busy}>{busy ? "Signing out" : "Sign out"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Ctrl or Cmd plus K. Jumps between pages and to sessions this browser has already loaded; the backend has no search, and the panel says so. */
export function SearchCommand() {
  const router = useRouter();
  const { org } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (href: string) => { setOpen(false); router.push(href); };
  const sessions = (qc.getQueryData<{ sessionId: string; label: string }[]>(["sessions", org.id]) ?? []).slice(0, 300);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search (Ctrl or Cmd plus K)" className={cn(BAR_BTN, "max-sm:hidden")}>
        <Icon icon={Search01Icon} size={20} />
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump to a page or to a session already loaded in this browser.">
        <Command>
          <CommandInput placeholder="Go to a page or a loaded session" />
          <p className="border-b border-divider px-3 py-2 text-label text-muted"><span className="font-medium text-ink">Searches loaded sessions only.</span> The backend has no search, so obligations, settlements, transactions and activity cannot be searched.</p>
          <CommandList>
            <CommandEmpty>Nothing matches. Only pages and already-loaded sessions are searched.</CommandEmpty>
            <CommandGroup heading="Go to">
              {NAV.map((n) => <CommandItem key={n.id} value={n.label} onSelect={() => go(n.href)}>{n.label}</CommandItem>)}
            </CommandGroup>
            {sessions.length ? (
              <CommandGroup heading="Loaded sessions">
                {sessions.map((s) => <CommandItem key={s.sessionId} value={`session ${s.label}`} onSelect={() => go(`/sessions/${s.sessionId}`)}>{s.label}</CommandItem>)}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

