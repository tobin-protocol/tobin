"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { formatDateTime, humanizeKind } from "../../lib/format.ts";
import { PRD_ROLE_HELP, roleLabels } from "../../lib/permissions/can.ts";
import { profileForm, zodResolver, type ProfileForm } from "../../lib/schemas.ts";
import { client } from "../../lib/tobin/index.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { EmptyState, InlineError, NotSupported, Skeleton } from "../ui/Feedback.tsx";
import { SelectField, TextField } from "../ui/Form.tsx";
import { Dialog } from "../ui/Overlays.tsx";
import { Card, Panel } from "../ui/Surfaces.tsx";

/** Only options the backend supports. Groups: Account (display name, sign out everywhere, account audit) and Organization (default organization). */
export function Settings() {
  const { me, org, orgs, actor, switchOrg } = useWorkspace();
  const qc = useQueryClient();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signOutAll, setSignOutAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [defaultMsg, setDefaultMsg] = useState<string | null>(null);
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => client.auth.audit(), retry: false });
  const f = useForm<ProfileForm>({ resolver: zodResolver(profileForm), values: { displayName: me.user.displayName } });

  const leave = async () => {
    setBusy(true);
    try { await client.auth.logoutAll(); qc.clear(); router.replace("/sign-in"); } catch (e) { setError(reasonOf(e)); setSignOutAll(false); setBusy(false); }
  };

  return (
    <PageFrame title="Settings" breadcrumbs={[{ label: org.name }, { label: "Settings" }]}>
      <Panel className="space-y-6">
        <section aria-labelledby="acct-h" className="space-y-4">
          <h2 id="acct-h" className="px-1 text-entity font-medium">Account</h2>
          <Card>
            <h3 className="text-body font-medium">Display name</h3>
            <p className="mt-1 text-body text-muted">Shown next to your actions in the activity history. It is not a legal identity check.</p>
            <form className="mt-3 space-y-3" noValidate onSubmit={f.handleSubmit(async (v) => { setError(null); setSaved(false); try { await client.auth.setProfile(v.displayName); setSaved(true); await qc.invalidateQueries({ queryKey: ["me"] }); } catch (e) { setError(reasonOf(e)); } })}>
              <TextField id="set-name" label="Your name" autoComplete="name" error={f.formState.errors.displayName?.message} {...f.register("displayName")} />
              {error ? <InlineError>{error}</InlineError> : null}
              {saved ? <p role="status" className="text-body text-muted">Saved.</p> : null}
              <Button type="submit" variant="primary" loading={f.formState.isSubmitting} disabled={!f.formState.isDirty}>Save name</Button>
            </form>
          </Card>
          <Card>
            <h3 className="text-body font-medium">Sessions</h3>
            <p className="mt-1 text-body text-muted">You can end every session of your account at once, including this one. Signed in with {me.user.authMethod === "wallet" ? "a wallet" : "email and password"}.</p>
            <div className="mt-3"><Button variant="destructive" onClick={() => setSignOutAll(true)}>Sign out everywhere</Button></div>
            <div className="mt-3"><NotSupported tone="panel" feature="List of active sessions and revoking one" reason="The backend keeps no list of sessions you can see. Signing out everywhere is the only control." /></div>
          </Card>
          <Card>
            <h3 className="text-body font-medium">Account activity</h3>
            <p className="mt-1 text-body text-muted">Security events recorded for your account. Read-only.</p>
            <div className="mt-3">
              {audit.isLoading ? <Skeleton lines={3} /> : audit.error ? <InlineError>{(audit.error as Error).message}</InlineError> : (audit.data ?? []).length === 0 ? <EmptyState title="No events" message="No account events are recorded." /> : (
                <ul className="divide-y divide-divider">{[...audit.data!].reverse().slice(0, 15).map((e, i) => <li key={i} className="py-2.5"><span className="block text-body font-medium">{humanizeKind(e.kind)}</span><span className="block text-label text-muted">{formatDateTime(e.at)}</span></li>)}</ul>
              )}
            </div>
          </Card>
        </section>

        <section aria-labelledby="org-h" className="space-y-4">
          <h2 id="org-h" className="px-1 text-entity font-medium">Organization</h2>
          <Card>
            <h3 className="text-body font-medium">Default organization</h3>
            <p className="mt-1 text-body text-muted">The organization you land in after signing in. Everything in the app is scoped to the organization you are acting under.</p>
            <div className="mt-3 max-w-sm">
              <SelectField id="set-org" label="Organization" value={org.id} onChange={async (e) => { setDefaultMsg(null); try { await switchOrg(e.target.value); setDefaultMsg("Default organization changed."); } catch (er) { setDefaultMsg(reasonOf(er)); } }}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </SelectField>
            </div>
            {defaultMsg ? <p role="status" className="mt-2 text-body text-muted">{defaultMsg}</p> : null}
            <p className="mt-3 text-body text-muted">Your access here: <span className="font-medium text-ink">{roleLabels(actor).join(", ")}</span>. Members, invitations and the profile are on the Organization page.</p>
          </Card>
          <Card>
            <h3 className="text-body font-medium">About access</h3>
            <ul className="mt-2 space-y-2 text-body">{PRD_ROLE_HELP.map((h) => <li key={h.real}><span className="font-medium">{h.real}</span> <span className="text-muted">{h.prd}</span></li>)}</ul>
            <p className="mt-3 text-label text-muted">An application role never grants authority to sign on Stellar.</p>
          </Card>
        </section>
      </Panel>

      <Dialog open={signOutAll} onClose={() => setSignOutAll(false)} destructive title="Sign out everywhere?" description="Every session of your account ends, on every device, including this one. You will need to sign in again. Your records are kept." primary={{ label: "Sign out everywhere", onClick: leave, loading: busy }} />
    </PageFrame>
  );
}
