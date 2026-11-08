"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { deriveActivity } from "../../lib/activity/derive.ts";
import { selectForReading } from "../../lib/derived/overview.ts";
import { client } from "../../lib/tobin/index.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button } from "../ui/Button.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { DerivedNote, Panel } from "../ui/Surfaces.tsx";
import { ActivityView } from "./ActivityView.tsx";

/** Organization activity: DERIVED from per-session reads (decision D6), capped, always labelled "Showing N of M sessions". */
export function GlobalActivity() {
  const { org } = useWorkspace();
  const sessions = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id) });
  const toRead = useMemo(() => (sessions.data ? selectForReading(sessions.data) : []), [sessions.data]);
  const reads = useQueries({ queries: toRead.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "detail"], queryFn: () => client.sessions.get(org.id, r.sessionId), staleTime: 30_000, retry: false })) });
  const reading = reads.some((q) => q.isLoading);
  const stamp = reads.map((q) => q.dataUpdatedAt).join(",");
  const derived = useMemo(
    () => (sessions.data ? deriveActivity(sessions.data, toRead.map((row, i) => ({ row, ...(reads[i]?.data ? { items: reads[i]?.data?.workspace.activity.items } : {}), failed: !reads[i]?.data }))) : null),
    // the query results are rebuilt whenever any updates (stamp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions.data, toRead, stamp],
  );

  return (
    <PageFrame title="Activity" breadcrumbs={[{ label: org.name }, { label: "Activity" }]}>
      {sessions.error ? (
        <ErrorState title="Could not load sessions" message={(sessions.error as Error).message} retry={<Button onClick={() => sessions.refetch()}>Try again</Button>} />
      ) : (
        <Panel className="space-y-4">
          <div className="rounded-card bg-card p-4">
            <p className="text-body text-muted">What was recorded across your sessions, newest first. Read-only.</p>
            {derived ? <div className="mt-2"><DerivedNote shown={derived.sessionsRead} total={derived.sessionsTotal} capped={derived.capped} /></div> : null}
            <p className="mt-1 text-label text-muted">Events that belong to no session (member, invitation, reviewer and organization changes) are not available from the backend and are not listed.</p>
            {derived && derived.unreadable > 0 && !reading ? <p className="mt-1 text-label text-danger" role="status">{derived.unreadable} session{derived.unreadable === 1 ? "" : "s"} could not be read and {derived.unreadable === 1 ? "is" : "are"} left out.</p> : null}
          </div>
          {sessions.isLoading || reading ? <div className="space-y-px" role="status" aria-busy="true" aria-label="Loading activity">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            : <ActivityView entries={derived?.entries ?? []} sessions={toRead.map((r) => ({ id: r.sessionId, label: r.label }))} showSession />}
        </Panel>
      )}
    </PageFrame>
  );
}
