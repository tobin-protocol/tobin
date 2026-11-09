"use client";

import type { ReactElement } from "react";
import { decisionStatusText } from "../../lib/approvals/rules.ts";
import { formatAmount, formatDateTime, middle } from "../../lib/format.ts";
import type { InstructionView } from "../../lib/tobin/types.ts";
import { Button } from "../ui/Button.tsx";
import { Amount, Table, type Col } from "../ui/Data.tsx";
import { CrossIcon, EmptyState, ErrorState, NotSupported, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { ApprovalBlock, SignatureBlock } from "../ui/Flow.tsx";
import { Card, StatGrid } from "../ui/Surfaces.tsx";
import { FailureNote } from "./FailureNote.tsx";
import type { SettlementData } from "./useSettlement.ts";

const STATUS_TEXT = {
  "awaiting-review": "Awaiting review", approved: "Approved", rejected: "Rejected", invalidated: "No longer applies", superseded: "Superseded by a newer calculation",
} as const;

/** The state the settlement list/batch queries are in, as a message to show instead of a step body; null when the data is ready. */
export function settlementGate(s: SettlementData): ReactNodeOrNull {
  if (s.list.isLoading) return <Skeleton className="h-48 w-full" />;
  if (s.list.error) return <ErrorState title="Could not load settlement" message={(s.list.error as Error).message} retry={<Button onClick={() => s.list.refetch()}>Try again</Button>} />;
  return null;
}
type ReactNodeOrNull = ReactElement | null;

/** Step 2: what preparing needs (before anything is prepared), or the prepared batch's summary. */
export function PrepareStep({ s }: { s: SettlementData }) {
  const gate = settlementGate(s);
  if (gate) return gate;
  const { list, latest, batch } = s;
  const b = batch.data;
  if (!latest) {
    return (
      <Card>
        <h2 className="text-entity font-medium">Prepare settlement</h2>
        <p className="mt-1 text-body text-muted">No settlement has been prepared for this session. What preparing needs, from the server:</p>
        <ul className="mt-3 divide-y divide-divider" aria-label="Preparation checks">
          {list.data?.preview.checks.map((c) => (
            <li key={c.key} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block text-body">{c.label}</span><span className="block text-label text-muted">{c.detail}</span></span>
              <StatusMark kind={c.ok ? "done" : "action"}>{c.ok ? "Met" : "Not met"}</StatusMark>
            </li>
          ))}
        </ul>
        {list.data && list.data.assets.length === 0 ? <p className="mt-3 text-label text-muted">No supported asset is configured on the server, so no settlement can be prepared. An operator configures supported assets.</p> : null}
      </Card>
    );
  }
  if (batch.isLoading) return <Skeleton className="h-48 w-full" />;
  if (batch.error || !b) return <ErrorState title="Could not load the prepared settlement" message={batch.error ? (batch.error as Error).message : "No data"} retry={<Button onClick={() => batch.refetch()}>Try again</Button>} />;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-entity font-medium">Prepared settlement</h2><p className="mt-1 text-body text-muted">Instructions derived from the approved calculation. Preparation only: nothing is signed, submitted or settled.</p></div>
        <StatusMark kind={b.status === "approved" ? "done" : b.status === "rejected" || b.status === "invalidated" || b.status === "superseded" ? "failed" : "action"}>{STATUS_TEXT[b.status]}</StatusMark>
      </div>
      <div className="mt-4">
        <StatGrid columns={2} items={[
          { label: "Instructions", value: b.batch.instructionCount },
          { label: "Total moved", value: formatAmount(b.batch.totalAmount, b.batch.asset.code) },
          { label: "Asset", value: b.batch.asset.code, hint: middle(b.batch.asset.id, 10, 6) },
          { label: "Network", value: b.batch.asset.network === "testnet" ? "Stellar Testnet" : b.batch.asset.network },
          { label: "Attempt", value: b.batch.attempt },
          { label: "Prepared", value: `${formatDateTime(b.batch.preparedAt)} by ${b.batch.preparedBy}` },
        ]} />
      </div>
      <p className="mt-3 break-all border-t border-divider pt-3 font-mono text-ident text-muted" title="The reviewer approves exactly the instructions with this fingerprint">{b.batch.instructionsHash}</p>
    </Card>
  );
}

