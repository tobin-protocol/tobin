"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Calculator01Icon } from "@hugeicons/core-free-icons";
import { can } from "../../lib/permissions/can.ts";
import { formatAmount, formatDateTime } from "../../lib/format.ts";
import { absAmount, eligibility, groupPositions, grossVsNet, splitByAsset } from "../../lib/netting/group.ts";
import { client } from "../../lib/tobin/index.ts";
import type { CalculationPosition, ObligationView, Readiness, SessionParticipantView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { Button } from "../ui/Button.tsx";
import { Amount, Table, type Col } from "../ui/Data.tsx";
import { EmptyState, ErrorState, InlineError, Skeleton, StatusMark } from "../ui/Feedback.tsx";
import { Confirm as Dialog, DetailSheet as SidePanel } from "../tobin/Overlays.tsx";
import { Banner, Card, DataCard, Panel, StatGrid } from "../ui/Surfaces.tsx";

export type NettingStep = "inputs" | "calculation" | "result";
const STEPS: { key: NettingStep; label: string }[] = [{ key: "inputs", label: "Eligible inputs" }, { key: "calculation", label: "Calculation" }, { key: "result", label: "Result" }];

export function StepStrip({ current }: { current: NettingStep }) {
  const at = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Netting steps">
      {STEPS.map((s, i) => (
        <li key={s.key} aria-current={i === at ? "step" : undefined} className="flex items-center gap-2">
          <span aria-hidden="true" className={i < at ? "size-3 rounded-full bg-button" : i === at ? "size-3 rounded-full border-[4px] border-button" : "size-3 rounded-full border border-disabled"} />
          <span className={i <= at ? "text-body font-medium text-ink" : "text-body text-muted"}>{i + 1}. {s.label}</span>
        </li>
      ))}
    </ol>
  );
}

const positionLabel = (p: CalculationPosition) => (p.role === "debtor" ? "Pays" : p.role === "creditor" ? "Receives" : "Zero");

/** The panel's one primary action: run netting, or the reason it cannot be run. */
export function RunNettingPanel({ eligibleCount, excludedBlocking, excludedCount, participantCount, asset, workflow, running, error, onRun }: {
  eligibleCount: number; excludedBlocking: number; excludedCount: number; participantCount: number; asset: string | null; workflow: "configuring" | "ready" | "closed"; running: boolean; error: string | null; onRun: () => void;
}) {
  const { actor } = useWorkspace();
  const [confirming, setConfirming] = useState(false);
  const allowed = can(actor, "netting.run");
  const reason = !allowed.allowed ? allowed.reason
    : workflow === "ready" ? "The session is marked ready. It can only be recalculated while it is being configured. An administrator can reopen it."
    : workflow === "closed" ? "A closed session cannot change."
    : eligibleCount === 0 ? "There are no active obligations to net. Record one first."
    : participantCount < 2 ? "Netting needs at least two participants."
    : excludedBlocking > 0 ? "An active obligation names a participant who is no longer active. Void it or add the participant back."
    : null;
  return (
    <Panel className="space-y-3" aria-label="Run netting">
      <Card>
        <h2 className="text-entity font-medium">Run netting</h2>
        <p className="mt-1 text-body text-muted">{eligibleCount === 0 ? "No obligations will be included." : `Will include ${eligibleCount} active obligation${eligibleCount === 1 ? "" : "s"} among ${participantCount} participants${asset ? ` in ${asset}` : ""}. The engine nets one asset per session.`}</p>
        <div className="mt-3 space-y-2">
          <Button variant="primary" size="lg" disabled={!!reason} loading={running} onClick={() => setConfirming(true)} aria-describedby={reason ? "net-reason" : undefined}>{running ? "Running netting" : "Run netting"}</Button>
          {reason ? <p id="net-reason" className="text-body text-muted" role="note">{reason}</p> : null}
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
        <p className="mt-3 text-label text-muted">The result is a calculation recorded in Tobin. It is not an approval, a signature or a settlement.</p>
      </Card>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Run netting?" description="A new calculation replaces the current one. Any review of the current calculation then no longer applies." primary={{ label: "Run netting", onClick: () => { setConfirming(false); onRun(); } }}>
        <StatGrid columns={2} items={[
          { label: "Obligations included", value: eligibleCount },
          { label: "Left out", value: excludedCount, hint: excludedCount > 0 ? "Voided obligations are not netted" : undefined },
          { label: "Participants", value: participantCount },
          { label: "Asset", value: asset ?? "No data" },
        ]} />
      </Dialog>
    </Panel>
  );
}

