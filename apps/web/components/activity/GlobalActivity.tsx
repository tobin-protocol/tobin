"use client";

import { useMemo } from "react";
import { deriveActivity } from "../../lib/activity/derive.ts";
import { useCrossSession } from "../data/useCrossSession.tsx";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button } from "../ui/Button.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { Panel } from "../ui/Surfaces.tsx";
import { ActivityView } from "./ActivityView.tsx";

/** Organization activity: DERIVED from per-session reads (decision D6), capped, always labelled "Showing N of M sessions". */
export function GlobalActivity() {
  const { org } = useWorkspace();
  const cs = useCrossSession({ parts: ["detail"] });
  const reading = cs.listLoading || (cs.reading && cs.bundles.length === 0);
  const derived = useMemo(
    () => (cs.rows ? deriveActivity(cs.rows, cs.bundles.map((b) => ({ row: b.row, ...(b.detail ? { items: b.detail.workspace.activity.items } : {}), failed: b.failed || !b.detail }))) : null),
    [cs.rows, cs.bundles],
  );

  return (
    <PageFrame title="Activity" breadcrumbs={[{ label: org.name }, { label: "Activity" }]}>
      {cs.listError ? (
        <ErrorState title="Could not load sessions" message={cs.listError.message} retry={<Button onClick={() => window.location.reload()}>Try again</Button>} />
      ) : (
        <Panel className="space-y-4">
          <div className="rounded-card bg-card p-4">
            <p className="text-body text-muted">What was recorded across your sessions, newest first. Read-only.</p>
            <p className="mt-2 text-label text-muted" data-testid="activity-coverage">{cs.coverage.text}</p>
            <p className="mt-1 text-label text-muted">Events that belong to no session (member, invitation, reviewer and organization changes) are not available from the backend and are not listed.</p>
            {derived && derived.unreadable > 0 && !reading ? <p className="mt-1 text-label text-danger" role="status">{derived.unreadable} session{derived.unreadable === 1 ? "" : "s"} could not be read and {derived.unreadable === 1 ? "is" : "are"} left out.</p> : null}
          </div>
          {reading ? <div className="space-y-px" role="status" aria-busy="true" aria-label="Loading activity">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            : <ActivityView entries={derived?.entries ?? []} sessions={cs.window.map((r) => ({ id: r.sessionId, label: r.label }))} showSession />}
          {cs.canLoadMore ? <Button variant="quiet" onClick={cs.loadNext}>Load next 10 sessions</Button> : null}
        </Panel>
      )}
    </PageFrame>
  );
}
