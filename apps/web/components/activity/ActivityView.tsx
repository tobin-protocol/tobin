"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { applyActivityFilter, eventKinds, NO_FILTER, type ActivityEntry, type ActivityFilter, type Outcome } from "../../lib/activity/derive.ts";
import { formatDateTime, humanizeKind, relativeTime } from "../../lib/format.ts";
import { entityOf } from "../../lib/activity/entity.ts";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { EmptyState, StatusMark } from "../ui/Feedback.tsx";
import { SelectField, TextField } from "../ui/Form.tsx";
import { SidePanel } from "../ui/Overlays.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";

const PAGE = 20;
const OUTCOMES: Outcome[] = ["Recorded", "Refused", "Rejected", "No longer applies"];
const markOf = (o: Outcome) => (o === "Recorded" ? "done" : o === "No longer applies" ? "unsupported" : "failed");

/**
 * A read-only list of recorded events, one component for the organization page (derived across sessions) and for one session's tab. There is no edit
 * affordance anywhere. The "result" is derived from the event kind (the backend returns none); the full record opens in a side panel.
 */
export function ActivityView({ entries, sessions, showSession }: { entries: ActivityEntry[]; sessions?: { id: string; label: string }[]; showSession: boolean }) {
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ActivityEntry | null>(null);
  const kinds = useMemo(() => eventKinds(entries), [entries]);
  const shown = useMemo(() => applyActivityFilter(entries, filter), [entries, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages);
  const slice = shown.slice((at - 1) * PAGE, at * PAGE);
  const set = (patch: Partial<ActivityFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(1); };
  const filtering = JSON.stringify(filter) !== JSON.stringify(NO_FILTER);

  return (
    <div className="space-y-4">
      <Card>
        <div className={`grid gap-3 sm:grid-cols-2 ${showSession ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          <SelectField id="act-kind" label="Event type" value={filter.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">All events</option>
            {kinds.map((k) => <option key={k} value={k}>{humanizeKind(k)}</option>)}
          </SelectField>
          {showSession ? (
            <SelectField id="act-session" label="Session" value={filter.sessionId} onChange={(e) => set({ sessionId: e.target.value })}>
              <option value="">All sessions read</option>
              {(sessions ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </SelectField>
          ) : null}
          <TextField id="act-from" label="From (UTC)" type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
          <TextField id="act-to" label="To (UTC)" type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
          <SelectField id="act-outcome" label="Result" hint="Derived from the event type" value={filter.outcome} onChange={(e) => set({ outcome: e.target.value as ActivityFilter["outcome"] })}>
            <option value="">Any result</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </SelectField>
        </div>
        {filtering ? <div className="mt-3"><Button variant="quiet" onClick={() => { setFilter(NO_FILTER); setPage(1); }}>Clear filters</Button></div> : null}
      </Card>

      {slice.length === 0 ? (
        <EmptyState title={entries.length === 0 ? "No activity yet" : "No activity matches"} message={entries.length === 0 ? "Nothing has been recorded in the sessions read." : "Change or clear the filters."} />
      ) : (
        <ul className="divide-y divide-divider rounded-card bg-card" aria-label="Activity">
          {slice.map((e) => (
            <li key={`${e.sessionId}-${e.at}-${e.kind}-${e.detail}`}>
              <button type="button" onClick={() => setOpen(e)} className="grid w-full min-h-14 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-ink-5 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,180px)_130px]" aria-label={`${humanizeKind(e.kind)}, ${e.actor}, ${relativeTime(e.at)}. Open the full record.`}>
                <span className="order-2 text-right text-label text-muted md:order-none md:text-left" title={formatDateTime(e.at)}>{relativeTime(e.at)}</span>
                <span className="order-1 min-w-0 md:order-none"><span className="block text-body font-medium">{humanizeKind(e.kind)}</span><span className="block truncate text-body text-muted">{e.actor} · {e.detail}</span></span>
                <span className="order-3 truncate text-body text-muted md:order-none">{showSession ? `${e.sessionLabel} · ` : ""}{entityOf(e.kind, e.sessionId).label}</span>
                <span className="order-4 md:order-none"><StatusMark kind={markOf(e.outcome)}>{e.outcome}</StatusMark></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown.length > PAGE ? (
        <div className="flex items-center justify-between text-body text-muted">
          <span>Showing {(at - 1) * PAGE + 1} to {Math.min(at * PAGE, shown.length)} of {shown.length}</span>
          <span className="flex gap-2"><Button disabled={at <= 1} onClick={() => setPage(at - 1)}>Previous</Button><Button disabled={at >= pages} onClick={() => setPage(at + 1)}>Next</Button></span>
        </div>
      ) : null}

      <SidePanel open={!!open} onClose={() => setOpen(null)} title="Activity record">
        {open ? (
          <div className="space-y-4">
            <div className="rounded-card bg-card p-4">
              <StatGrid columns={2} items={[
                { label: "When", value: formatDateTime(open.at) },
                { label: "Who", value: open.actor },
                { label: "Operation", value: humanizeKind(open.kind) },
                { label: "Result", value: open.outcome, hint: "Derived from the event type" },
              ]} />
              <p className="mt-3 break-all border-t border-divider pt-3 font-mono text-ident text-muted">{open.kind}</p>
            </div>
            <div className="rounded-card bg-card p-4">
              <h3 className="text-body font-medium">Detail</h3>
              <p className="mt-1 break-words text-body">{open.detail}</p>
            </div>
            <div className="rounded-card bg-card p-4">
              <h3 className="text-body font-medium">Session</h3>
              <p className="mt-1 text-body"><Link href={`/sessions/${open.sessionId}`} className="underline underline-offset-2">{open.sessionLabel}</Link></p>
              <div className="mt-3"><ButtonLink href={entityOf(open.kind, open.sessionId).href} variant="quiet">Open {entityOf(open.kind, open.sessionId).label.toLowerCase()}</ButtonLink></div>
            </div>
            <p className="text-label text-muted">Records are read-only. The backend keeps no transaction evidence or reference for an event, so none is shown.</p>
          </div>
        ) : null}
      </SidePanel>
    </div>
  );
}
