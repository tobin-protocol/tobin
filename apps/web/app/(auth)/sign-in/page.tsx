"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/kit/button";
import { AuthArt } from "../../../components/auth/AuthArt.tsx";
import { useConnectWallet } from "../../../components/auth/ConnectWallet.tsx";
import { BrandMark, Wordmark } from "../../../components/shell/BrandMark.tsx";
import { useMe } from "../../../components/shell/session.tsx";
import { Icon } from "../../../components/tobin/Icon.tsx";
import { SegmentTabs } from "../../../components/ui/Data.tsx";
import { InlineError } from "../../../components/ui/Feedback.tsx";
import { TextField } from "../../../components/ui/Form.tsx";
import { safeNext } from "../../../lib/access/decide.ts";
import { emailRegister, emailSignIn, zodResolver, type EmailRegister, type EmailSignIn } from "../../../lib/schemas.ts";
import { client } from "../../../lib/tobin/index.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 2 for email: the backend signs in with an email and a password, so after the address a visitor gives a password (or creates the account). */
function Credentials({ email, onBack, onDone }: { email: string; onBack: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const login = useForm<EmailSignIn>({ resolver: zodResolver(emailSignIn), defaultValues: { email, password: "" } });
  const register = useForm<EmailRegister>({ resolver: zodResolver(emailRegister), defaultValues: { displayName: "", email, password: "" } });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Sign-in failed.");
  return (
    <div className="space-y-4">
      <p className="flex items-center justify-between gap-3 border border-divider px-3 py-2 text-body"><span className="min-w-0 truncate">{email}</span><button type="button" onClick={onBack} className="inline-flex min-h-11 shrink-0 items-center underline underline-offset-4">Change</button></p>
      <SegmentTabs label="Sign in or create account" value={mode} onChange={(m) => { setMode(m); setError(null); }} items={[{ value: "login", label: "I have an account" }, { value: "register", label: "Create account" }]} />
      {mode === "login" ? (
        <form className="space-y-3" noValidate onSubmit={login.handleSubmit(async (v) => { setError(null); try { await client.auth.login(v.email, v.password); onDone(); } catch (e) { fail(e); } })}>
          <input type="hidden" {...login.register("email")} />
          <TextField id="login-password" label="Password" type="password" autoComplete="current-password" error={login.formState.errors.password?.message} {...login.register("password")} />
          {error ? <InlineError>{error}</InlineError> : null}
          <Button type="submit" size="lg" className="w-full" disabled={login.formState.isSubmitting}>Log in</Button>
        </form>
      ) : (
        <form className="space-y-3" noValidate onSubmit={register.handleSubmit(async (v) => { setError(null); try { await client.auth.register(v.email, v.password, v.displayName); onDone(); } catch (e) { fail(e); } })}>
          <input type="hidden" {...register.register("email")} />
          <TextField id="reg-name" label="Your name" autoComplete="name" error={register.formState.errors.displayName?.message} {...register.register("displayName")} />
          <TextField id="reg-password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." error={register.formState.errors.password?.message} {...register.register("password")} />
          {error ? <InlineError>{error}</InlineError> : null}
          <Button type="submit" size="lg" className="w-full" disabled={register.formState.isSubmitting}>Create account</Button>
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
  const wallet = useConnectWallet();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "credentials">("email");
  const next = safeNext(params.get("next")) ?? "/";
  useEffect(() => { if (me.data) router.replace(next); }, [me.data, next, router]);
  const done = async () => { await qc.invalidateQueries({ queryKey: ["me"] }); router.replace(next); };
  const valid = EMAIL.test(email.trim());

  return (
    <div className="grid min-h-dvh min-[900px]:grid-cols-2">
      <div className="relative hidden min-[900px]:block" aria-hidden="true">
        <div className="absolute inset-0"><AuthArt /></div>
        <div className="absolute left-8 top-6"><Link href="/discover" tabIndex={-1} className="flex items-center gap-2.5 text-white"><span className="flex size-8 items-center justify-center bg-white text-black"><BrandMark className="size-[18px]" /></span><span className="text-[18px] font-medium">Tobin</span></Link></div>
      </div>
      <div className="relative flex flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/discover" aria-label="Tobin home" className="flex min-h-11 min-w-11 items-center min-[900px]:invisible"><Wordmark /></Link>
          <Link href="/discover" aria-label="Close and return to Discover" className="flex size-11 items-center justify-center hover:bg-tile"><Icon icon={Cancel01Icon} size={24} /></Link>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 pb-10 outline-none sm:px-8">
          <div className="w-full max-w-[400px]">
            <h1 className="text-title font-medium">Sign up or sign in</h1>
            <p className="mt-2 text-body text-muted">Use an email address and password, or connect a Stellar wallet. Tobin never asks for a seed phrase or a private key.</p>
            {params.get("expired") ? <p role="status" className="mt-4 bg-tile p-3 text-body">Your session expired. Sign in again to continue.</p> : null}

            <div className="mt-6 space-y-4">
              {step === "email" ? (
                <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) setStep("credentials"); }}>
                  <TextField id="auth-email" label="Email address" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Button type="submit" size="lg" className="w-full" disabled={!valid}>Continue</Button>
                </form>
              ) : (
                <Credentials email={email.trim()} onBack={() => setStep("email")} onDone={done} />
              )}
              <div className="flex items-center gap-3 text-label uppercase tracking-wider text-muted" role="separator" aria-label="Or"><span className="h-px flex-1 bg-divider" /><span aria-hidden="true">Or</span><span className="h-px flex-1 bg-divider" /></div>
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={wallet.open}>Continue with wallet</Button>
            </div>

            <p className="mt-8 text-label text-muted">Experimental Stellar Testnet application. Test assets only; nothing here moves real funds, and it has not been audited. A new wallet creates a new account.</p>
            <p className="mt-2 text-label text-muted">Need help? <a href="https://docs.tobinprotocol.xyz" target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center underline underline-offset-4">Read the documentation<span className="sr-only"> (opens in a new tab)</span></a></p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return <Suspense fallback={<div className="h-dvh animate-pulse bg-tile" aria-busy="true" />}><SignInInner /></Suspense>;
}
