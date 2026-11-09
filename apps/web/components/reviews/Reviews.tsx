"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { mineOf, reviewQueue, SEPARATION_NOTE, type ReviewRow } from "../../lib/cross-session/reviews.ts";
import { relativeTime } from "../../lib/format.ts";
import { useCrossSession } from "../data/useCrossSession.tsx";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { SegmentTabs } from "../ui/Data.tsx";
import { AccessDenied, EmptyState, ErrorState, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { Card, Panel } from "../ui/Surfaces.tsx";

type Tab = "mine" | "all";

/** The review queue across sessions. It decides nothing: each row opens the Settlement step of its session. Same queue function as the sidebar count. */
export function Reviews() {
  const { me, org, actor } = useWorkspace();
  const [tab, setTab] = useState<Tab>(actor.reviewer ? "mine" : "all");
  const cs = useCrossSession({ parts: ["authorization", "settlement"] });
  const queue = useMemo(() => reviewQueue(cs.bundles, { reviewer: actor.reviewer, displayName: me.user.displayName }), [cs.bundles, actor.reviewer, me.user.displayName]);
  const rows: ReviewRow[] = tab === "mine" ? mineOf(queue) : queue;
  const loading = cs.listLoading || (cs.reading && cs.bundles.length === 0);

  return (
    <PageFrame title="Reviews" breadcrumbs={[{ label: org.name }, { label: "Reviews" }]} sensitive>
      {cs.listError ? (
        <ErrorState title="Could not load sessions" message={cs.listError.message} retry={<Button onClick={() => window.location.reload()}>Try again</Button>} />
      ) : (
        <Panel className="space-y-4">
          <Card>
            <p className="text-body text-muted">Calculations and settlement batches awaiting review. One reviewer decides each; this is not N-of-M approval. A decision is recorded in Tobin and is not an on-chain signature.</p>
            <p className="mt-2 text-label text-muted" id="sep-note">{SEPARATION_NOTE}</p>
            <p className="mt-2 text-label text-muted" data-testid="reviews-coverage">{cs.coverage.text}</p>
            <div className="mt-3"><SegmentTabs label="Show" value={tab} onChange={setTab} items={[{ value: "mine", label: "My reviews" }, { value: "all", label: "All" }]} /></div>
          </Card>

          {loading ? (
            <div className="space-y-px" role="status" aria-busy="true" aria-label="Loading reviews">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : tab === "mine" && !actor.reviewer ? (
            <AccessDenied title="My reviews needs the reviewer capability" message="An administrator can grant you the Reviewer capability under Organization, Members. You can still see every awaiting item under All." />
          ) : rows.length === 0 ? (
            <EmptyState title="Nothing here" message={tab === "mine" ? "Nothing in the sessions read is waiting for your review." : "No calculation or settlement batch in the sessions read is awaiting review."} />
          ) : (
            <ul className="space-y-3" aria-label="Review items">
              {rows.map((r) => (
                <li key={r.key} className="rounded-card bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={r.href} className="inline-flex min-h-11 items-center text-entity font-medium">{r.sessionLabel}</Link>
                      <p className="text-body text-muted">{r.kind === "calculation" ? "Calculation review" : "Settlement batch review"}{r.asset ? ` · ${r.asset}` : ""}</p>
                      <p className="mt-1 text-body">Prepared by: {r.preparedBy ?? "Not shown for calculations"}{r.preparedAt ? ` · ${relativeTime(r.preparedAt)}` : ""}</p>
                      <p className="text-body">Who may review: {r.mine ? "you" : r.reason}</p>
                    </div>
                    <StatusMark kind={r.mine ? "action" : "unsupported"}>{r.mine ? "You can review" : actor.reviewer ? "Awaiting another reviewer" : "Needs the Reviewer grant"}</StatusMark>
                  </div>
                  <div className="mt-3"><ButtonLink href={r.href} variant="quiet" className="w-full sm:w-auto">Open the Settlement step</ButtonLink></div>
                </li>
              ))}
            </ul>
          )}
          {cs.canLoadMore ? <Button variant="quiet" onClick={cs.loadNext}>Load next 10 sessions</Button> : null}
        </Panel>
      )}
    </PageFrame>
  );
}
