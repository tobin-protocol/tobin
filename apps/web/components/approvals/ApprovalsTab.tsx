"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { approvalNote, decisionStatusText } from "../../lib/approvals/rules.ts";
import { middle } from "../../lib/format.ts";
import type { AuthorizationView } from "../../lib/tobin/types.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorState, NotSupported, Skeleton } from "../ui/Feedback.tsx";
import { ApprovalBlock, SignatureBlock, type DecisionRow } from "../ui/Flow.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";

export const AUTH_LABEL: Record<AuthorizationView["state"], string> = {
  "no-calculation": "No calculation to review", stale: "The reviewed calculation is stale", "awaiting-review": "Awaiting review", approved: "Approved", rejected: "Rejected",
};

/**
 * The real review flow: ONE reviewer's decision on ONE exact calculation (not N of M). The decision record (ApprovalBlock, white) and the wallet-signature block
 * (a #f0f0f0 card, Not supported) are separate sections: they never share a row or a button group. Approve and Reject live in the action panel as
 * separate confirmed dialogs, not in this tab.
 */
export function ApprovalsTab({ query }: { query: UseQueryResult<AuthorizationView> }) {
  const a = query.data;
  const rows: DecisionRow[] = (a?.decisions ?? []).map((d) => ({ id: d.id, reviewer: d.decidedBy, decision: d.decision, at: d.decidedAt, reason: d.reason || undefined, statusText: decisionStatusText(d.status) }));
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-entity font-medium">Review of the calculation</h2>
        <p className="mt-1 text-body text-muted">A reviewer approves or rejects one exact calculation. This is a decision recorded in Tobin.</p>
        <div className="mt-4">
          {query.isLoading ? <Skeleton lines={3} /> : query.error ? (
            <ErrorState title="Could not load the review state" message={(query.error as Error).message} retry={<Button onClick={() => query.refetch()}>Try again</Button>} />
          ) : a ? (
            <div className="space-y-3">
              <StatGrid columns={2} items={[
                { label: "State", value: AUTH_LABEL[a.state] },
                { label: "Calculation", value: a.calculationId ? middle(a.calculationId, 8, 6) : "No data" },
              ]} />
              {a.state === "awaiting-review" && !a.eligibility.canDecide && a.eligibility.reasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-body text-muted">{a.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <ApprovalBlock decisions={rows} note={approvalNote(a?.decisions ?? [])} />

      <NotSupported tone="card" feature="N-of-M approval" reason="The backend records one reviewer's decision on one calculation. There is no approval threshold or multi-party quorum." />

      <div><SignatureBlock signers={[]} threshold={0} /></div>
    </div>
  );
}
