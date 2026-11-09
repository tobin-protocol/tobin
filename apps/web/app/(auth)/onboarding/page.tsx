"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AuthFrame } from "../../../components/auth/AuthFrame.tsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "../../../components/ui/Button.tsx";
import { ErrorState, InlineError, Skeleton } from "../../../components/ui/Feedback.tsx";
import { ChoiceGroup, SelectField, TextAreaField, TextField } from "../../../components/ui/Form.tsx";
import { StatGrid } from "../../../components/ui/Surfaces.tsx";
import { useMe } from "../../../components/shell/session.tsx";
import { ApiError } from "../../../lib/api/http.ts";
import { INSTITUTION_LABEL } from "../../../lib/format.ts";
import { invitationForm, organizationForm, profileForm, zodResolver, type InvitationForm, type OrganizationForm, type ProfileForm } from "../../../lib/schemas.ts";
import { client } from "../../../lib/tobin/index.ts";
import { INSTITUTION_TYPES } from "../../../lib/tobin/types.ts";

function ProfileStep({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const f = useForm<ProfileForm>({ resolver: zodResolver(profileForm), defaultValues: { displayName: "" } });
  return (
    <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setError(null); try { await client.auth.setProfile(v.displayName); onDone(); } catch (e) { setError((e as Error).message); } })}>
      <h1 className="text-title font-medium">What should we call you?</h1>
      <p className="text-body text-muted">Your name appears next to your actions in the activity history. It is not a legal identity check.</p>
      <TextField id="profile-name" label="Your name" autoComplete="name" error={f.formState.errors.displayName?.message} {...f.register("displayName")} />
      {error ? <InlineError>{error}</InlineError> : null}
      <Button type="submit" variant="primary" size="lg" loading={f.formState.isSubmitting}>Continue</Button>
    </form>
  );
}

function CreateOrganization({ onDone, onBack }: { onDone: (orgId: string) => Promise<void>; onBack: () => void }) {
  const [step, setStep] = useState<"details" | "review">("details");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = useForm<OrganizationForm>({ resolver: zodResolver(organizationForm), defaultValues: { name: "", description: "", institutionType: "bank", jurisdiction: "", visibility: "private" } });
  const v = useWatch({ control: f.control }) as OrganizationForm;
  const create = async () => {
    setBusy(true); setError(null);
    try {
      const parsed = organizationForm.parse(f.getValues());
      const org = await client.organizations.create({ name: parsed.name, description: parsed.description, visibility: parsed.visibility, institutionType: parsed.institutionType, ...(parsed.jurisdiction ? { jurisdiction: parsed.jurisdiction } : {}) });
      await onDone(org.id);
    } catch (e) { setError(e instanceof ApiError ? e.message : "The organization could not be created."); setBusy(false); }
  };
  if (step === "review") {
    return (
      <div className="space-y-4">
        <h1 className="text-title font-medium">Review your organization</h1>
        <div className="rounded-card bg-card p-4">
          <StatGrid columns={2} items={[
            { label: "Name", value: v.name },
            { label: "Type", value: INSTITUTION_LABEL[v.institutionType] ?? v.institutionType },
            { label: "Jurisdiction", value: v.jurisdiction ? v.jurisdiction.toUpperCase() : "Not given" },
            { label: "Visibility", value: v.visibility === "private" ? "Private" : "Public" },
          ]} />
          {v.description ? <p className="mt-4 border-t border-divider pt-3 text-body text-muted">{v.description}</p> : null}
        </div>
        <p className="rounded-card bg-card p-3 text-body text-muted">Creating an organization makes you its administrator. It does not verify the organization legally, and it grants no authority on Stellar.</p>
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="quiet" onClick={() => setStep("details")} disabled={busy}>Back</Button>
          <Button variant="primary" onClick={create} loading={busy} className="sm:flex-1">Create organization</Button>
        </div>
      </div>
    );
  }
  return (
    <form className="space-y-4" noValidate onSubmit={f.handleSubmit(() => setStep("review"))}>
      <h1 className="text-title font-medium">Create an organization</h1>
      <TextField id="org-name" label="Organization name" autoComplete="organization" error={f.formState.errors.name?.message} {...f.register("name")} />
      <SelectField id="org-type" label="Organization type" error={f.formState.errors.institutionType?.message} {...f.register("institutionType")}>
        {INSTITUTION_TYPES.map((t) => <option key={t} value={t}>{INSTITUTION_LABEL[t]}</option>)}
      </SelectField>
      <TextField id="org-jur" label="Country or jurisdiction (optional)" placeholder="GB" maxLength={2} hint="A two-letter country code." error={f.formState.errors.jurisdiction?.message} {...f.register("jurisdiction")} />
      <TextAreaField id="org-desc" label="Description (optional)" error={f.formState.errors.description?.message} {...f.register("description")} />
      <ChoiceGroup legend="Visibility" name="visibility" value={v.visibility} onChange={(x) => f.setValue("visibility", x as "private" | "public")} options={[{ value: "private", label: "Private", hint: "Only members can see it." }, { value: "public", label: "Public", hint: "Visible to other Tobin users." }]} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="quiet" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" className="sm:flex-1">Review</Button>
      </div>
    </form>
  );
}

