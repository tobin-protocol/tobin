"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { selectForReading } from "../../lib/derived/overview.ts";
import { relativeTime } from "../../lib/format.ts";
import { client } from "../../lib/tobin/index.ts";
import type { AuthorizationView, BatchStatus, SessionRow, SettlementList } from "../../lib/tobin/types.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { SegmentTabs } from "../ui/Data.tsx";
import { EmptyState, ErrorState, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { Card, DerivedNote, Panel } from "../ui/Surfaces.tsx";
import { AUTH_LABEL } from "./ApprovalsTab.tsx";

interface Item { key: string; sessionId: string; session: string; kind: "Calculation review" | "Settlement batch review"; state: string; awaiting: boolean; youCanDecide: boolean; at: string | null; tab: "approvals" | "settlement" }
const BATCH_LABEL: Record<BatchStatus, string> = { "awaiting-review": "Awaiting review", approved: "Approved", rejected: "Rejected", invalidated: "No longer applies", superseded: "Superseded" };

/** Review items across sessions, DERIVED from per-session reads (decision D6): capped at 10 sessions and labelled with "Showing N of M sessions". */
export function GlobalApprovals() {
  const { org } = useWorkspace();
  const sessions = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id) });
  const toRead: SessionRow[] = useMemo(() => (sessions.data ? selectForReading(sessions.data) : []), [sessions.data]);
  // the same keys the workspace uses, so a session opened before is served from the cache
  const auths = useQueries({ queries: toRead.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "authorization"], queryFn: () => client.authorization.get(org.id, r.sessionId), staleTime: 30_000, retry: false })) });
  const sets = useQueries({ queries: toRead.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "settlement"], queryFn: () => client.settlement.list(org.id, r.sessionId), staleTime: 30_000, retry: false })) });
  const reading = auths.some((q) => q.isLoading) || sets.some((q) => q.isLoading);
  const stamp = [...auths, ...sets].map((q) => q.dataUpdatedAt).join(",");

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    toRead.forEach((r, i) => {
      const a = auths[i]?.data as AuthorizationView | undefined;
      if (a && a.state !== "no-calculation") {
        const last = a.decisions[a.decisions.length - 1];
        out.push({ key: `${r.sessionId}-calc`, sessionId: r.sessionId, session: r.label, kind: "Calculation review", state: AUTH_LABEL[a.state], awaiting: a.state === "awaiting-review", youCanDecide: a.state === "awaiting-review" && a.eligibility.canDecide, at: last?.decidedAt ?? null, tab: "approvals" });
      }
      const s = sets[i]?.data as SettlementList | undefined;
      const b = s ? [...s.batches].sort((x, y) => y.preparedAt.localeCompare(x.preparedAt))[0] : undefined;
      if (b) out.push({ key: `${r.sessionId}-batch`, sessionId: r.sessionId, session: r.label, kind: "Settlement batch review", state: BATCH_LABEL[b.status], awaiting: b.status === "awaiting-review", youCanDecide: false, at: b.decision?.decidedAt ?? b.preparedAt, tab: "settlement" });
    });
    return out;
    // the query results are rebuilt whenever any updates (stamp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRead, stamp]);

  const [filter, setFilter] = useState<"awaiting" | "decided" | "all">("awaiting");
  const shown = items.filter((i) => filter === "all" || (filter === "awaiting" ? i.awaiting : !i.awaiting));
  const total = sessions.data?.length ?? 0;

  return (
    <PageFrame title="Approvals" breadcrumbs={[{ label: org.name }, { label: "Approvals" }]} sensitive>
      {sessions.error ? (
        <ErrorState title="Could not load sessions" message={(sessions.error as Error).message} retry={<Button onClick={() => sessions.refetch()}>Try again</Button>} />
      ) : (
        <Panel className="space-y-4">
          <Card>
            <p className="text-body text-muted">Calculation reviews and settlement-batch reviews across your sessions. One reviewer decides each; this is not N-of-M approval. A decision is recorded in Tobin and is not an on-chain signature.</p>
            <div className="mt-2"><DerivedNote shown={toRead.length} total={total} capped={total > toRead.length} /></div>
            <div className="mt-3"><SegmentTabs label="Show" value={filter} onChange={setFilter} items={[{ value: "awaiting", label: "Awaiting review" }, { value: "decided", label: "Decided or stopped" }, { value: "all", label: "All" }]} /></div>
          </Card>

          {sessions.isLoading || reading ? (
            <div className="space-y-px" aria-busy="true" aria-label="Loading approvals">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : shown.length === 0 ? (
            <EmptyState title="Nothing here" message={filter === "awaiting" ? "No calculation or settlement batch in the sessions read is awaiting review." : "No items match."} />
          ) : (
            <ul className="space-y-3" aria-label="Review items">
              {shown.map((i) => (
                <li key={i.key} className="rounded-card bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/sessions/${i.sessionId}?tab=${i.tab}`} className="block text-entity font-medium">{i.session}</Link>
                      <p className="text-body text-muted">{i.kind}</p>
                    </div>
                    <div className="text-right">
                      <StatusMark kind={i.awaiting ? "action" : i.state === "Approved" ? "done" : i.state === "Rejected" ? "failed" : "unsupported"}>{i.state}</StatusMark>
                      <p className="mt-1 text-label text-muted">{i.youCanDecide ? "You can decide" : i.at ? relativeTime(i.at) : "No data"}</p>
                    </div>
                  </div>
                  <ButtonLink href={`/sessions/${i.sessionId}?tab=${i.tab}`} variant="quiet" className="mt-3 w-full sm:w-auto">Open</ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </PageFrame>
  );
}
