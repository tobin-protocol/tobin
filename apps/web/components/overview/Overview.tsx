"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import { overviewOf } from "../../lib/cross-session/overview.ts";
import { entityOf } from "../../lib/activity/entity.ts";
import { formatDateTime, humanizeKind, relativeTime } from "../../lib/format.ts";
import { can } from "../../lib/permissions/can.ts";
import { client } from "../../lib/tobin/index.ts";
import { useCrossSession, type Part } from "../data/useCrossSession.tsx";
import { GrainBanner } from "../shell/GrainBanner.tsx";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { ListTile } from "../tobin/ListTile.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { StatGrid } from "../ui/Surfaces.tsx";

const SECTION_H = "text-entity font-medium";

export function Overview() {
  const { me, org, actor } = useWorkspace();
  const isAdmin = can(actor, "invitations.manage").allowed;
  const create = can(actor, "sessions.create");
  const membersQ = useQuery({ queryKey: ["members", org.id], queryFn: () => client.organizations.members(org.id) });
  const invitesQ = useQuery({ queryKey: ["invitations", org.id], queryFn: () => client.organizations.invitations(org.id), enabled: isAdmin });
  // only the people who can act on an authorization need it: a plain member reads one request fewer per session
  const parts: Part[] = actor.reviewer ? ["detail", "authorization", "settlement"] : isAdmin ? ["detail", "authorization"] : ["detail"];
  const cs = useCrossSession({ parts });

  const pending = isAdmin ? (invitesQ.data ? invitesQ.data.filter((i) => i.status === "pending").length : null) : null;
  const figures = useMemo(() => overviewOf(cs.rows ?? [], cs.bundles, { canDecide: actor.reviewer, canRecalculate: isAdmin }, pending, { reviewer: actor.reviewer, displayName: me.user.displayName }), [cs.rows, cs.bundles, actor.reviewer, isAdmin, pending, me.user.displayName]);
  const count = cs.rows && !cs.listError ? cs.total : null;
  const loading = cs.listLoading || (cs.reading && cs.bundles.length === 0);

  const createAction = create.allowed
    ? <ButtonLink href="/sessions/new" variant="primary">Create session</ButtonLink>
    : <Button variant="primary" disabled aria-describedby="create-reason">Create session</Button>;

  return (
    <PageFrame title="Overview" breadcrumbs={[{ label: org.name }, { label: "Overview" }]} banner={<GrainBanner label="Sessions" count={count} />} actions={createAction}>
      {!create.allowed ? <p id="create-reason" className="-mt-3 mb-4 text-label text-muted" role="note">{create.reason} Creating a session needs the Admin role.</p> : null}
      {cs.listError ? <div className="mb-6"><ErrorState title="Could not load sessions" message={cs.listError.message} retry={<Button onClick={() => window.location.reload()}>Try again</Button>} /></div> : null}

      <div className="space-y-10">
        <section aria-labelledby="attention-h" className="space-y-3">
          <h2 id="attention-h" className={SECTION_H}>Needs your attention</h2>
          {loading ? <ul aria-busy="true" aria-label="Loading" className="space-y-2"><li><Skeleton className="h-[86px] w-full" /></li><li><Skeleton className="h-[86px] w-full" /></li></ul>
            : figures.attention.length === 0 ? (
              <p className="flex min-h-[86px] items-center bg-tile px-4 text-body text-muted">Nothing needs your attention in the sessions read. {figures.coverage.text}.</p>
            ) : (
              <ul className="space-y-2" aria-label="Needs your attention">
                {figures.attention.map((a) => (
                  <ListTile key={`${a.kind}-${a.sessionId ?? "x"}`} identifier={a.label} tag={a.kind === "review" ? "Awaiting your review" : a.kind === "stale" ? "Needs recalculation" : "Awaiting response"} title={a.detail} href={a.href} action={a.action} actionLabel={`${a.action}: ${a.label}`} />
                ))}
              </ul>
            )}
        </section>

        <section aria-labelledby="figures-h" className="space-y-3">
          <h2 id="figures-h" className={SECTION_H}>In this organization</h2>
          <StatGrid columns={4} items={[
            { label: "Sessions", value: count === null ? "No data" : String(count), hint: "All sessions (real count)" },
            { label: "Members", value: membersQ.data ? String(membersQ.data.length) : membersQ.isError ? "No data" : "…", hint: "Real count" },
            ...(isAdmin ? [{ label: "Pending invitations", value: pending === null ? "No data" : String(pending), hint: "Real count" }] : []),
            { label: "Being configured", value: loading ? "…" : String(figures.byWorkflow.configuring), hint: "Derived" },
            { label: "Marked ready", value: loading ? "…" : String(figures.byWorkflow.ready), hint: "Derived" },
            { label: "Closed", value: loading ? "…" : String(figures.byWorkflow.closed), hint: "Derived" },
            ...(actor.reviewer ? [{ label: "Awaiting your review", value: loading ? "…" : String(figures.awaitingReview), hint: "Derived, calculations only" }] : []),
          ]} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
            <p className="text-body text-muted" data-testid="coverage">{loading ? "Reading sessions…" : `${figures.coverage.text}.`}</p>
            {cs.canLoadMore ? <Button onClick={cs.loadNext} loading={cs.reading}>Load next 10 sessions</Button> : null}
          </div>
        </section>

        <section aria-labelledby="recent-h" className="space-y-3">
          <h2 id="recent-h" className={SECTION_H}>Recent activity</h2>
          {loading ? <Skeleton lines={3} /> : figures.recent.length === 0 ? <p className="flex min-h-[86px] items-center bg-tile px-4 text-body text-muted">No activity in the sessions read.</p> : (
            <ul className="divide-y divide-divider border-y border-divider" aria-label="Recent activity">
              {figures.recent.map((r) => {
                const e = entityOf(r.kind, r.sessionId);
                return (
                  <li key={`${r.sessionId}-${r.at}-${r.kind}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <span className="min-w-0"><span className="block text-body">{humanizeKind(r.kind)}</span><span className="block text-label text-muted">{r.actor} · <Link href={e.href} className="underline underline-offset-4">{r.sessionLabel}</Link></span></span>
                    <span title={formatDateTime(r.at)} className="text-label text-muted">{relativeTime(r.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-label text-muted">Activity of the sessions read. <Link href="/activity" className="underline underline-offset-4">All activity</Link></p>
        </section>
      </div>
    </PageFrame>
  );
}