export function NettingTab({ sessionId, obligations, participants, readiness, running, runError }: {
  sessionId: string; obligations: ObligationView[] | undefined; participants: SessionParticipantView[] | undefined; readiness: Readiness | undefined; running: boolean; runError: string | null;
}) {
  const { org } = useWorkspace();
  const q = useQuery({ queryKey: ["session", org.id, sessionId, "calculation"], queryFn: () => client.sessions.calculation(org.id, sessionId), retry: false });
  const view = q.data;
  const c = view?.calculation ?? null;
  const [hot, setHot] = useState<ReadonlySet<string>>(new Set());
  const [details, setDetails] = useState(false);

  const activeIds = useMemo(() => new Set((participants ?? []).filter((p) => p.status === "active").map((p) => p.userId)), [participants]);
  const elig = useMemo(() => eligibility(obligations ?? [], activeIds), [obligations, activeIds]);
  const current = view?.currency === "current";
  const step: NettingStep = running ? "calculation" : c && current ? "result" : "inputs";
  const grouped = useMemo(() => (c ? groupPositions(c.positions) : null), [c]);
  const gn = c ? grossVsNet(c.gross, c.positions, current) : null;
  const highlight = (ids: string[]) => ({ onMouseEnter: () => setHot(new Set(ids)), onMouseLeave: () => setHot(new Set()), onFocus: () => setHot(new Set(ids)), onBlur: () => setHot(new Set()) });
  const isHot = (...ids: string[]) => ids.some((i) => hot.has(i));

  const eligCols: Col<ObligationView>[] = [
    { id: "d", header: "Debtor", cell: (r) => r.debtorName },
    { id: "c", header: "Creditor", cell: (r) => r.creditorName },
    { id: "a", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} asset={r.asset} /> },
  ];
  const exclCols: Col<(typeof elig.excluded)[number]>[] = [
    { id: "o", header: "Obligation", cell: (r) => <span>{r.obligation.debtorName} to {r.obligation.creditorName}</span> },
    { id: "a", header: "Amount", align: "right", cell: (r) => <Amount value={r.obligation.amount} asset={r.obligation.asset} /> },
    { id: "r", header: "Reason", cell: (r) => <span className="text-muted">{r.text}</span> },
  ];

  const positionTable = (title: string, list: CalculationPosition[], asset: string): ReactNode => (list.length === 0 ? null : (
    <div key={title}>
      <h4 className="mb-1 text-body font-medium">{title}</h4>
      <Table columns={[
        { id: "n", header: "Participant", cell: (r) => <span className="font-medium">{r.name}</span> },
        { id: "d", header: "Direction", cell: (r) => <StatusMark kind={r.role === "flat" ? "unsupported" : "progress"}>{positionLabel(r)}</StatusMark> },
        { id: "m", header: "Net amount", align: "right", cell: (r) => <Amount value={absAmount(r.net)} asset={asset} /> },
      ] satisfies Col<CalculationPosition>[]} data={list} getRowId={(r) => r.userId} empty={null} />
    </div>
  ));

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-entity font-medium">Net positions</h2>
        <p className="mt-1 text-body text-muted">Net position = what a participant owes minus what it is owed. Positive means it pays; negative means it receives. An application calculation: not an approval, a signature or a settlement.</p>
        <div className="mt-4"><StepStrip current={step} /></div>
      </Card>

      {q.isLoading ? <Skeleton className="h-40 w-full" /> : q.error ? (
        <ErrorState title="Could not load the calculation" message={(q.error as Error).message} retry={<Button onClick={() => q.refetch()}>Try again</Button>} />
      ) : null}
      {running ? <Skeleton className="h-40 w-full" /> : null}
      {runError ? <ErrorState title="The calculation was refused" message={runError} retry={<span className="text-label text-muted">The readiness checks below say what to fix.</span>} /> : null}

      <Card>
        <h3 className="text-entity font-medium">Eligible inputs</h3>
        <p className="mt-1 text-body text-muted">What will be netted, and what is left out and why. Nothing is dropped silently.</p>
        <div className="mt-3 space-y-4">
          <Table columns={eligCols} data={elig.eligible} getRowId={(r) => r.id} empty={<EmptyState title="No eligible obligations" message="Active obligations between active participants appear here." />} />
          <div>
            <h4 className="mb-1 text-body font-medium">Excluded</h4>
            <Table columns={exclCols} data={elig.excluded} getRowId={(r) => r.obligation.id} empty={<p className="text-body text-muted">Nothing is excluded. The backend leaves out only voided obligations.</p>} />
          </div>
          {readiness ? (
            <ul className="divide-y divide-divider" aria-label="Validation checks">
              {readiness.checks.filter((k) => ["references", "asset", "valid"].includes(k.key)).map((k) => (
                <li key={k.key} className="flex items-start justify-between gap-3 py-2"><span className="text-body">{k.label}{!k.ok ? <span className="block text-label text-muted">{k.fix}</span> : null}</span><StatusMark kind={k.ok ? "done" : "failed"}>{k.ok ? "Passes" : "Fails"}</StatusMark></li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      {c && gn && grouped ? (
        <>
          {!current ? <Banner role="status" className="rounded-card">This calculation is stale: participants or obligations changed after it. Run netting again. The figures below are the old result and are not a current one.</Banner> : null}
          <div className="grid gap-4 sm:grid-cols-2" role="group" aria-label="Gross versus net">
            <DataCard label="Gross" value={<span className="break-words">{formatAmount(gn.gross, c.asset)}</span>} note="Every active obligation added up, before netting." />
            <DataCard label="Net that moves" value={<span className="break-words">{formatAmount(gn.net, c.asset)}</span>} note={gn.reduction !== null ? `Netting removes ${formatAmount(gn.reduction, c.asset)} of gross payments.` : "A reduction is shown only for a current calculation."} />
          </div>

          <Card>
            <h3 className="text-entity font-medium">Participant positions</h3>
            <div className="mt-3 space-y-6">
              {splitByAsset([{ asset: c.asset, positions: c.positions }]).map((section) => (
                <section key={section.asset} aria-label={`Positions in ${section.asset}`} className="space-y-4">
                  <p className="text-label uppercase tracking-wide text-muted">Asset {section.asset}</p>
                  {positionTable("Net debtors (pay)", grouped.debtors, section.asset)}
                  {positionTable("Net creditors (receive)", grouped.creditors, section.asset)}
                  {positionTable("Zero positions", grouped.zero, section.asset)}
                </section>
              ))}
              <p className="text-label text-muted">There is no total across assets. One session nets one asset.</p>
            </div>
          </Card>

          <Card>
            <h3 className="text-entity font-medium">Original versus net</h3>
            <p className="mt-1 text-body text-muted">Point at or focus a row to highlight the rows it connects to. The links are by participant: net settlement instructions exist only in a prepared settlement, which is on the Settlement tab.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-1 text-body font-medium">Original obligations</h4>
                <ul className="divide-y divide-divider" aria-label="Original obligations">
                  {elig.eligible.map((o) => (
                    <li key={o.id} tabIndex={0} data-linked={isHot(o.debtor, o.creditor) ? "true" : undefined} {...highlight([o.debtor, o.creditor])} className={`flex items-center justify-between gap-2 rounded-btn px-2 py-2.5 text-body ${isHot(o.debtor, o.creditor) ? "bg-ink-10" : ""}`}>
                      <span>{o.debtorName} owes {o.creditorName}</span><Amount value={o.amount} asset={o.asset} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-1 text-body font-medium">Net positions</h4>
                <ul className="divide-y divide-divider" aria-label="Net positions">
                  {[...grouped.debtors, ...grouped.creditors, ...grouped.zero].map((p) => (
                    <li key={p.userId} tabIndex={0} data-linked={isHot(p.userId) ? "true" : undefined} {...highlight([p.userId])} className={`flex items-center justify-between gap-2 rounded-btn px-2 py-2.5 text-body ${isHot(p.userId) ? "bg-ink-10" : ""}`}>
                      <span>{p.name} {positionLabel(p).toLowerCase()}</span><Amount value={absAmount(p.net)} asset={c.asset} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <div><Button onClick={() => setDetails(true)}>Calculation details</Button></div>
          <SidePanel open={details} onClose={() => setDetails(false)} title="Calculation details" icon={Calculator01Icon}>
            <div className="space-y-4">
              <div className="rounded-card bg-card p-4">
                <dl className="space-y-3 text-body">
                  <div><dt className="text-label uppercase tracking-wide text-muted">Calculation id</dt><dd className="break-all font-mono text-ident">{c.id}</dd></div>
                  <div><dt className="text-label uppercase tracking-wide text-muted">Asset</dt><dd>{c.asset}</dd></div>
                  <div><dt className="text-label uppercase tracking-wide text-muted">Calculated</dt><dd>{formatDateTime(c.createdAt)} by {c.createdBy}</dd></div>
                  <div><dt className="text-label uppercase tracking-wide text-muted">Obligations used</dt><dd>{c.obligationCount}</dd></div>
                  <div><dt className="text-label uppercase tracking-wide text-muted">Currency</dt><dd>{current ? "Current" : "Stale"}</dd></div>
                  <div><dt className="text-label uppercase tracking-wide text-muted">Validation</dt><dd>{readiness ? readiness.checks.filter((k) => k.key === "valid" || k.key === "conservation").map((k) => `${k.label}: ${k.ok ? "passes" : "fails"}`).join("; ") : "No data"}</dd></div>
                </dl>
              </div>
              <div className="rounded-card bg-card p-4">
                <h4 className="text-body font-medium">Per participant</h4>
                <ul className="mt-2 divide-y divide-divider">{c.positions.map((p) => <li key={p.userId} className="flex justify-between py-2 text-body"><span>{p.name}</span><span className="num">{p.role === "flat" ? "Zero" : `${positionLabel(p)} ${formatAmount(absAmount(p.net), c.asset)}`}</span></li>)}</ul>
              </div>
              <p className="text-label text-muted">The backend returns no version field for a calculation, so none is shown.</p>
            </div>
          </SidePanel>
        </>
      ) : !running && !runError && !q.isLoading ? (
        <NotYet />
      ) : null}
    </div>
  );
}

function NotYet() {
  return <EmptyState title="No result yet" message="Run netting in the panel to calculate net positions. Net amounts and the gross comparison appear here, from the real calculation only." />;
}
