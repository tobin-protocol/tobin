"use client";

import { type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { can } from "../../lib/permissions/can.ts";
import { formatAmount } from "../../lib/format.ts";
import { totalsByAsset } from "../../lib/netting/group.ts";
import { useSearchParams } from "next/navigation";
import { Task01Icon } from "@hugeicons/core-free-icons";
import { voidGate } from "../../lib/obligations/rules.ts";
import { client } from "../../lib/tobin/index.ts";
import type { ActivityItem, ObligationView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { Amount, SegmentTabs, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, InlineError, StatusMark } from "../ui/Feedback.tsx";
import { TextField } from "../ui/Form.tsx";
import { Confirm as Dialog, DetailSheet as SidePanel } from "../tobin/Overlays.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";
import { ObligationDetail } from "./ObligationDetail.tsx";

type StatusFilter = "all" | "active" | "voided";

export function ObligationsTab({ sessionId, query, workflow, activity, onChanged }: {
  sessionId: string; query: UseQueryResult<ObligationView[]>; workflow: "configuring" | "ready" | "closed"; activity: ActivityItem[]; onChanged: () => Promise<unknown>;
}) {
  const { org, actor } = useWorkspace();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  // the global Obligations page links here with ?ob=<id> to open that obligation
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => params.get("ob"));
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

      <SidePanel open={!!selected} onClose={() => setOpenId(null)} title="Obligation" icon={Task01Icon}>
        {selected ? (
          <ObligationDetail selected={selected} all={all} activity={activity} footer={<>
            {(() => {
              const g = voidGate({ adminAllowed: voidAllowed.allowed, adminReason: voidAllowed.reason, workflow, status: selected.status });
              if (selected.status !== "active") return null;
              return g.allowed
                ? <Button variant="destructive" onClick={() => { setError(null); setVoiding(true); }}>Void obligation</Button>
                : <p className="text-body text-muted" role="note">{g.reason}</p>;
            })()}
            <p className="text-label text-muted">An obligation cannot be edited or deleted here. Voiding keeps the record and adds its own history entry.</p>
          </>} />
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
