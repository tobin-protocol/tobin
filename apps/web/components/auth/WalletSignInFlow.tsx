"use client";

import { useState } from "react";
import { Button } from "@/components/kit/button";
import { CrossIcon } from "../ui/Feedback.tsx";
import { client } from "../../lib/tobin/index.ts";
import { runWalletSignIn, type SignInState } from "../../lib/wallet/signin.ts";
import { useWallet } from "../wallet/WalletProvider.tsx";

// Unchanged flow: connect Freighter, then sign a one-time message the server issued, which the server verifies. Every outcome is a named state shown inline.
const WALLET_STEP: Partial<Record<SignInState, 1 | 2>> = {
  detecting: 1, connecting: 1, unavailable: 1, locked: 1, "wrong-network": 1, rejected: 1,
  "requesting-challenge": 2, "awaiting-approval": 2, verifying: 2, expired: 2, failed: 2, "rate-limited": 2, "account-changed": 2, authenticated: 2,
};
const FAILURES: SignInState[] = ["unavailable", "locked", "wrong-network", "rejected", "expired", "failed", "rate-limited", "account-changed"];
const TITLES: Partial<Record<SignInState, string>> = {
  unavailable: "Freighter not found", locked: "Freighter is locked or has no access", "wrong-network": "Wrong network", rejected: "Declined in Freighter",
  expired: "Challenge expired", failed: "Sign-in failed", "rate-limited": "Too many attempts", "account-changed": "Different account",
};

export function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body" aria-label="Sign-in steps">
      {["Connect wallet", "Verify ownership"].map((label, i) => {
        const n = (i + 1) as 1 | 2;
        return (
          <li key={label} aria-current={step === n ? "step" : undefined} className={step === n ? "font-medium text-ink" : n < step ? "text-ink" : "text-muted"}>
            <span aria-hidden="true" className={`mr-1.5 inline-block size-2 align-middle ${n <= step ? "bg-button" : "border border-muted"}`} />
            {n}. {label}
          </li>
        );
      })}
    </ol>
  );
}

/** The wallet path of sign-in for one wallet. `onDone` runs after the server accepted the signature. */
export function WalletSignInFlow({ walletName, onDone }: { walletName: string; onDone: () => void }) {
  const { api, refresh } = useWallet();
  const [state, setState] = useState<SignInState>("idle");
  const [detail, setDetail] = useState("");
  const busy = state === "detecting" || state === "connecting" || state === "requesting-challenge" || state === "awaiting-approval" || state === "verifying";
  const start = async () => {
    const o = await runWalletSignIn({
      api: await api(),
      challenge: (k) => client.auth.walletChallenge(k),
      verify: (id, sig) => client.auth.walletVerify(id, sig),
      onState: (s, d) => { setState(s); setDetail(d); },
    });
    setState(o.state);
    setDetail(o.detail);
    void refresh();
    if (o.state === "authenticated") onDone();
  };
  const step = WALLET_STEP[state] ?? 1;
  const failed = FAILURES.includes(state);
  return (
    <div className="space-y-4">
      <StepIndicator step={step} />
      <div className="bg-tile p-4">
        <p className="text-body text-muted">You sign a one-time message with {walletName}. It signs no transaction, moves no funds and grants no role. Tobin never asks for a seed phrase or a private key.</p>
      </div>
      {failed ? (
        <div className="border border-danger-line p-4" role="alert">
          <p className="flex items-center gap-2 text-body font-medium text-danger"><CrossIcon />{TITLES[state]}</p>
          <p className="mt-1.5 text-body">{detail}</p>
        </div>
      ) : busy || state === "authenticated" ? <p className="text-body text-muted" role="status" aria-live="polite">{detail}</p> : null}
      <Button size="lg" className="w-full" onClick={start} disabled={busy || state === "authenticated"}>{busy ? "Working" : failed ? "Try again" : `Connect ${walletName} and sign in`}</Button>
      <p className="text-label text-muted">The signed message names the Tobin console as the domain, because this app forwards your request to it. It is a single-use challenge that expires in five minutes. A new wallet creates a new account.</p>
    </div>
  );
}
