"use client";

import { type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { can } from "../../lib/permissions/can.ts";
import { formatAmount, formatDateTime, humanizeKind } from "../../lib/format.ts";
import { totalsByAsset } from "../../lib/netting/group.ts";
import { historyOf } from "../../lib/obligations/rules.ts";
import { client } from "../../lib/tobin/index.ts";
import type { ActivityItem, ObligationView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { Amount, SegmentTabs, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, InlineError, StatusMark } from "../ui/Feedback.tsx";
import { TextField } from "../ui/Form.tsx";
import { Dialog, SidePanel } from "../ui/Overlays.tsx";
import { Card, DataCard, StatGrid } from "../ui/Surfaces.tsx";

type StatusFilter = "all" | "active" | "voided";

export function ObligationsTab({ sessionId, query, workflow, activity, onChanged }: {
  sessionId: string; query: UseQueryResult<ObligationView[]>; workflow: "configuring" | "ready" | "closed"; activity: ActivityItem[]; onChanged: () => Promise<unknown>;
}) {
  const { org, actor } = useWorkspace();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(() => {
    const n = search.trim().toLowerCase();
    return all.filter((o) => (status === "all" || o.status === status) && (!n || (o.reference ?? "").toLowerCase().includes(n) || o.debtorName.toLowerCase().includes(n) || o.creditorName.toLowerCase().includes(n)));
  }, [all, status, search]);
  const selected = all.find((o) => o.id === openId) ?? null;
  const totals = totalsByAsset(all);
  const voidAllowed = can(actor, "obligations.correct");

  const cols: Col<ObligationView>[] = [
    { id: "debtor", header: "Debtor", cell: (r) => <span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.debtorName}</span> },
    { id: "creditor", header: "Creditor", cell: (r) => <span className={r.status === "voided" ? "text-muted line-through" : ""}>{r.creditorName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} asset={r.asset} /> },
    { id: "ref", header: "Reference", cell: (r) => <span className="text-muted">{r.reference || "No data"}</span>, hideBelow: "md" },
    { id: "status", header: "Status", cell: (r) => <StatusMark kind={r.status === "active" ? "done" : "unsupported"}>{r.status === "active" ? "Active" : "Voided"}</StatusMark> },
    { id: "view", header: "", align: "right", cell: (r) => <Button variant="quiet" onClick={() => setOpenId(r.id)} aria-label={`View obligation ${r.debtorName} to ${r.creditorName}, ${formatAmount(r.amount, r.asset)}`}>View</Button> },
  ];

  const doVoid = async () => {
    if (!selected) return;
    setBusy(true); setError(null);
    try { await client.obligations.void(org.id, sessionId, selected.id, reason.trim() || undefined); setVoiding(false); setReason(""); await onChanged(); }
    catch (e) { setError(reasonOf(e)); setVoiding(false); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-entity font-medium">Obligations</h2>
        <p className="mt-1 text-body text-muted">Each obligation names a debtor, a creditor, an amount and an asset. The debtor owes the creditor. Application record only: recording one is not a payment and not a signature.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1"><TextField id="ob-search" label="Search by reference or participant" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <SegmentTabs label="Status" value={status} onChange={setStatus} items={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "voided", label: "Voided" }]} />
        </div>
        <div className="mt-4">
          <Table columns={cols} data={rows} getRowId={(r) => r.id} loading={query.isLoading} error={query.error ? (query.error as Error).message : null} onRetry={() => query.refetch()}
            empty={<EmptyState title={all.length === 0 ? "No obligations yet" : "No obligations match"} message={all.length === 0 ? "Record the first obligation in the panel. Obligations appear here once recorded." : "Change the search or the status filter."} />} />
        </div>
        {totals.length > 0 ? (
          <p className="mt-3 text-label text-muted">Active total, one line per asset (never added across assets): {totals.map((t) => t.label).join(" · ")}</p>
        ) : null}
      </Card>
      {error ? <InlineError>{error}</InlineError> : null}

      <SidePanel open={!!selected} onClose={() => setOpenId(null)} title="Obligation">
        {selected ? (
          <div className="space-y-4">
            <DataCard label={selected.status === "voided" ? "Amount (voided)" : "Amount"} value={<span className="break-words">{formatAmount(selected.amount, selected.asset)}</span>} note={`${selected.debtorName} owes ${selected.creditorName}`} />
            <div className="rounded-card bg-card p-4">
              <StatGrid columns={2} items={[
                { label: "Status", value: selected.status === "active" ? "Active" : "Voided" },
                { label: "Revision", value: selected.revision },
                { label: "Asset", value: selected.asset, hint: selected.assetIdentity === "canonical" ? "Supported asset identity" : "Code only, not an asset identity" },
                { label: "Reference", value: selected.reference || "No data" },
                { label: "Recorded by", value: selected.createdBy ?? "No data" },
                { label: "Recorded", value: formatDateTime(selected.createdAt) },
                { label: "Last changed by", value: selected.updatedBy ?? "No data" },
                { label: "Last changed", value: formatDateTime(selected.updatedAt ?? selected.createdAt) },
              ]} />
              <p className="mt-3 break-all border-t border-divider pt-3 font-mono text-ident text-muted">{selected.id}</p>
            </div>
            <div className="rounded-card bg-card p-4">
              <h3 className="text-body font-medium">History</h3>
              {(() => {
                const h = historyOf(selected.id, activity);
                return h.length === 0 ? <p className="mt-1 text-body text-muted">No events are recorded for this obligation.</p> : (
                  <ol className="mt-2 divide-y divide-divider">
                    {h.map((e) => <li key={`${e.at}-${e.kind}`} className="py-2.5"><span className="block text-body font-medium">{humanizeKind(e.kind)}</span><span className="block text-body text-muted">{e.detail}</span><span className="block text-label text-muted">{e.actor} · {formatDateTime(e.at)}</span></li>)}
                  </ol>
                );
              })()}
            </div>
            {selected.status === "active" ? (
              voidAllowed.allowed && workflow === "configuring" ? (
                <Button variant="destructive" onClick={() => { setError(null); setVoiding(true); }}>Void obligation</Button>
              ) : <p className="text-body text-muted" role="note">{!voidAllowed.allowed ? voidAllowed.reason : workflow === "ready" ? "The session is marked ready. Obligations can only change while it is being configured." : "A closed session cannot change."}</p>
            ) : null}
            <p className="text-label text-muted">An obligation cannot be edited or deleted here. Voiding keeps the record and adds its own history entry.</p>
          </div>
        ) : null}
      </SidePanel>

      <Dialog open={voiding} onClose={() => setVoiding(false)} destructive title="Void this obligation?" description="It stays on record as voided and is no longer netted. This invalidates the current calculation and any review of it. A voided obligation cannot be changed again." primary={{ label: "Void obligation", onClick: doVoid, loading: busy }}>
        {selected ? (
          <div className="space-y-3">
            <div className="rounded-card bg-card p-4"><StatGrid columns={2} items={[{ label: "Debtor", value: selected.debtorName }, { label: "Creditor", value: selected.creditorName }, { label: "Amount", value: formatAmount(selected.amount, selected.asset) }]} /></div>
            <TextField id="void-reason" label="Reason (optional)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