function JoinOrganization({ onDone, onBack }: { onDone: (orgId: string) => Promise<void>; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const f = useForm<InvitationForm>({ resolver: zodResolver(invitationForm), defaultValues: { token: "" } });
  return (
    <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setError(null); try { const r = await client.organizations.acceptInvitation(v.token); await onDone(r.orgId); } catch (e) { setError(e instanceof ApiError && e.code === "INVALID_INVITATION" ? "That code is not valid, has expired, or was already used." : (e as Error).message); } })}>
      <h1 className="text-title font-medium">Join with an invitation</h1>
      <p className="text-body text-muted">An administrator gives you a one-time code. Tobin sends no email: no delivery provider is configured, so the code is passed to you directly.</p>
      <TextField id="invite-token" label="One-time invitation code" autoComplete="off" spellCheck={false} error={f.formState.errors.token?.message} {...f.register("token")} />
      {error ? <InlineError>{error}</InlineError> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="quiet" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" loading={f.formState.isSubmitting} className="sm:flex-1">Accept invitation</Button>
      </div>
    </form>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace("/sign-in");
    else if (me.data?.onboarding?.step === "done" && (me.data.organizations?.length ?? 0) > 0) router.replace("/");
  }, [me.data, me.error, router]);

  const enter = async (orgId: string) => { await client.auth.setWorkspace(orgId); await qc.invalidateQueries({ queryKey: ["me"] }); router.replace("/"); };
  const profileDone = async () => { await qc.invalidateQueries({ queryKey: ["me"] }); };

  return (
    <AuthFrame><div className="w-full max-w-[440px] border border-divider bg-page p-6 sm:p-8">
      {me.isLoading ? <div className="space-y-3" aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full" /></div>
        : me.error && !(me.error instanceof ApiError && me.error.status === 401) ? <ErrorState title="Could not load your account" message={(me.error as Error).message} retry={<Button onClick={() => me.refetch()}>Try again</Button>} />
        : me.data?.onboarding?.step === "profile" ? <ProfileStep onDone={profileDone} />
        : mode === "create" ? <CreateOrganization onDone={enter} onBack={() => setMode("choose")} />
        : mode === "join" ? <JoinOrganization onDone={enter} onBack={() => setMode("choose")} />
        : (
          <div>
            <h1 className="text-title font-medium">Set up your workspace</h1>
            <p className="mt-1 text-body text-muted">You are signed in as {me.data?.user.displayName}. Choose how to begin. You are not placed in an empty dashboard.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("create")} className="rounded-card bg-card p-5 text-left transition-colors duration-150 hover:bg-ink-5">
                <span className="block text-entity font-medium">Create an organization</span>
                <span className="mt-1 block text-body text-muted">Start a workspace for your institution. You become its administrator.</span>
              </button>
              <button type="button" onClick={() => setMode("join")} className="rounded-card bg-card p-5 text-left transition-colors duration-150 hover:bg-ink-5">
                <span className="block text-entity font-medium">Join with an invitation</span>
                <span className="mt-1 block text-body text-muted">Use the one-time code an administrator gave you.</span>
              </button>
            </div>
          </div>
        )}
    </div></AuthFrame>
  );
}
