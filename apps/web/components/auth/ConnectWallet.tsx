"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/kit/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/kit/dialog";
import { Input } from "@/components/kit/input";
import { safeNext } from "../../lib/access/decide.ts";
import { WALLET_REGISTRY, filterWallets, orderWallets, readLastWallet, rememberWallet, showSearch, type WalletRow } from "../../lib/wallet/registry.ts";
import { useWallet } from "../wallet/WalletProvider.tsx";
import { WalletSignInFlow } from "./WalletSignInFlow.tsx";

interface Ctx { open: () => void }
const ConnectContext = createContext<Ctx | null>(null);
/** Opens the connect-wallet dialog from anywhere: the top bar, the sidebar footer, the sign-in page. */
export function useConnectWallet(): Ctx {
  const c = useContext(ConnectContext);
  if (!c) throw new Error("useConnectWallet must be used inside ConnectWalletProvider");
  return c;
}

function Labels({ row }: { row: WalletRow }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {row.installed === "checking" ? <span className="border border-divider px-2 font-label text-label uppercase tracking-wider text-muted">Checking</span> : null}
      {row.labels.map((l) => <span key={l} className={`px-2 font-label text-label uppercase tracking-wider ${l === "NOT INSTALLED" ? "border border-divider text-muted" : "bg-tile"}`}>{l}</span>)}
    </span>
  );
}

/** Mounted only while the dialog is open, so its state starts fresh each time. */
function DialogBody({ close }: { close: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { wallet, refresh } = useWallet();
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [last] = useState<string | null>(() => readLastWallet());
  useEffect(() => { void refresh(); }, [refresh]);

  const installed = useMemo(() => ({ freighter: wallet.kind === "DETECTING" ? ("checking" as const) : wallet.kind !== "UNAVAILABLE" }), [wallet.kind]);
  const rows = useMemo(() => orderWallets(WALLET_REGISTRY, installed, last), [installed, last]);
  const visible = filterWallets(rows, query);
  const entry = chosen ? WALLET_REGISTRY.find((w) => w.id === chosen) : undefined;

  const done = async () => {
    if (chosen) rememberWallet(chosen);
    await qc.invalidateQueries({ queryKey: ["me"] });
    close();
    router.replace(safeNext(new URLSearchParams(window.location.search).get("next")) ?? "/");
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{entry ? `Connect ${entry.name}` : "Connect wallet"}</DialogTitle>
        <DialogDescription>{entry ? "Connect, then verify that you control the account." : "Choose a wallet. Installed wallets come first."}</DialogDescription>
      </DialogHeader>
      {entry ? (
        <div className="space-y-3">
          <WalletSignInFlow walletName={entry.name} onDone={done} />
          <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>Back to wallets</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {showSearch(rows.length) ? <Input aria-label="Search wallets" placeholder="Search wallets" value={query} onChange={(e) => setQuery(e.target.value)} /> : null}
          <ul className="space-y-2" aria-label="Wallets">
            {visible.map((r) => (
              <li key={r.entry.id} className="flex flex-wrap items-center justify-between gap-3 bg-tile px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-body font-medium">{r.entry.name}</span>
                  <Labels row={r} />
                </span>
                {r.installed === false ? (
                  <Button asChild variant="outline" size="sm"><a href={r.entry.installUrl} target="_blank" rel="noreferrer noopener">Install<span className="sr-only"> {r.entry.name} (opens in a new tab)</span></a></Button>
                ) : (
                  <Button size="sm" onClick={() => setChosen(r.entry.id)} disabled={r.installed === "checking"}>Connect</Button>
                )}
              </li>
            ))}
            {visible.length === 0 ? <li className="bg-tile px-4 py-3 text-body text-muted">No wallet matches.</li> : null}
          </ul>
          {rows.some((r) => r.entry.desktopExtension) ? <p className="text-label text-muted">Freighter is a desktop browser extension. It does not run in a phone browser, so connect from a desktop browser with the extension installed.</p> : null}
          <p className="text-label text-muted">Only wallets Tobin can sign in with are listed. Tobin never asks for a seed phrase or a private key.</p>
        </div>
      )}
    </>
  );
}

function WalletDialog({ open, onOpenChange, opener }: { open: boolean; onOpenChange: (o: boolean) => void; opener: RefObject<HTMLElement | null> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* opened from context, not a trigger, so focus is returned by hand to whatever opened it */}
      <DialogContent className="max-w-md" onCloseAutoFocus={(e) => { if (opener.current?.isConnected) { e.preventDefault(); opener.current.focus(); } }}>
        <DialogBody close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ConnectWalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const openFn = useCallback(() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true); }, []);
  const value = useMemo(() => ({ open: openFn }), [openFn]);
  return (
    <ConnectContext.Provider value={value}>
      {children}
      <WalletDialog open={open} onOpenChange={setOpen} opener={opener} />
    </ConnectContext.Provider>
  );
}
