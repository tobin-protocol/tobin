"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { APPROVAL_NOTE, REASON_MAX, canSubmitReject, rejectReasonError } from "../../lib/approvals/rules.ts";
import { formatAmount, middle } from "../../lib/format.ts";
import { absAmount, grossVsNet } from "../../lib/netting/group.ts";
import { can } from "../../lib/permissions/can.ts";
import { client } from "../../lib/tobin/index.ts";
import type { AuthorizationView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { InlineError } from "../ui/Feedback.tsx";
import { TextAreaField } from "../ui/Form.tsx";
import { Dialog } from "../ui/Overlays.tsx";
import { Card, Panel, StatGrid } from "../ui/Surfaces.tsx";
import { AUTH_LABEL } from "./ApprovalsTab.tsx";

/**
 * Action panel of the Approvals tab. ONE primary action: Approve. Reject is a separate, quieter action. Each opens its own confirmation dialog, and Reject
 * cannot be confirmed without a reason. A user without the reviewer grant sees both disabled with the reason; the server still decides (it also enforces
 * separation of duties, and its refusal is shown as the reason).
 */
export function ReviewPanel({ sessionId, auth, onDecided }: { sessionId: string; auth: AuthorizationView; onDecided: () => Promise<unknown> }) {
  const { org, actor } = useWorkspace();
  const calc = useQuery({ queryKey: ["session", org.id, sessionId, "calculation"], queryFn: () => client.sessions.calculation(org.id, sessionId), retry: false });
  const [dialog, setDialog] = useState<null | "approve" | "reject">(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const awaiting = auth.state === "awaiting-review" && !!auth.calculationId;
  const local = can(actor, "authorization.decide");
  // the server's own eligibility is authoritative; the local helper only covers the moment before it has loaded
  const allowed = awaiting && auth.eligibility.canDecide && local.allowed;
  const why = !awaiting
    ? auth.state === "approved" ? "This calculation is approved. Settlement is prepared from it on the Settlement tab."
      : auth.state === "rejected" ? "This calculation was rejected. Change the inputs and calculate again to review a new one."
      : auth.state === "stale" ? "The calculation is stale. Calculate again before it can be reviewed."
      : "There is no calculation to review. Run netting first."
    : !local.allowed ? local.reason
    : auth.eligibility.reasons.length > 0 ? auth.eligibility.reasons.join(" ") : null;

  const c = calc.data?.calculation ?? null;
  const gn = c ? grossVsNet(c.gross, c.positions, calc.data?.currency === "current") : null;

  const close = () => { setDialog(null); setReason(""); setTouched(false); };
  const submit = async (kind: "approve" | "reject") => {
    if (!auth.calculationId) return;
    setBusy(true); setError(null);
    try {
      await client.authorization.decide(org.id, sessionId, kind, { calculationId: auth.calculationId, ...(kind === "reject" ? { reason: reason.trim() } : {}) });
      close(); await onDecided();
    } catch (e) { close(); setError(reasonOf(e)); await onDecided(); } finally { setBusy(false); }
  };

  const summary = (
    <div className="rounded-card bg-card p-4">
      <StatGrid columns={2} items={[
        { label: "Calculation", value: auth.calculationId ? middle(auth.calculationId, 8, 6) : "No data" },
        { label: "Asset", value: c?.asset ?? "No data" },
        { label: "Gross", value: c ? formatAmount(c.gross, c.asset) : "No data" },
        { label: "Net that moves", value: c && gn ? formatAmount(gn.net, c.asset) : "No data" },
      ]} />
      {c ? (
        <ul className="mt-3 divide-y divide-divider border-t border-divider">
          {c.positions.map((p) => <li key={p.userId} className="flex justify-between gap-3 py-2 text-body"><span>{p.name}</span><span className="num">{p.role === "flat" ? "Zero" : `${p.role === "debtor" ? "Pays" : "Receives"} ${formatAmount(absAmount(p.net), c.asset)}`}</span></li>)}
        </ul>
      ) : null}
    </div>
  );

  return (
    <Panel className="space-y-3" aria-label="Review the calculation">
      <Card>
        <p className="text-label uppercase tracking-wide text-muted">Review</p>
        <h2 className="mt-1 text-entity font-medium">{awaiting ? "Review the calculation" : AUTH_LABEL[auth.state]}</h2>
        <p className="mt-1 text-body text-muted">{awaiting ? "A reviewer approves or rejects this exact calculation." : "No decision can be recorded now."}</p>
        <div className="mt-3 space-y-2">
          {awaiting ? (<>
          <Button variant="primary" size="lg" disabled={!allowed} onClick={() => { setError(null); setDialog("approve"); }} aria-describedby={why ? "review-why" : undefined}>Approve</Button>
          <Button variant="destructive" disabled={!allowed} onClick={() => { setError(null); setDialog("reject"); }} className="w-full" aria-describedby={why ? "review-why" : undefined}>Reject</Button>
          </>) : null}
          {why ? <p id="review-why" className="text-body text-muted" role="note">{why}</p> : null}
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
        <p className="mt-3 text-label text-muted">{auth.state === "approved" ? APPROVAL_NOTE : "A decision here is recorded in Tobin only. Nothing is signed."}</p>
      </Card>

      <Dialog open={dialog === "approve"} onClose={close} title="Approve this calculation?" description="You approve exactly this calculation. If participants or obligations change afterwards, the approval no longer applies." primary={{ label: "Approve calculation", onClick: () => submit("approve"), loading: busy }}>
        {summary}
      </Dialog>

      <Dialog open={dialog === "reject"} onClose={close} destructive title="Reject this calculation?" description="The rejection and your reason are recorded. The calculation cannot then be approved; change the inputs and calculate again." primary={{ label: "Reject calculation", onClick: () => submit("reject"), loading: busy, disabled: !canSubmitReject(reason) }}>
        <div className="space-y-3">
          {summary}
          <TextAreaField id="reject-reason" label="Reason (required)" maxLength={REASON_MAX} value={reason} onChange={(e) => { setReason(e.target.value); setTouched(true); }} error={touched ? rejectReasonError(reason) ?? undefined : undefined} hint={`${reason.trim().length} of ${REASON_MAX} characters`} />
        </div>
      </Dialog>
    </Panel>
  );
}
