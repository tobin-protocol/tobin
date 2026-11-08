"use client";

import { useState } from "react";
import { APPROVAL_NOTE, REASON_MAX, canSubmitReject, rejectReasonError } from "../../lib/approvals/rules.ts";
import { formatAmount, middle } from "../../lib/format.ts";
import { can } from "../../lib/permissions/can.ts";
import { blocksApproval } from "../../lib/settlement/diff.ts";
import { client } from "../../lib/tobin/index.ts";
import { useWorkspace } from "../shell/session.tsx";
import { reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { InlineError } from "../ui/Feedback.tsx";
import { TextAreaField } from "../ui/Form.tsx";
import { Dialog } from "../ui/Overlays.tsx";
import { Card, Panel, StatGrid } from "../ui/Surfaces.tsx";
import type { SettlementData } from "./useSettlement.ts";

type StepState = "done" | "current" | "todo" | "unsupported";
function Steps({ items }: { items: { label: string; state: StepState }[] }) {
  return (
    <ol className="space-y-2" aria-label="Settlement steps">
      {items.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="flex items-center gap-2 text-body">
          <span aria-hidden="true" className={s.state === "done" ? "size-3 rounded-full bg-button" : s.state === "current" ? "size-3 rounded-full border-[4px] border-button" : "size-3 rounded-full border border-disabled"} />
          <span className={s.state === "unsupported" ? "text-muted" : s.state === "todo" ? "text-muted" : "font-medium"}>{i + 1}. {s.label}</span>
          {s.state === "unsupported" ? <span className="text-label text-muted">Not supported</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * The step-by-step panel of the Settlement tab. Only the steps the backend performs have actions: Prepare (admin) and Review (reviewer, never the preparer).
 * Sign, Submit and Verify are listed as Not supported. Approve and Reject are separate confirmed dialogs, Reject needs a reason, a mismatch between the
 * approved result and the prepared settlement blocks approval, and re-preparing after a rejection is its own confirmed action.
 */
export function SettlementPanel({ sessionId, s, workflow, onChanged }: { sessionId: string; s: SettlementData; workflow: "configuring" | "ready" | "closed"; onChanged: () => Promise<unknown> }) {
  const { org, actor } = useWorkspace();
  const [dialog, setDialog] = useState<null | "prepare" | "approve" | "reject">(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = s.list.data;
  const b = s.batch.data;
  const status = s.latest?.status;
  const live = status === "awaiting-review" || status === "approved";
  const prepareRole = can(actor, "settlement.prepare");
  const decideRole = can(actor, "settlement.decide");
  const preview = list?.preview;
  const firstFail = preview?.checks.find((c) => !c.ok);

  const prepareWhy = !prepareRole.allowed ? prepareRole.reason
    : workflow === "closed" ? "A closed session cannot change."
    : !preview ? "Reading what preparing needs."
    : !preview.ready ? (firstFail ? `${firstFail.label}: ${firstFail.detail}` : "Settlement cannot be prepared yet.") : null;
  const attempts = list && preview?.calculationId ? list.batches.filter((x) => x.calculationId === preview.calculationId).length : 0;

  const blocked = s.diff ? blocksApproval(s.diff) : false;
  const reviewWhy = !decideRole.allowed ? decideRole.reason
    : b && !b.eligibility.canDecide ? b.eligibility.reasons.join(" ") || "You cannot decide on this batch."
    : blocked ? "The prepared settlement does not match the approved result. Approval is blocked." : null;
  const canApprove = !!b && decideRole.allowed && b.eligibility.canDecide && !blocked;
  const canReject = !!b && decideRole.allowed && b.eligibility.canDecide;

  const close = () => { setDialog(null); setReason(""); setTouched(false); };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); close(); await onChanged(); } catch (e) { close(); setError(reasonOf(e)); await onChanged(); } finally { setBusy(false); }
  };
  const prepare = () => run(() => client.settlement.prepare(org.id, sessionId, { calculationId: preview!.calculationId as string, ...(attempts > 0 ? { attempt: attempts + 1 } : {}) }));
  const decide = (kind: "approve" | "reject") => run(() => client.settlement.decide(org.id, sessionId, s.latest!.id, kind, { instructionsHash: (b as NonNullable<typeof b>).batch.instructionsHash, ...(kind === "reject" ? { reason: reason.trim() } : {}) }));

  const steps: { label: string; state: StepState }[] = [
    { label: "Prepare", state: live || status === "rejected" ? "done" : "current" },
    { label: "Review", state: status === "approved" || status === "rejected" ? "done" : status === "awaiting-review" ? "current" : "todo" },
    { label: "Sign", state: "unsupported" }, { label: "Submit", state: "unsupported" }, { label: "Verify", state: "unsupported" },
  ];

  const summary = b ? (
    <div className="rounded-card bg-card p-4">
      <StatGrid columns={2} items={[
        { label: "Instructions", value: b.batch.instructionCount },
        { label: "Total moved", value: formatAmount(b.batch.totalAmount, b.batch.asset.code) },
        { label: "Asset", value: b.batch.asset.code },
        { label: "Attempt", value: b.batch.attempt },
      ]} />
      <ul className="mt-3 divide-y divide-divider border-t border-divider">
        {b.instructions.map((i) => <li key={i.id} className="flex justify-between gap-3 py-2 text-body"><span>{i.payerName} pays {i.payeeName}</span><span className="num">{formatAmount(i.amount, b.batch.asset.code)}</span></li>)}
      </ul>
      <p className="mt-3 break-all font-mono text-ident text-muted">{middle(b.batch.instructionsHash, 16, 12)}</p>
    </div>
  ) : null;

  // which action area to show
  const needsPrepare = !live; // nothing, or a rejected / no longer applying batch: a new batch may be prepared
  return (
    <Panel className="space-y-3" aria-label="Settlement steps">
      <Card>
        <p className="text-label uppercase tracking-wide text-muted">Settlement</p>
        <div className="mt-2"><Steps items={steps} /></div>

        <div className="mt-4 space-y-2 border-t border-divider pt-4">
          {needsPrepare ? (
            <>
              <h2 className="text-entity font-medium">{status === "rejected" ? "Prepare settlement again" : "Prepare settlement"}</h2>
              {status === "rejected" && s.latest?.decision ? <p className="text-body text-muted">The previous batch was rejected by {s.latest.decision.decidedBy}: {s.latest.decision.reason}</p> : null}
              {(status === "invalidated" || status === "superseded") ? <p className="text-body text-muted">The previous batch no longer applies. {s.latest?.invalidation?.cause ?? "Its calculation or approval changed."}</p> : null}
              <Button variant="primary" size="lg" disabled={!!prepareWhy} onClick={() => { setError(null); setDialog("prepare"); }} aria-describedby={prepareWhy ? "settle-why" : undefined}>{status === "rejected" ? "Prepare again" : "Prepare settlement"}</Button>
              {prepareWhy ? <p id="settle-why" className="text-body text-muted" role="note">{prepareWhy}</p> : null}
            </>
          ) : status === "awaiting-review" ? (
            <>
              <h2 className="text-entity font-medium">Review the settlement</h2>
              <p className="text-body text-muted">A reviewer other than the preparer approves or rejects exactly these instructions.</p>
              <Button variant="primary" size="lg" disabled={!canApprove} onClick={() => { setError(null); setDialog("approve"); }} aria-describedby={reviewWhy ? "settle-why" : undefined}>Approve settlement</Button>
              <Button variant="destructive" className="w-full" disabled={!canReject} onClick={() => { setError(null); setDialog("reject"); }} aria-describedby={reviewWhy ? "settle-why" : undefined}>Reject settlement</Button>
              {reviewWhy ? <p id="settle-why" className="text-body text-muted" role="note">{reviewWhy}</p> : null}
            </>
          ) : (
            <>
              <h2 className="text-entity font-medium">Settlement batch approved</h2>
              <p className="text-body text-muted" role="note">Nothing more can be done here. Signing, submission and verification are not supported in this app, so the settlement stops at Review.</p>
            </>
          )}
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
        <p className="mt-3 text-label text-muted">{status === "approved" ? `${APPROVAL_NOTE} ` : ""}Nothing is signed, submitted or settled.</p>
      </Card>

      <Dialog open={dialog === "prepare"} onClose={close} title={status === "rejected" ? "Prepare settlement again?" : "Prepare settlement?"} description="Instructions are derived from the approved calculation on the server. Nothing is signed or submitted, and a different reviewer must still approve them." primary={{ label: "Prepare settlement", onClick: prepare, loading: busy }}>
        <ul className="divide-y divide-divider">{preview?.checks.map((c) => <li key={c.key} className="py-2 text-body [overflow-wrap:anywhere]"><span className="block">{c.label}</span><span className="block text-label text-muted">{c.detail}</span></li>)}</ul>
      </Dialog>
      <Dialog open={dialog === "approve"} onClose={close} title="Approve this settlement?" description="You approve exactly these instructions, matched by their fingerprint. If anything changes, the approval no longer applies." primary={{ label: "Approve settlement", onClick: () => decide("approve"), loading: busy }}>{summary}</Dialog>
      <Dialog open={dialog === "reject"} onClose={close} destructive title="Reject this settlement?" description="The rejection and your reason are recorded. An administrator can then prepare it again." primary={{ label: "Reject settlement", onClick: () => decide("reject"), loading: busy, disabled: !canSubmitReject(reason) }}>
        <div className="space-y-3">
          {summary}
          <TextAreaField id="settle-reject-reason" label="Reason (required)" maxLength={REASON_MAX} value={reason} onChange={(e) => { setReason(e.target.value); setTouched(true); }} error={touched ? rejectReasonError(reason) ?? undefined : undefined} hint={`${reason.trim().length} of ${REASON_MAX} characters`} />
        </div>
      </Dialog>
    </Panel>
  );
}
