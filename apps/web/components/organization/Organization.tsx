"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { can, roleDifferences, roleLabels } from "../../lib/permissions/can.ts";
import { formatDate, formatDateTime, INSTITUTION_LABEL } from "../../lib/format.ts";
import { canRevokeInvitation, invitationState, lastActiveAdmin, REMOVE_CONSEQUENCES, SUSPEND_CONSEQUENCES } from "../../lib/org/rules.ts";
import { invitationCreateForm, orgProfileForm, zodResolver, type InvitationCreateForm, type OrgProfileForm } from "../../lib/schemas.ts";
import { client } from "../../lib/tobin/index.ts";
import type { Member, Role } from "../../lib/tobin/types.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { CopyButton, reasonOf } from "../sessions/shared.tsx";
import { OrgWallets } from "../wallets/Wallets.tsx";
import { Button } from "../ui/Button.tsx";
import { PageTabs, Table, type Col } from "../ui/Data.tsx";
import { AccessDenied, EmptyState, ErrorState, InlineError, NotSupported, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { ChoiceGroup, SelectField, TextAreaField, TextField } from "../ui/Form.tsx";
import { Dialog, SidePanel } from "../ui/Overlays.tsx";
import { Card, Panel, StatGrid } from "../ui/Surfaces.tsx";

const TABS = [{ key: "profile", label: "Profile" }, { key: "members", label: "Members" }, { key: "invitations", label: "Invitations" }, { key: "wallets", label: "Wallets" }] as const;
type TabKey = (typeof TABS)[number]["key"];

export function Organization() {
  const { org } = useWorkspace();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "profile";
  const href = (k: TabKey) => (k === "profile" ? "/organization" : `/organization?tab=${k}`);
  return (
    <PageFrame title="Organization" breadcrumbs={[{ label: org.name }, { label: "Organization" }]}>
      <div className="mb-6 border-b border-divider"><PageTabs label="Organization sections" items={TABS.map((t) => ({ href: href(t.key), label: t.label }))} activeHref={href(tab)} /></div>
      <Panel className="space-y-4">
        {tab === "profile" ? <ProfileTab /> : tab === "members" ? <MembersTab /> : tab === "invitations" ? <InvitationsTab /> : <OrgWallets />}
      </Panel>
    </PageFrame>
  );
}

// ---------------- Profile ----------------
function ProfileTab() {
  const { org, actor } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["org", org.id], queryFn: () => client.organizations.get(org.id) });
  const edit = can(actor, "org.edit");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const o = q.data?.organization;
  const f = useForm<OrgProfileForm>({ resolver: zodResolver(orgProfileForm), values: o ? { name: o.name, description: o.description, visibility: o.visibility } : { name: "", description: "", visibility: "private" } });
  const visibility = useWatch({ control: f.control, name: "visibility" });
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.error || !o) return <ErrorState title="Could not load the organization" message={(q.error as Error)?.message ?? "No data"} retry={<Button onClick={() => q.refetch()}>Try again</Button>} />;
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Profile</h2>
        <div className="mt-3">
          <StatGrid columns={3} items={[
            { label: "Type", value: o.institutionType ? INSTITUTION_LABEL[o.institutionType] ?? o.institutionType : "No data" },
            { label: "Jurisdiction", value: o.jurisdiction ?? "No data" },
            { label: "Created", value: formatDate(o.createdAt) },
            { label: "Your access", value: roleLabels(actor).join(", ") },
            { label: "Network", value: "Stellar Testnet" },
          ]} />
        </div>
        <p className="mt-3 text-label text-muted">Type and jurisdiction cannot be changed after creation.</p>
      </Card>
      <Card>
        <h2 className="text-entity font-medium">Edit profile</h2>
        {edit.allowed ? (
          <form className="mt-3 space-y-3" noValidate onSubmit={f.handleSubmit(async (v) => { setError(null); setSaved(false); try { await client.organizations.update(org.id, v); setSaved(true); await qc.invalidateQueries({ queryKey: ["org", org.id] }); await qc.invalidateQueries({ queryKey: ["me"] }); } catch (e) { setError(reasonOf(e)); } })}>
            <TextField id="op-name" label="Organization name" error={f.formState.errors.name?.message} {...f.register("name")} />
            <TextAreaField id="op-desc" label="Description" error={f.formState.errors.description?.message} {...f.register("description")} />
            <ChoiceGroup legend="Visibility" name="op-vis" value={visibility} onChange={(x) => f.setValue("visibility", x as "private" | "public", { shouldDirty: true })} options={[{ value: "private", label: "Private", hint: "Only members can see it." }, { value: "public", label: "Public", hint: "Visible to other Tobin users." }]} />
            {error ? <InlineError>{error}</InlineError> : null}
            {saved ? <p role="status" className="text-body text-muted">Saved.</p> : null}
            <Button type="submit" variant="primary" loading={f.formState.isSubmitting} disabled={!f.formState.isDirty}>Save changes</Button>
          </form>
        ) : <p className="mt-2 text-body text-muted" role="note">{edit.reason} Only administrators can edit the profile.</p>}
      </Card>
    </div>
  );
}

