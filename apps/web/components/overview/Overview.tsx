"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { client } from "../../lib/tobin/index.ts";
import { can, roleLabels } from "../../lib/permissions/can.ts";
import { relevantSessions } from "../../lib/derived/relevant-sessions.ts";
import Link from "next/link";
import { derive, selectForReading, SESSION_REQUEST_CAP, type AttentionItem, type RecentItem, type SessionBundle } from "../../lib/derived/overview.ts";
import { formatDateTime, humanizeKind, INSTITUTION_LABEL, relativeTime } from "../../lib/format.ts";
import { useWorkspace } from "../shell/session.tsx";
import { PageFrame } from "../shell/PageFrame.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { Table, type Col, Identifier } from "../ui/Data.tsx";
import { EmptyState, ErrorState, NotSupported, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { Card, DataCard, DerivedNote, Panel, StatGrid } from "../ui/Surfaces.tsx";
import { useApprovalsPending } from "../approvals/usePending.ts";

const attentionColumns: Col<AttentionItem>[] = [
  { id: "item", header: "Needs attention", cell: (r) => <span><span className="block font-medium">{r.label}</span><span className="block text-muted">{r.detail}</span></span> },
  { id: "state", header: "Status", cell: (r) => <StatusMark kind="action">{r.kind === "review" || r.kind === "approvals" ? "Awaiting your review" : r.kind === "stale" ? "Needs recalculation" : "Awaiting response"}</StatusMark>, hideBelow: "md" },
  { id: "open", header: "", align: "right", cell: (r) => (r.kind === "approvals" ? <ButtonLink href="/approvals" variant="quiet">Open</ButtonLink> : r.sessionId ? <ButtonLink href={`/sessions/${r.sessionId}`} variant="quiet">Open</ButtonLink> : <ButtonLink href="/organization?tab=invitations" variant="quiet">Open</ButtonLink>) },
];
const recentColumns: Col<RecentItem>[] = [
  { id: "when", header: "When", cell: (r) => <span title={formatDateTime(r.at)} className="text-muted">{relativeTime(r.at)}</span> },
  { id: "who", header: "Who", cell: (r) => r.actor, hideBelow: "md" },
  { id: "what", header: "Event", cell: (r) => <span><span className="block">{humanizeKind(r.kind)}</span><span className="block text-muted">{r.detail}</span><span className="block text-label text-muted">{r.sessionLabel}</span></span> },
];

export function Overview() {
  const { org, actor, actorKnown } = useWorkspace();
  const orgQ = useQuery({ queryKey: ["org", org.id], queryFn: () => client.organizations.get(org.id) });
  const membersQ = useQuery({ queryKey: ["members", org.id], queryFn: () => client.organizations.members(org.id) });
  const isAdmin = can(actor, "invitations.manage").allowed;
  const invitesQ = useQuery({ queryKey: ["invitations", org.id], queryFn: () => client.organizations.invitations(org.id), enabled: isAdmin });
  const sessionsQ = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id) });

  const toRead = useMemo(() => (sessionsQ.data ? selectForReading(sessionsQ.data) : []), [sessionsQ.data]);
  const bundleQs = useQueries({
    queries: toRead.map((row) => ({
      queryKey: ["bundle", org.id, row.sessionId],
      queryFn: async (): Promise<SessionBundle> => {
        const [d, o, a] = await Promise.allSettled([client.sessions.get(org.id, row.sessionId), client.obligations.listBySession(org.id, row.sessionId), client.authorization.get(org.id, row.sessionId)]);
        return {
          row,
          ...(d.status === "fulfilled" ? { detail: d.value } : {}),
          ...(o.status === "fulfilled" ? { obligations: o.value } : {}),
          ...(a.status === "fulfilled" ? { authorization: a.value } : {}),
          failed: d.status === "rejected" || o.status === "rejected" || a.status === "rejected",
        };
      },
    })),
  });
  const reading = bundleQs.some((q) => q.isLoading);
  const bundles = bundleQs.map((q) => q.data).filter((b): b is SessionBundle => !!b);

  const bundleStamp = bundleQs.map((q) => q.dataUpdatedAt).join(",");
  const pending = isAdmin ? (invitesQ.data ? invitesQ.data.filter((i) => i.status === "pending").length : null) : null;
  const derived = useMemo(
    () => (sessionsQ.data ? derive(sessionsQ.data, bundles, { canDecide: actor.reviewer, canRecalculate: isAdmin }, pending) : null),
    // bundles are rebuilt from the query results whenever any of them updates (bundleStamp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionsQ.data, bundleStamp, actor.reviewer, isAdmin, pending],
  );

  // a count of nothing read is "No data", never 0 (design spec, empty states)
  const cnt = (v: number) => (reading ? "…" : derived && derived.sessionsRead === 0 ? "No data" : v);
  const approvalsPending = useApprovalsPending();
  const attentionRows: AttentionItem[] = [...(derived?.attention ?? []), ...(approvalsPending.count ? [{ kind: "approvals", label: "Approvals", detail: `${approvalsPending.count} awaiting your review (derived from the sessions read)` } as AttentionItem] : [])];
  // the sessions most worth opening, from the same capped reads (a subset, and the page says so)
  const relevant = relevantSessions(bundles, { canDecide: actor.reviewer, canRecalculate: isAdmin });
  const createSession = can(actor, "sessions.create");
  const o = orgQ.data?.organization;
  return (
    <PageFrame title="Overview" breadcrumbs={[{ label: org.name }, { label: "Overview" }]} actions={createSession.allowed ? <ButtonLink href="/sessions/new" variant="primary">Create session</ButtonLink> : <Button variant="primary" disabled title={createSession.reason ?? undefined}>Create session</Button>}>
      <nav aria-label="Quick links" className="mb-6 flex flex-wrap gap-2">
        <ButtonLink href="/sessions" variant="quiet">View sessions</ButtonLink>
        <ButtonLink href="/obligations" variant="quiet">View obligations</ButtonLink>
        <ButtonLink href="/approvals" variant="quiet">Review approvals{approvalsPending.count ? ` (${approvalsPending.count})` : ""}</ButtonLink>
        <ButtonLink href="/activity" variant="quiet">Inspect activity</ButtonLink>
      </nav>
      {!createSession.allowed ? <p className="-mt-3 mb-6 text-label text-muted" role="note">{createSession.reason} Creating a session needs the Admin role.</p> : null}
      {sessionsQ.error ? (
        <ErrorState title="Could not load sessions" message={(sessionsQ.error as Error).message} retry={<Button onClick={() => sessionsQ.refetch()}>Try again</Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <Panel aria-label="Summary" className="space-y-6">
              {sessionsQ.isLoading || !derived ? (
                <div className="grid gap-4 md:grid-cols-2" aria-busy="true"><Skeleton className="h-40 rounded-data" /><Skeleton className="h-40" /></div>
              ) : (
                <>
                  <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr] md:items-start">
                    <DataCard label="Needs your attention" value={reading ? "…" : attentionRows.length} note={reading ? "Reading sessions…" : "Derived from the sessions read"} />
                    <div className="space-y-4">
                      <StatGrid items={[
                        { label: "Clearing sessions", value: derived.sessionsTotal, hint: "All sessions" },
                        { label: "Members", value: membersQ.data ? membersQ.data.length : "No data", hint: membersQ.data ? "All members" : undefined },
                        { label: "Obligations recorded", value: cnt(derived.obligationsActive), hint: "From the sessions read" },
                        { label: "Voided", value: cnt(derived.obligationsVoided), hint: "From the sessions read" },
                        { label: "Configuring", value: cnt(derived.byWorkflow.configuring), hint: "From the sessions read" },
                        { label: "Ready or closed", value: cnt(derived.byWorkflow.ready + derived.byWorkflow.closed), hint: "From the sessions read" },
                      ]} />
                      <DerivedNote shown={derived.sessionsRead} total={derived.sessionsTotal} capped={derived.capped} />
                      {derived.unreadable > 0 ? <p className="text-label text-danger" role="status">{derived.unreadable} session{derived.unreadable === 1 ? "" : "s"} could not be read and {derived.unreadable === 1 ? "is" : "are"} left out of the derived counts.</p> : null}
                    </div>
                  </div>
                </>
              )}
            </Panel>

            <section aria-labelledby="rel-h" className="space-y-3">
              <h2 id="rel-h" className="text-entity font-medium">Sessions that matter now</h2>
              {sessionsQ.isLoading || reading ? (
                <div className="space-y-px" role="status" aria-busy="true" aria-label="Loading sessions"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
              ) : relevant.length === 0 ? (
                <EmptyState title="No sessions to show" message="Sessions you can act on appear here. Create a session to begin." action={createSession.allowed ? <ButtonLink href="/sessions/new" variant="quiet">Create session</ButtonLink> : undefined} />
              ) : (
                <Panel className="p-3 sm:p-4"><ul className="divide-y divide-divider rounded-card bg-card" aria-label="Sessions that matter now">
                  {relevant.map((s) => (
                    <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <Link href={`/sessions/${s.sessionId}`} className="block break-words text-body font-medium underline-offset-2 hover:underline max-md:flex max-md:min-h-11 max-md:items-center">{s.label}</Link>
                        <span className="block text-label text-muted">{s.activeObligations === null ? "No data" : `${s.activeObligations} active obligation${s.activeObligations === 1 ? "" : "s"}`}</span>
                      </span>
                      <StatusMark kind={s.tone === "attention" ? "action" : s.tone === "progress" ? "progress" : "unsupported"}>{s.stage}</StatusMark>
                      <ButtonLink href={s.tab === "overview" ? `/sessions/${s.sessionId}` : `/sessions/${s.sessionId}?tab=${s.tab}`} variant="quiet" aria-label={`Open ${s.label}: ${s.stage}`}>Open</ButtonLink>
                    </li>
                  ))}
                </ul></Panel>
              )}
              {derived ? <DerivedNote shown={derived.sessionsRead} total={derived.sessionsTotal} capped={derived.capped} /> : null}
            </section>

            <section aria-labelledby="attention-h" className="space-y-3">
              <h2 id="attention-h" className="text-entity font-medium">Attention</h2>
              <Table
                columns={attentionColumns}
                data={attentionRows}
                getRowId={(r) => `${r.kind}-${r.sessionId ?? "org"}`}
                loading={sessionsQ.isLoading || reading}
                empty={<EmptyState title="Nothing needs attention" message={`No session among the ${derived?.sessionsRead ?? 0} read is awaiting your review or needs recalculation${pending === 0 ? ", and no invitations are pending" : ""}. Items appear here as they arise.`} />}
              />
              <p className="text-label text-muted">Items across other organizations, notifications and failed settlements are not listed: the backend does not provide them. Approvals are counted from the sessions read; invitations from this organization.</p>
            </section>

            <section aria-labelledby="recent-h" className="space-y-3">
              <h2 id="recent-h" className="text-entity font-medium">Recent activity</h2>
              <Table
                columns={recentColumns}
                data={derived?.recent ?? []}
                getRowId={(r) => `${r.sessionId}-${r.at}-${r.kind}-${r.detail}`}
                loading={sessionsQ.isLoading || reading}
                empty={<EmptyState message="No activity has been recorded in the sessions read." />}
              />
              {derived ? <DerivedNote shown={derived.sessionsRead} total={derived.sessionsTotal} capped={derived.capped} /> : null}
            </section>
          </div>

          <Panel as="aside" className="min-w-0 space-y-4 self-start" aria-label="Organization">
            <Card>
              <h2 className="text-entity font-medium">Organization</h2>
              <div className="mt-4">
                {orgQ.isLoading ? <Skeleton lines={4} /> : orgQ.error ? <p className="text-body text-danger">Could not load the organization.</p> : o ? (
                  <StatGrid columns={2} items={[
                    { label: "Name", value: o.name },
                    { label: "Type", value: o.institutionType ? INSTITUTION_LABEL[o.institutionType] ?? o.institutionType : "No data" },
                    { label: "Jurisdiction", value: o.jurisdiction ?? "No data" },
                    { label: "Visibility", value: o.visibility === "private" ? "Private" : "Public" },
                    { label: "Network", value: "Stellar Testnet" },
                    { label: "Your access", value: actorKnown ? roleLabels(actor).join(", ") : "…" },
                  ]} />
                ) : null}
                {o ? <div className="mt-4 border-t border-divider pt-3"><p className="text-label uppercase tracking-wide text-muted">Organization id</p><Identifier value={o.id} head={12} tail={6} /></div> : null}
              </div>
            </Card>
            <NotSupported tone="card" feature="Settled value" reason="Nothing is confirmed on-chain through this application, so no settled value can be shown. It will not be estimated." />
          </Panel>
        </div>
      )}
      <p className="sr-only">Sessions read are capped at {SESSION_REQUEST_CAP}.</p>
    </PageFrame>
  );
}
