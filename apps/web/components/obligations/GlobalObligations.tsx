"use client";

import { Task01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { deriveGlobalObligations, type GlobalObligation } from "../../lib/derived/obligations.ts";
import { formatDate } from "../../lib/format.ts";
import { useCrossSession } from "../data/useCrossSession.tsx";
import { DetailSheet } from "../tobin/Overlays.tsx";
import { ObligationDetail } from "./ObligationDetail.tsx";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button } from "../ui/Button.tsx";
import { Amount, Identifier, SegmentTabs, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, StatusMark } from "../ui/Feedback.tsx";
import { SelectField, TextField } from "../ui/Form.tsx";
import { Card, Panel } from "../ui/Surfaces.tsx";

const PAGE = 15;

/** Obligations across sessions, DERIVED from per-session reads (decision D6): capped, and always labelled with "Showing N of M sessions". */
export function GlobalObligations() {
  const { org } = useWorkspace();
  const cs = useCrossSession({ parts: ["obligations", "detail"] });
  const reading = cs.listLoading || (cs.reading && cs.bundles.length === 0);
  const derived = useMemo(
    () => (cs.rows ? deriveGlobalObligations(cs.rows, cs.bundles.map((b) => ({ row: b.row, ...(b.obligations ? { obligations: b.obligations } : {}), failed: b.failed || !b.obligations })), cs.cap) : null),
    [cs.rows, cs.bundles, cs.cap],
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "voided">("all");
  const [asset, setAsset] = useState("");
  const [page, setPage] = useState(1);
  const items = derived?.items ?? [];
  const assets = [...new Set(items.map((i) => i.asset))].sort();
  const filtered = items.filter((o) => (status === "all" || o.status === status) && (!sessionId || o.sessionId === sessionId) && (!asset || o.asset === asset) && (!search.trim() || `${o.reference ?? ""} ${o.debtorName} ${o.creditorName} ${o.sessionLabel}`.toLowerCase().includes(search.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);

  const cols: Col<GlobalObligation>[] = [
    { id: "session", header: "Session", cell: (r) => <button type="button" onClick={() => setOpenKey(r.sessionId + ":" + r.id)} className="inline-flex font-medium underline-offset-2 hover:underline max-md:min-h-11 max-md:items-center text-left" aria-label={`Open obligation, ${r.debtorName} to ${r.creditorName}, session ${r.sessionLabel}`}>{r.sessionLabel}</button> },
    { id: "oid", header: "Obligation", cell: (r) => <Identifier value={r.id} head={6} tail={4} />, hideBelow: "md" },
    { id: "debtor", header: "Debtor", cell: (r) => <span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.debtorName}</span> },
    { id: "creditor", header: "Creditor", cell: (r) => <span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.creditorName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} asset={r.asset} /> },
    { id: "status", header: "Status", cell: (r) => <StatusMark kind={r.status === "active" ? "done" : "unsupported"}>{r.status === "active" ? "Active" : "Voided"}</StatusMark> },
    { id: "created", header: "Recorded", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.createdAt)}</span>, hideBelow: "md" },
  ];

  return (
    <PageFrame title="Obligations" breadcrumbs={[{ label: org.name }, { label: "Obligations" }]}>
      {cs.listError ? (
        <ErrorState title="Could not load sessions" message={cs.listError.message} retry={<Button onClick={() => window.location.reload()}>Try again</Button>} />
      ) : (
        <Panel className="space-y-4">
          <Card>
            <p className="text-body text-muted">Obligations across your sessions, newest first. Recording and voiding happen inside a session, on its Obligations tab.</p>
            <p className="mt-2 text-label text-muted" data-testid="obligations-coverage">{cs.coverage.text}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_220px]">
              <TextField id="gob-search" label="Search reference, participant or session" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              <SelectField id="gob-asset" label="Asset" value={asset} onChange={(e) => { setAsset(e.target.value); setPage(1); }}>
                <option value="">All assets</option>
                {assets.map((a) => <option key={a} value={a}>{a}</option>)}
              </SelectField>
              <SelectField id="gob-session" label="Session" value={sessionId} onChange={(e) => { setSessionId(e.target.value); setPage(1); }}>
                <option value="">All sessions read</option>
                {cs.window.map((r) => <option key={r.sessionId} value={r.sessionId}>{r.label}</option>)}
              </SelectField>
            </div>
            <div className="mt-3"><SegmentTabs label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "voided", label: "Voided" }]} /></div>
          </Card>

          {reading || shown.length === 0 ? (
            <Table columns={cols} data={shown} getRowId={(r) => r.id} loading={reading} empty={<EmptyState title={items.length === 0 ? "No obligations yet" : "No obligations match"} message={items.length === 0 ? "None are recorded in the sessions read. Open a session and record one." : "Change the search or the filters."} />} />
          ) : (
            <>
              <div className="hidden min-[900px]:block"><Table columns={cols} data={shown} getRowId={(r) => r.id} empty={null} /></div>
              <ul className="space-y-3 min-[900px]:hidden" aria-label="Obligations">
                {shown.map((r) => (
                  <li key={r.id} className="rounded-card bg-card p-4">
                    <button type="button" onClick={() => setOpenKey(r.sessionId + ":" + r.id)} className="inline-flex min-h-11 items-center text-entity font-medium text-left" aria-label={`Open obligation, ${r.debtorName} to ${r.creditorName}, session ${r.sessionLabel}`}>{r.sessionLabel}</button>
                    <p className="mt-1 text-body"><span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.debtorName} owes {r.creditorName}</span></p>
                    <p className="mt-1 text-action font-medium"><Amount value={r.amount} asset={r.asset} /></p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body">
                      <div><dt className="text-label text-muted">Status</dt><dd><StatusMark kind={r.status === "active" ? "done" : "unsupported"}>{r.status === "active" ? "Active" : "Voided"}</StatusMark></dd></div>
                      <div><dt className="text-label text-muted">Recorded</dt><dd>{formatDate(r.createdAt)}</dd></div>
                      {r.reference ? <div className="col-span-2"><dt className="text-label text-muted">Reference</dt><dd>{r.reference}</dd></div> : null}
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}

          {derived && derived.totals.length > 0 ? (
            <Card>
              <h2 className="text-entity font-medium">Active totals by asset</h2>
              <ul className="mt-2 divide-y divide-divider">
                {derived.totals.map((t) => <li key={t.asset} className="flex justify-between py-2 text-body"><span>{t.asset}</span><span className="num">{t.label}</span></li>)}
              </ul>
              <p className="mt-2 text-label text-muted">Derived from the sessions read ({cs.coverage.text}) . One line per asset: amounts in different assets are never added together.</p>
            </Card>
          ) : null}

          {filtered.length > PAGE ? (
            <div className="flex items-center justify-between text-body text-muted">
              <span>Showing {(Math.min(page, pages) - 1) * PAGE + 1} to {Math.min(Math.min(page, pages) * PAGE, filtered.length)} of {filtered.length}</span>
              <span className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></span>
            </div>
          ) : null}
          {cs.canLoadMore ? <Button variant="quiet" onClick={cs.loadNext}>Load next 10 sessions</Button> : null}
          <GlobalSheet openKey={openKey} onClose={() => setOpenKey(null)} items={items} bundles={cs.bundles} />
        </Panel>
      )}
    </PageFrame>
  );
}

/** The same detail sheet as the workspace tab, without Void: nothing is recorded or voided from this page. */
function GlobalSheet({ openKey, onClose, items, bundles }: { openKey: string | null; onClose: () => void; items: GlobalObligation[]; bundles: ReturnType<typeof useCrossSession>["bundles"] }) {
  const selected = openKey ? items.find((o) => o.sessionId + ":" + o.id === openKey) ?? null : null;
  const bundle = selected ? bundles.find((b) => b.row.sessionId === selected.sessionId) : undefined;
  return (
    <DetailSheet open={!!selected} onClose={onClose} title="Obligation" icon={Task01Icon}>
      {selected ? (
        <ObligationDetail
          selected={selected}
          all={bundle?.obligations ?? [selected]}
          activity={bundle?.detail?.workspace.activity.items ?? []}
          footer={<p className="text-body text-muted">Session: <a className="underline" href={`/sessions/${selected.sessionId}?tab=obligations`}>{selected.sessionLabel}</a>. Recording and voiding happen in the session.</p>}
        />
      ) : null}
    </DetailSheet>
  );
}