// ---------------- Members ----------------
type Action = null | { kind: "role"; m: Member } | { kind: "reviewer"; m: Member } | { kind: "status"; m: Member } | { kind: "remove"; m: Member };

function MembersTab() {
  const { org, actor } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["members", org.id], queryFn: () => client.organizations.members(org.id) });
  const manage = can(actor, "members.manage");
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [newRole, setNewRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = q.data ?? [];
  const open = members.find((m) => m.userId === openId) ?? null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); setAction(null); await qc.invalidateQueries({ queryKey: ["members", org.id] }); await qc.invalidateQueries({ queryKey: ["me"] }); }
    catch (e) { setError(reasonOf(e)); setAction(null); } finally { setBusy(false); }
  };

  const cols: Col<Member>[] = [
    { id: "name", header: "Member", cell: (r) => <span><span className="block font-medium">{r.name}{r.you ? " (you)" : ""}</span>{r.email ? <span className="block text-label text-muted">{r.email}</span> : null}</span> },
    { id: "role", header: "Role", cell: (r) => (r.role === "admin" ? "Admin" : "Member") },
    { id: "rev", header: "Reviewer", cell: (r) => (r.reviewer ? "Reviewer" : <span className="text-muted">No</span>), hideBelow: "md" },
    { id: "status", header: "Status", cell: (r) => <StatusMark kind={r.status === "active" ? "done" : "unsupported"}>{r.status === "active" ? "Active" : "Suspended"}</StatusMark> },
    { id: "since", header: "Since", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.since)}</span>, hideBelow: "md" },
    { id: "act", header: "", align: "right", cell: (r) => <Button variant="quiet" onClick={() => { setError(null); setOpenId(r.userId); }} aria-label={`Open ${r.name}`}>Open</Button> },
  ];

  const target = action?.m ?? null;
  const last = target ? lastActiveAdmin(members, target.userId) : false;
  const diff = target ? roleDifferences(target.role, newRole) : { gains: [], losses: [] };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Members</h2>
        <p className="mt-1 text-body text-muted">Roles are Admin and Member. Reviewer is a separate grant that lets a person approve or reject; it is not a role.</p>
        <div className="mt-3">
          <Table columns={cols} data={members} getRowId={(r) => r.userId} loading={q.isLoading} error={q.error ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<EmptyState title="No members" message="No members were returned." />} />
        </div>
        {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
      </Card>
      <NotSupported tone="card" feature="Owner, Operator, Approver and Viewer roles" reason="The backend has Admin and Member roles and a separate Reviewer grant. No other roles exist." />

      <SidePanel open={!!open} onClose={() => setOpenId(null)} title="Member">
        {open ? (
          <div className="space-y-4">
            <div className="rounded-card bg-card p-4">
              <StatGrid columns={2} items={[
                { label: "Name", value: open.name }, { label: "Role", value: open.role === "admin" ? "Admin" : "Member" },
                { label: "Reviewer", value: open.reviewer ? "Yes" : "No" }, { label: "Status", value: open.status === "active" ? "Active" : "Suspended" },
                { label: "Member since", value: formatDateTime(open.since) }, { label: "Email", value: open.email ?? "No data" },
              ]} />
              {open.wallet ? <p className="mt-3 break-all border-t border-divider pt-3 font-mono text-ident text-muted">{open.wallet}</p> : null}
            </div>
            {manage.allowed ? (
              <div className="flex flex-col gap-2">
                <Button onClick={() => { setNewRole(open.role === "admin" ? "member" : "admin"); setError(null); setAction({ kind: "role", m: open }); }}>Change role</Button>
                <Button onClick={() => { setError(null); setAction({ kind: "reviewer", m: open }); }}>{open.reviewer ? "Revoke reviewer capability" : "Grant reviewer capability"}</Button>
                <Button disabled={open.you} title={open.you ? "You cannot change your own membership status." : undefined} onClick={() => { setError(null); setAction({ kind: "status", m: open }); }}>{open.status === "active" ? "Suspend member" : "Restore member"}</Button>
                <Button variant="destructive" onClick={() => { setError(null); setAction({ kind: "remove", m: open }); }}>Remove member</Button>
                {open.you ? <p className="text-label text-muted">You cannot suspend yourself.</p> : null}
              </div>
            ) : <p className="text-body text-muted" role="note">{manage.reason}</p>}
            {error ? <InlineError>{error}</InlineError> : null}
          </div>
        ) : null}
      </SidePanel>

      <Dialog open={action?.kind === "role"} onClose={() => setAction(null)} title={`Change ${target?.name ?? "member"}'s role?`} description={`From ${target?.role === "admin" ? "Admin" : "Member"} to ${newRole === "admin" ? "Admin" : "Member"}.`}
        primary={{ label: "Change role", onClick: () => run(() => client.organizations.setRole(org.id, target!.userId, newRole)), loading: busy, disabled: newRole === target?.role || (last && newRole !== "admin") }}>
        <div className="space-y-3">
          <SelectField id="role-pick" label="New role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}><option value="member">Member</option><option value="admin">Admin</option></SelectField>
          {diff.gains.length > 0 ? <div><p className="text-body font-medium">They will gain</p><ul className="list-disc pl-5 text-body">{diff.gains.map((g) => <li key={g}>{g}</li>)}</ul></div> : null}
          {diff.losses.length > 0 ? <div><p className="text-body font-medium">They will lose</p><ul className="list-disc pl-5 text-body">{diff.losses.map((g) => <li key={g}>{g}</li>)}</ul></div> : null}
          {diff.gains.length === 0 && diff.losses.length === 0 ? <p className="text-body text-muted">No change in permissions.</p> : null}
          <p className="text-label text-muted">The reviewer capability is separate and is not changed by a role change.</p>
          {last && newRole !== "admin" ? <p className="text-body text-danger" role="alert">This is the last active administrator. An organization must keep at least one.</p> : null}
        </div>
      </Dialog>

      <Dialog open={action?.kind === "reviewer"} onClose={() => setAction(null)} title={target?.reviewer ? "Revoke the reviewer capability?" : "Grant the reviewer capability?"}
        description={target?.reviewer ? "They can no longer approve or reject. Earlier decisions stay on record." : "They will be able to approve or reject calculations and settlement batches. The server still enforces separation of duties: nobody decides on work they recorded, calculated or prepared."}
        primary={{ label: target?.reviewer ? "Revoke capability" : "Grant capability", onClick: () => run(() => client.organizations.setReviewer(org.id, target!.userId, !target!.reviewer)), loading: busy }} />

      <Dialog open={action?.kind === "status"} onClose={() => setAction(null)} destructive={target?.status === "active"} title={target?.status === "active" ? `Suspend ${target?.name}?` : `Restore ${target?.name}?`}
        description={target?.status === "active" ? "They keep their record but lose access." : "They regain the access their role gives."}
        primary={{ label: target?.status === "active" ? "Suspend member" : "Restore member", onClick: () => run(() => client.organizations.setStatus(org.id, target!.userId, target!.status === "active" ? "suspended" : "active")), loading: busy }}>
        <ul className="list-disc space-y-1 pl-5 text-body">{SUSPEND_CONSEQUENCES.map((c) => <li key={c}>{c}</li>)}</ul>
      </Dialog>

      <Dialog open={action?.kind === "remove"} onClose={() => setAction(null)} destructive title={`Remove ${target?.name ?? "member"}?`} description="This ends their membership."
        primary={{ label: "Remove member", onClick: () => run(() => client.organizations.removeMember(org.id, target!.userId)), loading: busy, disabled: last }}>
        <ul className="list-disc space-y-1 pl-5 text-body">{REMOVE_CONSEQUENCES.map((c) => <li key={c}>{c}</li>)}</ul>
        {last ? <p className="mt-2 text-body text-danger" role="alert">This is the last active administrator and cannot be removed.</p> : null}
      </Dialog>
    </div>
  );
}

