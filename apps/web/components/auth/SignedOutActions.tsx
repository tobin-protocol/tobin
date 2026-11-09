"use client";

import Link from "next/link";
import { Button } from "@/components/kit/button";
import { useConnectWallet } from "./ConnectWallet.tsx";

/**
 * The two entry points for a signed-out visitor. SIGN UP / LOG IN is primary and opens the full sign-in page; CONNECT WALLET is secondary and opens the wallet dialog.
 * `stacked` is the sidebar footer, otherwise the top bar's row.
 */
export function SignedOutActions({ stacked, onNavigate }: { stacked?: boolean; onNavigate?: () => void }) {
  const wallet = useConnectWallet();
  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-1.5"}>
      <Button variant="outline" size={stacked ? "lg" : "default"} className={stacked ? "w-full" : "px-3 max-sm:px-2"} onClick={() => { onNavigate?.(); wallet.open(); }}>Connect wallet</Button>
      <Button asChild size={stacked ? "lg" : "default"} className={stacked ? "w-full" : "px-3 max-sm:px-2"}><Link href="/sign-in" onClick={onNavigate}>Sign up / Log in</Link></Button>
    </div>
  );
}
