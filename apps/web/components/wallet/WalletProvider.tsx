"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { connectWallet, inspectWallet, loadFreighter, type FreighterLike, type WalletState } from "../../lib/wallet/freighter.ts";

export type WalletView = { kind: "DETECTING" } | WalletState;
interface Ctx { wallet: WalletView; api: () => Promise<FreighterLike | undefined>; refresh: () => Promise<void>; connect: () => Promise<void> }
const WalletContext = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletView>({ kind: "DETECTING" });
  const apiRef = useRef<FreighterLike | undefined>(undefined);
  const loaded = useRef(false);

  const api = useCallback(async () => {
    if (!loaded.current) { apiRef.current = await loadFreighter(); loaded.current = true; }
    return apiRef.current;
  }, []);

  const refresh = useCallback(async () => { setWallet(await inspectWallet(await api())); }, [api]);
  const connect = useCallback(async () => {
    const r = await connectWallet(await api());
    if (!r.ok) { setWallet({ kind: r.rejected ? "NOT_ALLOWED" : "UNAVAILABLE", reason: r.reason }); return; }
    await refresh();
  }, [api, refresh]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const value = useMemo(() => ({ wallet, api, refresh, connect }), [wallet, api, refresh, connect]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Ctx {
  const c = useContext(WalletContext);
  if (!c) throw new Error("useWallet must be used inside WalletProvider");
  return c;
}
