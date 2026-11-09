"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { formatDateTime, humanizeKind, relativeTime } from "../../lib/format.ts";
import type { ObligationView, Readiness, SessionDetail, SessionParticipantView } from "../../lib/tobin/types.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { StatGrid } from "../ui/Surfaces.tsx";

/**
 * The Overview tab: details, the readiness checklist (the console's own checks) and recent activity. It does not repeat the summary card above it (where the
 * session stands, the stage rail and the next action) nor the header (identifier, status, created time, participants).
 */
export function OverviewTab({ detail, readiness, participants, obligations, sessionId }: {
  detail: SessionDetail; readiness: UseQueryResult<Readiness>; participants: SessionParticipantView[] | undefined; obligations: ObligationView[] | undefined; sessionId: string;
}) {
  const o = detail.workspace.overview;
  const activeP = participants?.filter((p) => p.status === "active").length;
  const activeO = obligations?.filter((x) => x.status === "active").length;
  const voided = obligations ? obligations.length - (activeO ?? 0) : null;
  const recent = [...detail.workspace.activity.items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const checks = readiness.data?.checks.filter((c) => c.key !== "state") ?? [];
  const passed = checks.filter((c) => c.ok).length;
  const tab = (t: string) => `/sessions/${sessionId}?tab=${t}`;

  return (
    <div className="space-y-8">
      <section aria-labelledby="details-h" className="space-y-3">
        <h2 id="details-h" className="text-entity font-medium">Details</h2>
        <StatGrid columns={2} items={[
          { label: "Record", value: o.provenance === "local-draft" ? "Local draft" : o.provenance, hint: "Application record. Not on-chain." },
          { label: "Created", value: formatDateTime(o.createdAt) },
          { label: "Active participants", value: activeP === undefined ? "No data" : String(activeP) },
          { label: "Active obligations", value: activeO === undefined ? "No data" : String(activeO), hint: voided ? `${voided} voided` : undefined },
          { label: "Events recorded", value: String(detail.workspace.activity.items.length) },
        ]} />
        {detail.workspace.banner ? <p className="border-t border-divider pt-3 text-body text-muted">{detail.workspace.banner.meaning}</p> : null}
      </section>

      <section aria-labelledby="ready-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ready-h" className="text-entity font-medium">Readiness checks</h2>
          {readiness.data ? <span className="text-label text-muted">{passed} of {checks.length} pass</span> : null}
        </div>
        <p className="text-body text-muted">These are the checks the console makes before a session can be marked ready. Ready means the application records are consistent. No participant has signed, authorized or settled anything.</p>
        {readiness.isPending ? <Skeleton lines={4} /> : readiness.error ? <ErrorState title="Could not load the readiness checks" message={(readiness.error as Error).message} retry={<Button onClick={() => readiness.refetch()}>Try again</Button>} /> : (
          <ul className="divide-y divide-divider border-y border-divider" aria-label="Readiness checks">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 py-3">
                <span aria-hidden="true" className={`mt-1 size-3 shrink-0 ${c.ok ? "bg-ink" : "border border-ink"}`} />
                <span className="min-w-0">
                  <span className="block text-body font-medium">{c.label}<span className="sr-only">{c.ok ? ": passes" : ": does not pass yet"}</span></span>
                  {c.ok ? null : <span className="block text-body text-muted">{c.fix}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-h" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-h" className="text-entity font-medium">Recent activity</h2>
          <Link href={tab("activity")} className="inline-flex min-h-11 items-center text-body underline underline-offset-4">All activity</Link>
        </div>
        {recent.length === 0 ? <p className="flex min-h-[86px] items-center bg-tile px-4 text-body text-muted">Nothing has been recorded for this session yet.</p> : (
          <ul className="divide-y divide-divider border-y border-divider">
            {recent.map((e) => (
              <li key={`${e.at}-${e.kind}-${e.detail}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0"><span className="block text-body font-medium">{humanizeKind(e.kind)}</span><span className="block break-words text-body text-muted">{e.detail}</span><span className="block text-label text-muted">{e.actor}</span></span>
                <span title={formatDateTime(e.at)} className="text-label text-muted">{relativeTime(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