// ---------------- Invitations ----------------
function InvitationsTab() {
  const { org, actor } = useWorkspace();
  const qc = useQueryClient();
  const manage = can(actor, "invitations.manage");
  const q = useQuery({ queryKey: ["invitations", org.id], queryFn: () => client.organizations.invitations(org.id), enabled: manage.allowed });
  const [token, setToken] = useState<{ invitee: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = useForm<InvitationCreateForm>({ resolver: zodResolver(invitationCreateForm), defaultValues: { invitee: "", role: "member" } });
  if (!manage.allowed) return <AccessDenied title="Invitations are for administrators" message={`${manage.reason} Ask an administrator of ${org.name} to invite people.`} />;

  const items = q.data ?? [];
  const cols: Col<(typeof items)[number]>[] = [
    { id: "who", header: "Invitee", cell: (r) => <span className="break-all font-medium">{r.invitee}</span> },
    { id: "role", header: "Role", cell: (r) => (r.role === "admin" ? "Admin" : "Member"), hideBelow: "md" },
    { id: "state", header: "State", cell: (r) => { const s = invitationState(r); return <StatusMark kind={s === "Accepted" ? "done" : s === "Pending" ? "progress" : s === "Revoked" ? "failed" : "unsupported"}>{s}</StatusMark>; } },
    { id: "exp", header: "Expires", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.expiresAt)}</span>, hideBelow: "md" },
    { id: "act", header: "", align: "right", cell: (r) => (canRevokeInvitation(r) ? <Button variant="quiet" onClick={() => { setError(null); setRevoke(r.id); }} aria-label={`Revoke invitation for ${r.invitee}`}>Revoke</Button> : null) },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Invite someone</h2>
        <p className="mt-1 text-body text-muted">Tobin sends no email: no delivery provider is configured. You are given a one-time code, shown once, to hand over yourself.</p>
        <form className="mt-3 space-y-3" noValidate onSubmit={f.handleSubmit(async (v) => { setError(null); try { const r = await client.organizations.invite(org.id, v); setToken({ invitee: r.invitation.invitee, token: r.token }); f.reset(); await qc.invalidateQueries({ queryKey: ["invitations", org.id] }); } catch (e) { setError(reasonOf(e)); } })}>
          <TextField id="inv-invitee" label="Email or Stellar address" autoComplete="off" error={f.formState.errors.invitee?.message} {...f.register("invitee")} />
          <SelectField id="inv-role" label="Role" {...f.register("role")}><option value="member">Member</option><option value="admin">Admin</option></SelectField>
          {error ? <InlineError>{error}</InlineError> : null}
          <Button type="submit" variant="primary" loading={f.formState.isSubmitting}>Create invitation</Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-entity font-medium">Invitations</h2>
        <div className="mt-3">
          <Table columns={cols} data={items} getRowId={(r) => r.id} loading={q.isLoading} error={q.error ? (q.error as Error).message : null} onRetry={() => q.refetch()} empty={<EmptyState title="No invitations" message="Invitations you create appear here with their state." />} />
        </div>
        <p className="mt-3 text-label text-muted">Expired is derived from the expiry time; the server stores pending, accepted or revoked.</p>
      </Card>

      <Dialog open={!!token} onClose={() => setToken(null)} title="Invitation created" description="No email was sent. Give this one-time code to the invitee yourself. It is shown once and cannot be retrieved again." secondaryLabel="Close" primary={{ label: "Done", onClick: () => setToken(null) }}>
        {token ? <div><p className="text-label uppercase tracking-wide text-muted">One-time code for {token.invitee}</p><p className="mt-1 break-all font-mono text-ident" data-testid="invite-token">{token.token}</p><div className="mt-3"><CopyButton value={token.token} label="Copy code" /></div></div> : null}
      </Dialog>
      <Dialog open={!!revoke} onClose={() => setRevoke(null)} destructive title="Revoke this invitation?" description="The code stops working. This cannot be undone; create a new invitation if needed." primary={{ label: "Revoke invitation", loading: busy, onClick: async () => { setBusy(true); try { await client.organizations.revokeInvitation(org.id, revoke!); setRevoke(null); await qc.invalidateQueries({ queryKey: ["invitations", org.id] }); } catch (e) { setError(reasonOf(e)); setRevoke(null); } finally { setBusy(false); } } }} />
    </div>
  );
}
