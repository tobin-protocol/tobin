"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { can } from "../../lib/permissions/can.ts";
import { formatDate, formatDateTime, relativeTime } from "../../lib/format.ts";
import { applyQuery, PAGE_SIZE, type ProvenanceFilter, type SortKey } from "../../lib/sessions/list.ts";
import { client } from "../../lib/tobin/index.ts";
import type { SessionRow } from "../../lib/tobin/types.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { Panel } from "../ui/Surfaces.tsx";
import { Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { SelectField, TextField } from "../ui/Form.tsx";
import { SegmentTabs } from "../ui/Data.tsx";
import { useListQuery } from "./shared.tsx";

const PROVENANCE_OPTIONS: { value: ProvenanceFilter; label: string }[] = [
  { value: "all", label: "All records" },
  { value: "local-draft", label: "Local draft" },
  { value: "fixture", label: "Fixture" },
  { value: "chain-read", label: "Chain read" },
  { value: "chain-confirmed", label: "Chain confirmed" },
];
const SORT_CHOICES: { value: string; label: string }[] = [
  { value: "created:desc", label: "Created: newest first" },
  { value: "created:asc", label: "Created: oldest first" },
  { value: "label:asc", label: "Name: A to Z" },
  { value: "label:desc", label: "Name: Z to A" },
  { value: "activity:desc", label: "Last activity: newest first" },
  { value: "activity:asc", label: "Last activity: oldest first" },
];
/** Quick filters that need the workflow, calculation or approval state. The list endpoint does not carry them (docs/web-app-plan.md section 5a). */
const UNSUPPORTED_QUICK = ["Awaiting my review", "Calculation stale", "Marked ready"] as const;

const STATE_LABEL = { configuring: "Being configured", ready: "Marked ready", closed: "Closed" } as const;
const columns = (onOpen: (r: SessionRow) => string, state: (r: SessionRow) => string, counts: (r: SessionRow) => { participants: string; obligations: string }): Col<SessionRow>[] => [
  { id: "label", header: "Session", sortable: true, cell: (r) => <Link href={onOpen(r)} className="block max-md:py-2"><span className="block font-medium">{r.label}</span><span className="block font-mono text-ident text-muted">{r.shortId}</span></Link> },
  { id: "state", header: "State (derived)", cell: (r) => <span className="whitespace-nowrap">{state(r)}</span> },
  { id: "contents", header: "Contents (derived)", cell: (r) => { const c = counts(r); return <span><span className="block whitespace-nowrap">{c.participants}</span><span className="block whitespace-nowrap text-muted">{c.obligations}</span></span>; } },
  { id: "activity", header: "Last activity", sortable: true, cell: (r) => (r.lastActivity ? <span title={formatDateTime(r.lastActivity)} className="whitespace-nowrap text-muted">{relativeTime(r.lastActivity)} · {r.activityCount} event{r.activityCount === 1 ? "" : "s"}</span> : <span className="text-muted">No data</span>) },
  { id: "created", header: "Created", sortable: true, cell: (r) => <span title={formatDateTime(r.createdAt)} className="whitespace-nowrap text-muted">{formatDate(r.createdAt)}</span> },
  { id: "open", header: "", align: "right", cell: (r) => <ButtonLink href={onOpen(r)} variant="quiet">Open</ButtonLink> },
];

export function SessionsList() {
  const { org, actor } = useWorkspace();
  const [query, setQuery] = useListQuery();
  // the search box keeps its own text so typing is never overwritten by the URL round trip
  const [text, setText] = useState(query.q);
  const q = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id) });
  const result = useMemo(() => (q.data ? applyQuery(q.data, query) : null), [q.data, query]);
  const create = can(actor, "sessions.create");
  const open = (r: SessionRow) => `/sessions/${r.sessionId}`;
  // workflow state is not in the list response: read it for the VISIBLE rows only (cached; shared with the workspace), labelled Derived
  const visible = result?.rows ?? [];
  const stateQs = useQueries({ queries: visible.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "detail"], queryFn: () => client.sessions.get(org.id, r.sessionId), staleTime: 60_000, retry: false })) });
  const stateOf = (r: SessionRow): string => { const i = visible.findIndex((v) => v.sessionId === r.sessionId); const q = stateQs[i]; return q?.data ? STATE_LABEL[q.data.workflow] : q?.isError ? "No data" : "Reading…"; };
  // what is inside each visible session: two more cached reads per visible row, shared with the workspace, never for off-screen rows
  const pQs = useQueries({ queries: visible.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "participants"], queryFn: () => client.participants.list(org.id, r.sessionId), staleTime: 60_000, retry: false })) });
  const oQs = useQueries({ queries: visible.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "obligations"], queryFn: () => client.obligations.listBySession(org.id, r.sessionId), staleTime: 60_000, retry: false })) });
  const countsOf = (r: SessionRow): { participants: string; obligations: string } => {
    const i = visible.findIndex((v) => v.sessionId === r.sessionId);
    const p = pQs[i]; const o = oQs[i];
    const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
    return {
      participants: p?.data ? n(p.data.filter((x) => x.status === "active").length, "participant", "participants") : p?.isError ? "No data" : "Reading…",
      obligations: o?.data ? n(o.data.filter((x) => x.status === "active").length, "obligation", "obligations") : o?.isError ? "No data" : "Reading…",
    };
  };
  const cols = columns(open, stateOf, countsOf);
  const filtering = query.q !== "" || query.provenance !== "all" || query.hasActivity;

  const createAction = create.allowed
    ? <ButtonLink href="/sessions/new" variant="primary">Create session</ButtonLink>
    : <Button variant="primary" disabled title={create.reason ?? undefined}>Create session</Button>;

  return (
    <PageFrame title="Clearing Sessions" breadcrumbs={[{ label: org.name }, { label: "Clearing Sessions" }]} actions={createAction}>
      {!create.allowed ? <p className="-mt-3 mb-4 text-label text-muted" role="note">{create.reason} Creating a session needs the Admin role.</p> : null}

      <div className="mb-4 rounded-panel bg-panel p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_260px]">
          <TextField id="session-search" label="Search sessions" type="search" placeholder="Name or session id" value={text} onChange={(e) => { setText(e.target.value); setQuery({ q: e.target.value }); }} />
          <SelectField id="session-record" label="Record" value={query.provenance} onChange={(e) => setQuery({ provenance: e.target.value as ProvenanceFilter })}>
            {PROVENANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
          <SelectField id="session-sort" label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(":"); setQuery({ sort: sort as SortKey, dir: dir as "asc" | "desc" }); }}>
            {SORT_CHOICES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Quick filters" role="group">
          <SegmentTabs label="Quick filters" value={query.hasActivity ? "activity" : "all"} onChange={(v) => setQuery({ hasActivity: v === "activity" })} items={[{ value: "all", label: "All" }, { value: "activity", label: "Has activity" }]} />
          {UNSUPPORTED_QUICK.map((l) => (
            <button key={l} type="button" disabled title="Not supported: the session list does not report this state" className="h-9 rounded-btn bg-ink-5 px-3 text-body font-medium text-disabled disabled:cursor-not-allowed">{l}</button>
          ))}
        </div>
        <p className="mt-2 text-label text-muted">
          Not supported: filters by workflow, calculation or approval state. The session list does not carry them. Search, filters and sorting run in this browser over all sessions the server returned.
        </p>
      </div>

      {q.isLoading ? (
        <div className="space-y-px" role="status" aria-busy="true" aria-label="Loading sessions">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : q.error ? (
        <ErrorState title="Could not load sessions" message={(q.error as Error).message} retry={<Button onClick={() => q.refetch()}>Try again</Button>} />
      ) : result && result.total === 0 ? (
        <EmptyState title="No sessions yet" message="A clearing session collects the obligations of its participants so they can be netted. Sessions you create are local drafts: they are not on-chain." action={create.allowed ? <ButtonLink href="/sessions/new" variant="quiet">Create session</ButtonLink> : undefined} />
      ) : result && result.matched === 0 ? (
        <EmptyState title="No sessions match" message={`None of the ${result.total} sessions match these filters.`} action={filtering ? <Button onClick={() => { setText(""); setQuery({ q: "", provenance: "all", hasActivity: false }); }}>Clear filters</Button> : undefined} />
      ) : result ? (
        <>
          <Panel className="p-3 sm:p-4">
          <div className="hidden min-[900px]:block">
            <Table columns={cols} data={result.rows} getRowId={(r) => r.sessionId} empty={null}
              sort={{ id: query.sort === "created" ? "created" : query.sort === "label" ? "label" : "activity", dir: query.dir }}
              onSortChange={(s) => setQuery({ sort: s.id as SortKey, dir: s.dir })} />
          </div>
          <ul className="space-y-3 min-[900px]:hidden" aria-label="Sessions">
            {result.rows.map((r) => (
              <li key={r.sessionId} className="rounded-card bg-card p-4">
                <Link href={open(r)} className="block max-md:min-h-11">
                  <span className="block text-entity font-medium">{r.label}</span>
                  <span className="mt-0.5 block font-mono text-ident text-muted">{r.shortId}</span>
                </Link>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body">
                  <div><dt className="text-label text-muted">State (derived)</dt><dd>{stateOf(r)}</dd></div>
                  <div><dt className="text-label text-muted">Contents (derived)</dt><dd>{countsOf(r).participants}<span className="block text-muted">{countsOf(r).obligations}</span></dd></div>
                  <div><dt className="text-label text-muted">Record</dt><dd>{r.provenanceLabel}<span className="block text-label text-muted">Application record</span></dd></div>
                  <div><dt className="text-label text-muted">Created</dt><dd>{formatDateTime(r.createdAt)}</dd></div>
                  <div className="col-span-2"><dt className="text-label text-muted">Last activity</dt><dd>{r.lastActivity ? `${relativeTime(r.lastActivity)} · ${r.activityCount} event${r.activityCount === 1 ? "" : "s"}` : "No data"}</dd></div>
                </dl>
                <ButtonLink href={open(r)} variant="quiet" className="mt-3 w-full">Open</ButtonLink>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-body text-muted">
            <span>Showing {(result.page - 1) * PAGE_SIZE + 1} to {Math.min(result.page * PAGE_SIZE, result.matched)} of {result.matched}{filtering ? ` matching (${result.total} in total)` : ""}</span>
            <span className="flex gap-2">
              <Button disabled={result.page <= 1} onClick={() => setQuery({ page: result.page - 1 })}>Previous</Button>
              <Button disabled={result.page >= result.pages} onClick={() => setQuery({ page: result.page + 1 })}>Next</Button>
            </span>
          </div>
          </Panel>
        </>
      ) : null}
    </PageFrame>
  );
}
