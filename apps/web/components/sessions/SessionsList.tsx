"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { can } from "../../lib/permissions/can.ts";
import { formatDate, formatDateTime, relativeTime } from "../../lib/format.ts";
import { applyQuery, filterByState, PAGE_SIZE, STATUS_FILTERS, type SortKey, type StatusFilter } from "../../lib/sessions/list.ts";
import { client } from "../../lib/tobin/index.ts";
import type { SessionRow, WorkflowState } from "../../lib/tobin/types.ts";
import { GrainBanner } from "../shell/GrainBanner.tsx";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { ListTile } from "../tobin/ListTile.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { SelectField, TextField } from "../ui/Form.tsx";
import { Banner } from "../ui/Surfaces.tsx";
import { useListQuery } from "./shared.tsx";

const STATE_LABEL: Record<WorkflowState, string> = { configuring: "Being configured", ready: "Marked ready", closed: "Closed" };
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All states" },
  ...STATUS_FILTERS.filter((s): s is WorkflowState => s !== "all").map((s) => ({ value: s, label: STATE_LABEL[s] })),
];
const SORT_CHOICES: { value: string; label: string }[] = [
  { value: "created:desc", label: "Created: newest first" },
  { value: "created:asc", label: "Created: oldest first" },
  { value: "label:asc", label: "Name: A to Z" },
  { value: "label:desc", label: "Name: Z to A" },
  { value: "activity:desc", label: "Last activity: newest first" },
  { value: "activity:asc", label: "Last activity: oldest first" },
];

