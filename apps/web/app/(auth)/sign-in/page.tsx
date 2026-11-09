"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../../components/ui/Button.tsx";
import { CrossIcon, InlineError } from "../../../components/ui/Feedback.tsx";
import { TextField } from "../../../components/ui/Form.tsx";
import { SegmentTabs } from "../../../components/ui/Data.tsx";
import { useWallet } from "../../../components/wallet/WalletProvider.tsx";
import { useMe } from "../../../components/shell/session.tsx";
import { emailRegister, emailSignIn, zodResolver, type EmailRegister, type EmailSignIn } from "../../../lib/schemas.ts";
import { safeNext } from "../../../lib/access/decide.ts";
import { client } from "../../../lib/tobin/index.ts";
import { runWalletSignIn, type SignInState } from "../../../lib/wallet/signin.ts";

type Method = "wallet" | "email";

const WALLET_STEP: Partial<Record<SignInState, 1 | 2>> = {
  detecting: 1, connecting: 1, unavailable: 1, locked: 1, "wrong-network": 1, rejected: 1,
  "requesting-challenge": 2, "awaiting-approval": 2, verifying: 2, expired: 2, failed: 2, "rate-limited": 2, "account-changed": 2, authenticated: 2,
};
const FAILURES: SignInState[] = ["unavailable", "locked", "wrong-network", "rejected", "expired", "failed", "rate-limited", "account-changed"];
const TITLES: Partial<Record<SignInState, string>> = {
  unavailable: "Freighter not found", locked: "Freighter is locked or has no access", "wrong-network": "Wrong network", rejected: "Declined in Freighter",
  expired: "Challenge expired", failed: "Sign-in failed", "rate-limited": "Too many attempts", "account-changed": "Different account",
};

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-3 text-body" aria-label="Sign-in steps">
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

function WalletSignIn({ onDone }: { onDone: () => void }) {
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
      <div className="rounded-card bg-card p-4">
        <p className="text-body text-muted">You sign a one-time message with Freighter. It signs no transaction, moves no funds and grants no role. Tobin never asks for a seed phrase or a private key.</p>
      </div>
      {failed ? (
        <div className="rounded-card bg-card p-4" role="alert">
          <p className="flex items-center gap-2 text-body font-medium text-danger"><CrossIcon />{TITLES[state]}</p>
          <p className="mt-1.5 text-body">{detail}</p>
        </div>
      ) : busy || state === "authenticated" ? <p className="text-body text-muted" role="status" aria-live="polite">{detail}</p> : null}
      <Button variant="primary" size="lg" onClick={start} loading={busy} disabled={state === "authenticated"}>{failed ? "Try again" : "Sign in with wallet"}</Button>
      <p className="text-label text-muted">The signed message names the Tobin console as the domain, because this app forwards your request to it. It is a single-use challenge that expires in five minutes.</p>
    </div>
  );
}

function EmailSignIn({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const login = useForm<EmailSignIn>({ resolver: zodResolver(emailSignIn), defaultValues: { email: "", password: "" } });
  const register = useForm<EmailRegister>({ resolver: zodResolver(emailRegister), defaultValues: { displayName: "", email: "", password: "" } });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Sign-in failed.");
  return (
    <div className="space-y-4">
      <SegmentTabs label="Sign in or create account" value={mode} onChange={(m) => { setMode(m); setError(null); }} items={[{ value: "login", label: "Sign in" }, { value: "register", label: "Create account" }]} />
      {mode === "login" ? (
        <form className="space-y-3" noValidate onSubmit={login.handleSubmit(async (v) => { setError(null); try { await client.auth.login(v.email, v.password); onDone(); } catch (e) { fail(e); } })}>
          <TextField id="login-email" label="Email" type="email" autoComplete="email" error={login.formState.errors.email?.message} {...login.register("email")} />
          <TextField id="login-password" label="Password" type="password" autoComplete="current-password" error={login.formState.errors.password?.message} {...login.register("password")} />
          {error ? <InlineError>{error}</InlineError> : null}
          <Button type="submit" variant="primary" size="lg" loading={login.formState.isSubmitting}>Sign in</Button>
        </form>
      ) : (
        <form className="space-y-3" noValidate onSubmit={register.handleSubmit(async (v) => { setError(null); try { await client.auth.register(v.email, v.password, v.displayName); onDone(); } catch (e) { fail(e); } })}>
          <TextField id="reg-name" label="Your name" autoComplete="name" error={register.formState.errors.displayName?.message} {...register.register("displayName")} />
          <TextField id="reg-email" label="Email" type="email" autoComplete="email" error={register.formState.errors.email?.message} {...register.register("email")} />
          <TextField id="reg-password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." error={register.formState.errors.password?.message} {...register.register("password")} />
          {error ? <InlineError>{error}</InlineError> : null}
          <Button type="submit" variant="primary" size="lg" loading={register.formState.isSubmitting}>Create account</Button>
        </form>
      )}
    </div>
  );
}

function SignInInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const me = useMe();
  const [method, setMethod] = useState<Method>("wallet");
  const next = safeNext(params.get("next")) ?? "/";
  useEffect(() => { if (me.data) router.replace(next); }, [me.data, next, router]);
  const done = async () => { await qc.invalidateQueries({ queryKey: ["me"] }); router.replace(next); };
  return (
    <div className="w-full max-w-[440px] border border-divider bg-page p-6">
      <h1 className="text-title font-medium">Sign in to Tobin</h1>
      <p className="mt-1 text-body text-muted">Institutional clearing and settlement on Stellar Testnet.</p>
      {params.get("expired") ? <p role="status" className="mt-4 rounded-card bg-card p-3 text-body">Your session expired. Sign in again to continue.</p> : null}
      <div className="mt-5"><SegmentTabs label="Sign-in method" value={method} onChange={setMethod} items={[{ value: "wallet", label: "Wallet" }, { value: "email", label: "Email" }]} /></div>
      <div className="mt-5">{method === "wallet" ? <WalletSignIn onDone={done} /> : <EmailSignIn onDone={done} />}</div>
      <p className="mt-6 border-t border-divider pt-4 text-body"><Link href="/discover" className="inline-flex min-h-11 items-center underline underline-offset-4">Back to Discover</Link></p>
    </div>
  );
}

export default function SignInPage() {
  return <Suspense fallback={<div className="h-64 w-full max-w-[440px] animate-pulse border border-divider bg-tile" aria-busy="true" />}><SignInInner /></Suspense>;
}
