"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { approvalNote, decisionStatusText } from "../../lib/approvals/rules.ts";
import { formatAmount, middle } from "../../lib/format.ts";
import { grossVsNet } from "../../lib/netting/group.ts";
import type { AuthorizationView, CalculationView, ObligationView } from "../../lib/tobin/types.ts";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { ErrorState, NotSupported, Skeleton } from "../ui/Feedback.tsx";
import { ApprovalBlock, type DecisionRow } from "../ui/Flow.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";

export const AUTH_LABEL: Record<AuthorizationView["state"], string> = {
  "no-calculation": "No calculation to review", stale: "The reviewed calculation is stale", "awaiting-review": "Awaiting review", approved: "Approved", rejected: "Rejected",
};

/**
 * The real review flow: ONE reviewer's decision on ONE exact calculation (not N of M). The decision record (ApprovalBlock, white) and the wallet-signature block
 * is in step 5 of the close-out (Not supported): they never share a row, a step or a button group. Approve and Reject live in the action panel as
 * separate confirmed dialogs, not in this tab.
 */
export function ApprovalsTab({ query, sessionId, obligations, calc }: { query: UseQueryResult<AuthorizationView>; sessionId: string; obligations: ObligationView[] | undefined; calc: CalculationView | undefined }) {
  const a = query.data;
  const c = calc?.calculation ?? null;
  const gn = c ? grossVsNet(c.gross, c.positions, calc?.currency === "current") : null;
  const active = (obligations ?? []).filter((o) => o.status === "active");
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

      <Card>
        <h2 className="text-entity font-medium">What is being reviewed</h2>
        <p className="mt-1 text-body text-muted">The calculation and the obligations behind it, so the decision is made on what is in front of the reviewer.</p>
        <div className="mt-3 space-y-4">
          {c && gn ? (
            <StatGrid columns={3} items={[
              { label: "Gross obligations", value: formatAmount(c.gross, c.asset) },
              { label: "Net that moves", value: formatAmount(gn.net, c.asset), hint: gn.reduction !== null ? `Netting removes ${formatAmount(gn.reduction, c.asset)}` : "Stale: not a current result" },
              { label: "Participants", value: c.positions.length },
            ]} />
          ) : <p className="text-body text-muted">No calculation exists yet.</p>}
          {active.length > 0 ? (
            <ul className="divide-y divide-divider" aria-label="Obligations under review">
              {active.map((o) => <li key={o.id} className="flex justify-between gap-3 py-2 text-body"><span>{o.debtorName} owes {o.creditorName}</span><span className="num whitespace-nowrap">{formatAmount(o.amount, o.asset)}</span></li>)}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/sessions/${sessionId}?tab=netting`} variant="quiet">Open netting</ButtonLink>
            <ButtonLink href={`/sessions/${sessionId}?tab=obligations`} variant="quiet">Open obligations</ButtonLink>
          </div>
        </div>
      </Card>

      <ApprovalBlock decisions={rows} note={approvalNote(a?.decisions ?? [])} />

      <NotSupported tone="card" feature="N-of-M approval" reason="The backend records one reviewer's decision on one calculation. There is no approval threshold or multi-party quorum." />

    </div>
  );
}