export function SessionsList() {
  const { org, actor } = useWorkspace();
  const params = useSearchParams();
  const [query, setQuery] = useListQuery();
  const [text, setText] = useState(query.q);
  const q = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id) });
  const result = useMemo(() => (q.data ? applyQuery(q.data, { ...query, provenance: "all" }) : null), [q.data, query]);
  const create = can(actor, "sessions.create");
  const open = (r: SessionRow) => `/sessions/${r.sessionId}`;

  // The workflow state is not in the list response. It is read for the rows on this page only (one request each, cached and shared with the workspace),
  // and it is labelled Derived. That is the whole per-row cost of this page.
  const page = useMemo(() => result?.rows ?? [], [result]);
  const stateQs = useQueries({ queries: page.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "detail"], queryFn: () => client.sessions.get(org.id, r.sessionId), staleTime: 60_000, retry: false })) });
  const states = useMemo(() => Object.fromEntries(page.map((r, i) => [r.sessionId, stateQs[i]?.data?.workflow])) as Record<string, WorkflowState | undefined>, [page, stateQs]);
  const stateText = (r: SessionRow): string => { const i = page.findIndex((v) => v.sessionId === r.sessionId); const s = stateQs[i]; return s?.data ? STATE_LABEL[s.data.workflow] : s?.isError ? "No data" : "Reading…"; };
  const shown = useMemo(() => filterByState(page, states, query.status), [page, states, query.status]);
  const filtering = query.q !== "" || query.hasActivity || query.status !== "all";
  const switched = params.get("notice") === "org-changed";

  const createAction = create.allowed
    ? <ButtonLink href="/sessions/new" variant="primary">Create session</ButtonLink>
    : <Button variant="primary" disabled aria-describedby="create-reason">Create session</Button>;

  const cols: Col<SessionRow>[] = [
    { id: "label", header: "Session", sortable: true, cell: (r) => <Link href={open(r)} className="block max-md:py-2"><span className="block font-medium">{r.label}</span><span className="block font-mono text-ident text-muted">{r.shortId}</span></Link> },
    { id: "state", header: "State (derived)", cell: (r) => <span className="whitespace-nowrap">{stateText(r)}</span> },
    { id: "activity", header: "Last activity", sortable: true, cell: (r) => (r.lastActivity ? <span title={formatDateTime(r.lastActivity)} className="whitespace-nowrap text-muted">{relativeTime(r.lastActivity)} · {r.activityCount} event{r.activityCount === 1 ? "" : "s"}</span> : <span className="text-muted">No activity</span>) },
    { id: "created", header: "Created", sortable: true, cell: (r) => <span title={formatDateTime(r.createdAt)} className="whitespace-nowrap text-muted">{formatDate(r.createdAt)}</span> },
    { id: "open", header: "", align: "right", cell: (r) => <ButtonLink href={open(r)} variant="quiet" aria-label={`Open ${r.label}`}>Open</ButtonLink> },
  ];

  return (
    <PageFrame title="Clearing Sessions" breadcrumbs={[{ label: org.name }, { label: "Sessions" }]} actions={createAction} banner={<GrainBanner label="Sessions" count={q.data && !q.error ? q.data.length : null} />}>
      {!create.allowed ? <p id="create-reason" className="-mt-3 mb-4 text-label text-muted" role="note">{create.reason} Creating a session needs the Admin role.</p> : null}
      {switched ? <div className="mb-4"><Banner role="status">You switched organization, so the session you had open is not shown. It belongs to the previous organization. These are the sessions of {org.name}.</Banner></div> : null}

      <form role="search" aria-label="Filter sessions" onSubmit={(e) => e.preventDefault()} className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_260px]">
        <TextField id="session-search" label="Search" type="search" placeholder="Name or session id" value={text} onChange={(e) => { setText(e.target.value); setQuery({ q: e.target.value }); }} />
        <SelectField id="session-status" label="Status (derived)" value={query.status} hint="Applies to the rows on this page" aria-describedby="status-hint" onChange={(e) => setQuery({ status: e.target.value as StatusFilter })}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
        <SelectField id="session-sort" label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(":"); setQuery({ sort: sort as SortKey, dir: dir === "asc" ? "asc" : "desc" }); }}>
          {SORT_CHOICES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
      </form>
      <p id="status-hint" className="-mt-2 mb-4 text-label text-muted">The list does not carry the workflow state, so it is read for the rows on this page only. Search and sort run over all {q.data?.length ?? "the"} sessions the server returned.</p>

      {q.isLoading ? (
        <ul aria-busy="true" aria-label="Loading sessions" className="space-y-2">{Array.from({ length: 4 }, (_, i) => <li key={i}><Skeleton className="h-[86px] w-full" /></li>)}</ul>
      ) : q.error ? (
        <ErrorState title="Could not load sessions" message={(q.error as Error).message} retry={<Button onClick={() => q.refetch()}>Try again</Button>} />
      ) : result && result.total === 0 ? (
        <EmptyState title="No sessions yet" message="A clearing session collects the obligations of its participants so they can be netted. Sessions you create are local drafts: they are not on-chain." action={create.allowed ? <ButtonLink href="/sessions/new" variant="primary">Create session</ButtonLink> : null} />
      ) : result && result.matched === 0 ? (
        <EmptyState title="No sessions match" message={`None of the ${result.total} sessions match these filters.`} action={filtering ? <Button onClick={() => { setText(""); setQuery({ q: "", status: "all", hasActivity: false }); }}>Clear filters</Button> : null} />
      ) : result ? (
        <>
          <div className="hidden min-[900px]:block">
            <Table columns={cols} data={shown.rows} getRowId={(r) => r.sessionId} empty={null}
              sort={{ id: query.sort === "created" ? "created" : query.sort === "label" ? "label" : "activity", dir: query.dir }}
              onSortChange={(s) => setQuery({ sort: s.id as SortKey, dir: s.dir })} />
          </div>
          <ul className="space-y-2 min-[900px]:hidden" aria-label="Sessions">
            {shown.rows.map((r) => (
              <ListTile key={r.sessionId} identifier={r.label} tag={stateText(r)} title={<span className="font-mono text-ident">{r.shortId}</span>}
                chips={[`Created ${formatDate(r.createdAt)}`, r.lastActivity ? `${relativeTime(r.lastActivity)} · ${r.activityCount} event${r.activityCount === 1 ? "" : "s"}` : "No activity"]} href={open(r)} action="Open" actionLabel={`Open ${r.label}`} />
            ))}
          </ul>
          {query.status !== "all" ? <p className="mt-3 text-label text-muted">{shown.rows.length} of the {page.length} rows on this page are {STATE_LABEL[query.status as WorkflowState].toLowerCase()}{shown.unknown ? `; the state of ${shown.unknown} could not be read yet` : ""}.</p> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-body text-muted">
            <span>Showing {(result.page - 1) * PAGE_SIZE + 1} to {Math.min(result.page * PAGE_SIZE, result.matched)} of {result.matched}{filtering ? ` matching (${result.total} in total)` : ""}</span>
            <span className="flex gap-2">
              <Button disabled={result.page <= 1} onClick={() => setQuery({ page: result.page - 1 })}>Previous</Button>
              <Button disabled={result.page >= result.pages} onClick={() => setQuery({ page: result.page + 1 })}>Next</Button>
            </span>
          </div>
        </>
      ) : null}
    </PageFrame>
  );
}
