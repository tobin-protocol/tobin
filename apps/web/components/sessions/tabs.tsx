"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { can } from "../../lib/permissions/can.ts";
import { formatDateTime, groupDigits, humanizeKind, relativeTime } from "../../lib/format.ts";
import type { NextAction } from "../../lib/sessions/next-action.ts";
import { client } from "../../lib/tobin/index.ts";
import type { AuthorizationView, ObligationView, Readiness, SessionDetail, SessionParticipantView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { Button } from "../ui/Button.tsx";
import { Amount, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, InlineError, NotSupported, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { SelectField } from "../ui/Form.tsx";
import { Dialog } from "../ui/Overlays.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";
import { reasonOf } from "./shared.tsx";

const failed = (q: UseQueryResult, what: string) => <ErrorState title={`Could not load ${what}`} message={(q.error as Error).message} retry={<Button onClick={() => q.refetch()}>Try again</Button>} />;

// ---------------- Overview ----------------
export function OverviewTab({ detail, readiness, next }: { detail: SessionDetail; readiness: UseQueryResult<Readiness>; next: NextAction }) {
  const o = detail.workspace.overview;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-entity font-medium">Where this session stands</h2>
        <p className="mt-1 text-body text-muted">{next.title}. {next.who}{next.forYou ? ", and that is you" : ""}.</p>
        <div className="mt-4">
          <StatGrid columns={3} items={[
            { label: "Record", value: o.provenance === "local-draft" ? "Local draft" : o.provenance },
            { label: "Workflow", value: detail.workflow === "configuring" ? "Being configured" : detail.workflow === "ready" ? "Marked ready" : "Closed", hint: "Application record" },
            { label: "Created", value: formatDateTime(o.createdAt) },
          ]} />
        </div>
        {detail.workspace.banner ? <p className="mt-4 border-t border-divider pt-3 text-body text-muted">{detail.workspace.banner.meaning}</p> : null}
      </Card>

      <Card>
        <h2 className="text-entity font-medium">Readiness checks</h2>
        <p className="mt-1 text-body text-muted">Ready means the records in Tobin are consistent. No participant has signed, authorized or settled anything.</p>
        <div className="mt-3">
          {readiness.isLoading ? <Skeleton lines={4} /> : readiness.error ? failed(readiness, "the readiness checks") : (
            <ul className="divide-y divide-divider">
              {readiness.data?.checks.map((c) => (
                <li key={c.key} className="flex items-start justify-between gap-3 py-2.5">
                  <span><span className="block text-body">{c.label}</span>{!c.ok && c.key !== "state" ? <span className="block text-label text-muted">{c.fix}</span> : null}</span>
                  <StatusMark kind={c.ok ? "done" : "action"}>{c.ok ? "Met" : "Not met"}</StatusMark>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------- Participants ----------------
export function ParticipantsTab({ sessionId, query, workflow, onChanged }: { sessionId: string; query: UseQueryResult<SessionParticipantView[]>; workflow: "configuring" | "ready" | "closed"; onChanged: () => Promise<unknown> }) {
  const { org, actor } = useWorkspace();
  const members = useQuery({ queryKey: ["members", org.id], queryFn: () => client.organizations.members(org.id) });
  const manage = can(actor, "participants.manage");
  const editable = manage.allowed && workflow === "configuring";
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SessionParticipantView | null>(null);

  const active = (query.data ?? []).filter((p) => p.status === "active");
  const taken = new Set(active.map((p) => p.userId));
  const candidates = (members.data ?? []).filter((m) => m.status === "active" && !taken.has(m.userId));

  const add = async () => {
    if (!pick) return;
    setBusy(true); setError(null);
    try { await client.participants.add(org.id, sessionId, pick); setPick(""); await onChanged(); } catch (e) { setError(reasonOf(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true); setError(null);
    try { await client.participants.remove(org.id, sessionId, removing.userId); setRemoving(null); await onChanged(); } catch (e) { setError(reasonOf(e)); setRemoving(null); } finally { setBusy(false); }
  };

  const cols: Col<SessionParticipantView>[] = [
    { id: "name", header: "Participant", cell: (r) => <span className="font-medium">{r.name}</span> },
    { id: "org", header: "Organization", cell: (r) => r.organization, hideBelow: "md" },
    { id: "added", header: "Added", cell: (r) => <span className="text-muted">{formatDateTime(r.addedAt)}</span>, hideBelow: "md" },
    { id: "act", header: "", align: "right", cell: (r) => <Button variant="quiet" disabled={!editable || busy} title={!editable ? manage.reason ?? "The session can only change while it is being configured." : undefined} onClick={() => { setError(null); setRemoving(r); }}>Remove</Button> },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-entity font-medium">Participants</h2>
        <p className="mt-1 text-body text-muted">Members of {org.name} taking part in this session. Application record only: not an on-chain admission, and no wallet is implied.</p>
        <div className="mt-4">
          <Table columns={cols} data={active} getRowId={(r) => r.userId} loading={query.isLoading} error={query.error ? (query.error as Error).message : null} onRetry={() => query.refetch()}
            empty={<EmptyState title="No participants yet" message="A session needs at least two participants before obligations can be netted." />} />
        </div>
      </Card>

      <Card>
        <h2 className="text-entity font-medium">Add a participant</h2>
        {editable ? (
          <div className="mt-3 space-y-3">
            <SelectField id="participant-pick" label="Member of this organization" value={pick} onChange={(e) => setPick(e.target.value)} disabled={candidates.length === 0}>
              <option value="">{candidates.length === 0 ? "Every active member is already a participant" : "Choose a member"}</option>
              {candidates.map((m) => <option key={m.userId} value={m.userId}>{m.name}{m.you ? " (you)" : ""}</option>)}
            </SelectField>
            <Button variant="secondary" disabled={!pick} loading={busy} onClick={add}>Add participant</Button>
          </div>
        ) : (
          <p className="mt-2 text-body text-muted" role="note">{!manage.allowed ? manage.reason : workflow === "ready" ? "The session is marked ready. It can only change while it is being configured." : "A closed session cannot change."}</p>
        )}
        {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
      </Card>

      <NotSupported tone="card" feature="Participants from other organizations" reason="Every participant is a member of this organization. Cross-organization sessions and joining do not exist in the backend." />

      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? "participant"}?`} description="This invalidates the current calculation and any review of it. A participant with active obligations cannot be removed." destructive primary={{ label: "Remove", onClick: remove, loading: busy }} />
    </div>
  );
}

// ---------------- Obligations ----------------
export function ObligationsTab({ query }: { query: UseQueryResult<ObligationView[]> }) {
  const cols: Col<ObligationView>[] = [
    { id: "debtor", header: "Debtor", cell: (r) => <span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.debtorName}</span> },
    { id: "creditor", header: "Creditor", cell: (r) => <span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.creditorName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} asset={r.asset} /> },
    { id: "status", header: "Status", cell: (r) => <StatusMark kind={r.status === "active" ? "done" : "unsupported"}>{r.status === "active" ? "Active" : "Voided"}</StatusMark> },
    { id: "rev", header: "Revision", align: "right", cell: (r) => r.revision, hideBelow: "md" },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Obligations</h2>
        <p className="mt-1 text-body text-muted">Each obligation names a debtor, a creditor, an amount and an asset. The debtor owes the creditor. Application record only.</p>
        <div className="mt-4">
          <Table columns={cols} data={query.data ?? []} getRowId={(r) => r.id} loading={query.isLoading} error={query.error ? (query.error as Error).message : null} onRetry={() => query.refetch()}
            empty={<EmptyState title="No obligations yet" message="Obligations appear here once they are recorded." />} />
        </div>
      </Card>
      <p className="text-label text-muted">Recording, correcting and voiding obligations are built in Phase C. This tab only reads.</p>
    </div>
  );
}

// ---------------- Netting ----------------
export function NettingTab({ sessionId }: { sessionId: string }) {
  const { org } = useWorkspace();
  const q = useQuery({ queryKey: ["session", org.id, sessionId, "calculation"], queryFn: () => client.sessions.calculation(org.id, sessionId), retry: false });
  const c = q.data?.calculation;
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Net positions</h2>
        <p className="mt-1 text-body text-muted">Net position = what a participant owes minus what it is owed. Positive means it pays; negative means it receives. An application calculation: not an approval, a signature or a settlement.</p>
        <div className="mt-4">
          {q.isLoading ? <Skeleton lines={4} /> : q.error ? failed(q, "the calculation") : !c ? (
            <EmptyState title="No calculation yet" message="Net positions appear here once a calculation has been run." />
          ) : (
            <div className="space-y-4">
              <StatGrid columns={3} items={[
                { label: "Status", value: q.data?.currency === "current" ? "Current" : "Stale", hint: q.data?.currency === "stale" ? "Inputs changed after it" : undefined },
                { label: "Gross total", value: `${groupDigits(c.gross)} ${c.asset}` },
                { label: "Obligations used", value: c.obligationCount },
                { label: "Calculated", value: formatDateTime(c.createdAt) },
                { label: "Calculated by", value: c.createdBy },
              ]} />
              <Table
                columns={[
                  { id: "name", header: "Participant", cell: (r) => <span className="font-medium">{r.name}</span> },
                  { id: "role", header: "Position", cell: (r) => (r.role === "debtor" ? "Pays" : r.role === "creditor" ? "Receives" : "Flat") },
                  { id: "net", header: "Net amount", align: "right", cell: (r) => <Amount value={r.net.replace(/^-/, "")} asset={c.asset} /> },
                ] satisfies Col<(typeof c.positions)[number]>[]}
                data={c.positions} getRowId={(r) => r.userId} empty={null} />
            </div>
          )}
        </div>
      </Card>
      <p className="text-label text-muted">Running a calculation is built in Phase C. This tab only reads.</p>
    </div>
  );
}

// ---------------- Approvals ----------------
const AUTH_LABEL: Record<AuthorizationView["state"], string> = {
  "no-calculation": "No calculation to review", stale: "The reviewed calculation is stale", "awaiting-review": "Awaiting review", approved: "Approved", rejected: "Rejected",
};
export function ApprovalsTab({ query }: { query: UseQueryResult<AuthorizationView> }) {
  const a = query.data;
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Review of the calculation</h2>
        <p className="mt-1 text-body text-muted">A reviewer approves or rejects one exact calculation. This is a decision recorded in Tobin, not a Stellar signature.</p>
        <div className="mt-4">
          {query.isLoading ? <Skeleton lines={3} /> : query.error ? failed(query, "the review state") : a ? (
            <div className="space-y-4">
              <StatGrid columns={2} items={[{ label: "State", value: AUTH_LABEL[a.state] }, { label: "You can decide now", value: a.eligibility.canDecide ? "Yes" : "No" }]} />
              {!a.eligibility.canDecide && a.eligibility.reasons.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-body text-muted">{a.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
              <div>
                <h3 className="text-body font-medium">Decisions</h3>
                {a.decisions.length === 0 ? <p className="mt-1 text-body text-muted">No decision has been recorded.</p> : (
                  <ul className="mt-1 divide-y divide-divider">
                    {a.decisions.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span><span className="block text-body font-medium">{d.decidedBy}</span><span className="block text-label text-muted" title={formatDateTime(d.decidedAt)}>{relativeTime(d.decidedAt)}</span></span>
                        <StatusMark kind={d.decision === "approved" ? "done" : "failed"}>{d.decision === "approved" ? "Approved" : "Rejected"}{d.status !== "active" ? ` · ${d.status}` : ""}</StatusMark>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
      <NotSupported tone="card" feature="N-of-M approval" reason="The backend records a reviewer's decision on one calculation. There is no approval threshold or multi-party quorum." />
      <p className="text-label text-muted">Approving and rejecting are built in Phase D. This tab only reads.</p>
    </div>
  );
}

// ---------------- Settlement ----------------
export function SettlementTab() {
  return (
    <div className="space-y-4">
      <EmptyState title="Not built yet" message="Settlement preparation and review are built in Phase D. Nothing is shown here, and nothing is simulated." />
      <div className="grid gap-4 md:grid-cols-3">
        <NotSupported tone="card" feature="Signing" reason="This app cannot request or collect Stellar signatures." />
        <NotSupported tone="card" feature="Submission" reason="This app cannot submit a transaction to Stellar." />
        <NotSupported tone="card" feature="Confirmation" reason="Nothing is confirmed on-chain through this app, so no confirmed state is ever shown." />
      </div>
    </div>
  );
}

// ---------------- Activity ----------------
export function ActivityTab({ detail }: { detail: SessionDetail }) {
  const items = detail.workspace.activity.items;
  const cols: Col<(typeof items)[number]>[] = [
    { id: "when", header: "When", cell: (r) => <span title={formatDateTime(r.at)} className="text-muted">{relativeTime(r.at)}</span> },
    { id: "who", header: "Who", cell: (r) => r.actor, hideBelow: "md" },
    { id: "what", header: "Event", cell: (r) => <span><span className="block">{humanizeKind(r.kind)}</span><span className="block text-muted">{r.detail}</span></span> },
  ];
  return (
    <Card>
      <h2 className="text-entity font-medium">Activity</h2>
      <p className="mt-1 text-body text-muted">What was recorded for this session, newest first.</p>
      <div className="mt-4">
        <Table columns={cols} data={[...items].reverse()} getRowId={(r) => `${r.at}-${r.kind}-${r.detail}`} empty={<EmptyState message={detail.workspace.activity.empty ?? "No activity has been recorded for this session yet."} />} />
      </div>
    </Card>
  );
}
