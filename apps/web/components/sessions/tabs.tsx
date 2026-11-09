"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { can } from "../../lib/permissions/can.ts";
import { formatAmount, formatDateTime, humanizeKind, relativeTime } from "../../lib/format.ts";
import { grossVsNet } from "../../lib/netting/group.ts";
import { stateLayers } from "../../lib/sessions/layers.ts";
import type { NextAction } from "../../lib/sessions/next-action.ts";
import { client } from "../../lib/tobin/index.ts";
import type { AuthorizationView, BatchStatus, CalculationView, ObligationView, Readiness, SessionDetail, SessionParticipantView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { ActivityView } from "../activity/ActivityView.tsx";
import { outcomeOf, type ActivityEntry } from "../../lib/activity/derive.ts";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, InlineError, NotSupported, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { SelectField } from "../ui/Form.tsx";
import { Dialog } from "../ui/Overlays.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";
import { reasonOf } from "./shared.tsx";

const failed = (q: UseQueryResult, what: string) => <ErrorState title={`Could not load ${what}`} message={(q.error as Error).message} retry={<Button onClick={() => q.refetch()}>Try again</Button>} />;

// ---------------- Overview ----------------
export function OverviewTab({ detail, readiness, next, sessionId, participants, obligations, authorization, calc, batch }: {
  detail: SessionDetail; readiness: UseQueryResult<Readiness>; next: NextAction; sessionId: string;
  participants: SessionParticipantView[] | undefined; obligations: ObligationView[] | undefined; authorization: AuthorizationView | undefined;
  calc: CalculationView | undefined; batch: BatchStatus | "none" | null;
}) {
  const o = detail.workspace.overview;
  const active = (participants ?? []).filter((p) => p.status === "active");
  const activeObs = (obligations ?? []).filter((x) => x.status === "active");
  const voided = (obligations ?? []).length - activeObs.length;
  const layers = stateLayers({ workflow: detail.workflow, provenance: o.provenance, currency: readiness.data?.currency ?? null, auth: authorization?.state ?? null, batch });
  const c = calc?.calculation ?? null;
  const gn = c ? grossVsNet(c.gross, c.positions, calc?.currency === "current") : null;
  const tab = (t: string) => `/sessions/${sessionId}?tab=${t}`;
  const recent = [...detail.workspace.activity.items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const areas: { key: string; label: string; summary: string; tab: string }[] = [
    { key: "participants", label: "Participants", tab: "participants", summary: participants ? `${active.length} active${active.length > 0 ? `: ${active.map((p) => p.name).join(", ")}` : ""}` : "No data" },
    { key: "obligations", label: "Obligations", tab: "obligations", summary: obligations ? `${activeObs.length} active${voided > 0 ? `, ${voided} voided` : ""}` : "No data" },
    { key: "netting", label: "Netting", tab: "netting", summary: c && gn ? `Gross ${formatAmount(c.gross, c.asset)}, net that moves ${formatAmount(gn.net, c.asset)}${calc?.currency === "current" ? "" : " (stale)"}` : "No calculation yet" },
    { key: "approvals", label: "Review", tab: "approvals", summary: layers[2]?.value ?? "No data" },
    { key: "settlement", label: "Settlement", tab: "settlement", summary: layers[3]?.value ?? "No data" },
  ];
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
        <h2 className="text-entity font-medium">State, layer by layer</h2>
        <p className="mt-1 text-body text-muted">A session has several kinds of state, each from a different source. They are kept apart so that none is mistaken for another.</p>
        <ol className="mt-3 divide-y divide-divider" aria-label="State layers">
          {layers.map((l) => (
            <li key={l.key} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-body font-medium">{l.label}</span>
                {l.recorded ? <span className="text-body">{l.value}</span> : <StatusMark kind="unsupported">{l.value}</StatusMark>}
              </div>
              <p className="mt-0.5 text-label text-muted">{l.detail}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="text-entity font-medium">At a glance</h2>
        <ul className="mt-3 divide-y divide-divider" aria-label="Session sections">
          {areas.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <span className="min-w-0 flex-1"><span className="block text-label uppercase tracking-wide text-muted">{a.label}</span><span className="block break-words text-body">{a.summary}</span></span>
              <ButtonLink href={tab(a.tab)} variant="quiet" aria-label={`Open ${a.label}`}>Open</ButtonLink>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-entity font-medium">Recent events</h2>
          <ButtonLink href={tab("activity")} variant="quiet">All activity</ButtonLink>
        </div>
        {recent.length === 0 ? <p className="mt-2 text-body text-muted">Nothing has been recorded for this session yet.</p> : (
          <ul className="mt-2 divide-y divide-divider">
            {recent.map((e) => <li key={`${e.at}-${e.kind}-${e.detail}`} className="py-2.5"><span className="block text-body font-medium">{humanizeKind(e.kind)}</span><span className="block break-words text-body text-muted">{e.actor} · {e.detail}</span><span className="block text-label text-muted" title={formatDateTime(e.at)}>{relativeTime(e.at)}</span></li>)}
          </ul>
        )}
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
