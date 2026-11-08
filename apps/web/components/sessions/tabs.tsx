"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { can } from "../../lib/permissions/can.ts";
import { formatDateTime } from "../../lib/format.ts";
import type { NextAction } from "../../lib/sessions/next-action.ts";
import { client } from "../../lib/tobin/index.ts";
import type { Readiness, SessionDetail, SessionParticipantView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { ActivityView } from "../activity/ActivityView.tsx";
import { outcomeOf, type ActivityEntry } from "../../lib/activity/derive.ts";
import { Button } from "../ui/Button.tsx";
import { Table, type Col } from "../ui/Data.tsx";
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

// ---------------- Activity ----------------
export function ActivityTab({ detail, sessionId }: { detail: SessionDetail; sessionId: string }) {
  const label = detail.workspace.overview.label;
  const entries: ActivityEntry[] = detail.workspace.activity.items.map((e) => ({ ...e, sessionId, sessionLabel: label, outcome: outcomeOf(e.kind) })).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-entity font-medium">Activity</h2>
        <p className="mt-1 text-body text-muted">What was recorded for this session, newest first. Read-only.</p>
      </Card>
      <ActivityView entries={entries} showSession={false} />
    </div>
  );
}
