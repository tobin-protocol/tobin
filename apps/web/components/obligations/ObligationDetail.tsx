"use client";

import type { ReactNode } from "react";
import { formatAmount, formatDateTime, humanizeKind } from "../../lib/format.ts";
import { HISTORY_UNAVAILABLE, obligationHistory, transitionOf, transitionText } from "../../lib/obligations/rules.ts";
import type { ActivityItem, ObligationView } from "../../lib/tobin/types.ts";
import { DataCard, StatGrid } from "../ui/Surfaces.tsx";

/** The body of the obligation detail sheet. The workspace tab and the global Obligations page both render it, so the two sheets are the same. */
export function ObligationDetail({ selected, all, activity, footer }: { selected: ObligationView; all: ObligationView[]; activity: ActivityItem[]; footer?: ReactNode }) {
  return (
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
                const hist = obligationHistory(selected.id, all.map((o) => o.id), activity);
                if (hist.kind === "unavailable") return <p className="mt-1 text-body text-muted" role="note"><span className="font-medium text-ink">{HISTORY_UNAVAILABLE}.</span> {hist.reason}</p>;
                const h = hist.items;
                return h.length === 0 ? <p className="mt-1 text-body text-muted">No events are recorded for this obligation.</p> : (
                  <ol className="mt-2 divide-y divide-divider">
                    {h.map((e) => <li key={`${e.at}-${e.kind}`} className="py-2.5"><span className="block text-body font-medium">{humanizeKind(e.kind)}{transitionOf(e.kind) ? <span className="font-normal text-muted"> · {transitionText(transitionOf(e.kind)!)}</span> : null}</span><span className="block text-body text-muted">{e.detail}</span><span className="block text-label text-muted">{e.actor} · {formatDateTime(e.at)}</span></li>)}
                  </ol>
                );
              })()}
            </div>
      {footer}
    </div>
  );
}