/** Step 3: the instructions under review, the red diff when they do not match the approved result, and the settlement's review decision. */
export function BatchStep({ s }: { s: SettlementData }) {
  const gate = settlementGate(s);
  if (gate) return gate;
  const { latest, batch, diff } = s;
  const b = batch.data;
  if (!latest) return <EmptyState title="Nothing to review yet" message="A settlement is reviewed after an administrator prepares it from the approved calculation." />;
  if (batch.isLoading) return <Skeleton className="h-48 w-full" />;
  if (batch.error || !b) return <ErrorState title="Could not load the prepared settlement" message={batch.error ? (batch.error as Error).message : "No data"} retry={<Button onClick={() => batch.refetch()}>Try again</Button>} />;
  return (
    <div className="space-y-6">
      {diff && !diff.ok ? (
        <section role="alert" aria-labelledby="diff-h" className="border-2 border-danger p-4">
          <h3 id="diff-h" className="flex items-center gap-2 text-entity font-medium text-danger"><CrossIcon />The prepared settlement does not match the approved result</h3>
          <p className="mt-1 text-body">Progress is blocked until this is resolved. A reviewer can still reject the batch.</p>
          <ul className="mt-3 divide-y divide-divider">
            {diff.issues.map((i, n) => (
              <li key={n} className="py-2.5 text-body">
                <span className="block text-danger [overflow-wrap:anywhere]">{i.text}</span>
                {i.expected !== undefined ? <span className="mt-0.5 block text-label"><span className="text-muted">Approved result: </span><span className="num font-medium">{i.expected}</span><span className="text-muted"> · Prepared: </span><span className="num font-medium">{i.actual}</span></span> : null}
                <span className="block text-label text-muted">{i.source === "server" ? "Reported by the server" : "Checked in this browser from the data shown"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : diff ? <p className="text-label text-muted" role="status">The instructions reconcile exactly to the approved net positions. Checked by the server and again in this browser.</p> : null}

      <Card>
        <h3 className="text-entity font-medium">Instructions</h3>
        <div className="mt-3">
          <Table
            columns={[
              { id: "seq", header: "#", cell: (r) => r.seq },
              { id: "payer", header: "Pays", cell: (r) => <span className="font-medium">{r.payerName}</span> },
              { id: "payee", header: "Receives", cell: (r) => <span className="font-medium">{r.payeeName}</span> },
              { id: "amount", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} asset={b.batch.asset.code} /> },
              { id: "fp", header: "Fingerprint", cell: (r) => <span className="font-mono text-ident text-muted">{r.fingerprint ? middle(r.fingerprint, 6, 4) : "No data"}</span>, hideBelow: "md" },
            ] satisfies Col<InstructionView>[]}
            data={b.instructions} getRowId={(r) => r.id} empty={<EmptyState title="No instructions" message="This batch requires no transfers." />} />
        </div>
      </Card>

      <ApprovalBlock
        decisions={b.review ? [{ id: "batch-review", reviewer: b.review.decidedBy, decision: b.review.decision, at: b.review.decidedAt, reason: b.review.reason || undefined, statusText: b.status === "invalidated" || b.status === "superseded" ? decisionStatusText("invalidated") : null }] : []}
        note={b.review?.decision === "approved" ? "Approval recorded in Tobin. This is not an on-chain signature." : null} />
      {b.invalidation ? <p className="text-body text-danger" role="status">This batch no longer applies: {b.invalidation.cause} ({formatDateTime(b.invalidation.at)}).</p> : null}
    </div>
  );
}

/** Step 4: read-only. What the backend records for the settlement's execution, and nothing it does not. */
export function ExecutionStep({ s }: { s: SettlementData }) {
  const { latest, execution, attempts } = s;
  if (!latest) return <EmptyState title="No execution record" message="An execution is recorded against a prepared settlement. None has been prepared." />;
  const e = execution.data?.execution;
  return (
    <Card>
      <h2 className="text-entity font-medium">Execution record</h2>
      <p className="mt-1 text-body text-muted">Read-only. The backend can record an execution awaiting a signer and nothing later: no route can start, sign, submit or verify one.</p>
      {execution.isLoading ? <div className="mt-3"><Skeleton lines={2} /></div> : execution.error ? <div className="mt-3"><ErrorState title="Could not load the execution record" message={(execution.error as Error).message} retry={<Button onClick={() => execution.refetch()}>Try again</Button>} /></div> : e ? (
        <div className="mt-4 space-y-3 border-t border-divider pt-3">
          <p className="text-body"><span className="text-muted">Execution state: </span><span className="font-medium">{e.state}</span> · {formatDateTime(e.createdAt)}</p>
          <FailureNote state={e.state} events={e.events} />
          <ul className="divide-y divide-divider" aria-label="Execution events">
            {e.events.map((ev, i) => <li key={i} className="py-2 text-body"><span className="block">{ev.detail}</span><span className="block text-label text-muted">{ev.actor} · {formatDateTime(ev.at)}{ev.to ? ` · ${ev.to}` : ""}</span></li>)}
          </ul>
        </div>
      ) : execution.data ? <p className="mt-3 border-t border-divider pt-3 text-body text-muted">No execution has been recorded for this batch. An execution needs a verified Stellar account for every payer and payee.</p> : null}
      {attempts.data && attempts.data.length > 0 ? (
        <div className="mt-3 border-t border-divider pt-3">
          <h3 className="text-body font-medium">Attempts</h3>
          <ul className="mt-1 divide-y divide-divider">{attempts.data.map((a) => <li key={a.attemptNo} className="py-2 text-body"><span className="font-medium">Attempt {a.attemptNo}</span> · {a.state} · <span className="text-muted">{formatDateTime(a.createdAt)}</span></li>)}</ul>
        </div>
      ) : null}
      {execution.data && execution.data.unavailable.length > 0 ? <p className="mt-3 text-label text-muted">The backend itself lists these as not implemented: {execution.data.unavailable.join(", ")}.</p> : null}
    </Card>
  );
}

/** Step 5: Not supported. The wallet-signature block stands alone here, never in a row with an approval. */
export function SignStep() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4 [&>*]:min-w-0">
        <NotSupported tone="card" feature="Sign" reason="This app cannot request or collect Stellar signatures. No route exists." />
        <NotSupported tone="card" feature="Submit" reason="This app cannot submit a transaction to Stellar. No route exists." />
        <NotSupported tone="card" feature="Verify" reason="No route can read a transaction back from the network, so nothing is ever shown as verified." />
      </div>
      <SignatureBlock signers={[]} threshold={0} />
    </div>
  );
}
