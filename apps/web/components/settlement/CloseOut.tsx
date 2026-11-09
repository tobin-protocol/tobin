"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { closeOutOf, STEP_ORDER, type CloseOutStep, type StepKey, type StepState } from "../../lib/settlement/closeout.ts";
import type { AuthorizationView, CalculationView, ObligationView, WorkflowState } from "../../lib/tobin/types.ts";
import { ApprovalsTab } from "../approvals/ApprovalsTab.tsx";
import { BatchStep, ExecutionStep, PrepareStep, SignStep } from "./Steps.tsx";
import type { SettlementData } from "./useSettlement.ts";

const STATE_TEXT: Record<StepState, string> = { done: "Done", current: "Current step", blocked: "Blocked", upcoming: "Not yet", readonly: "Read-only", unsupported: "Not supported", unread: "Could not be read" };

/** The facts the close-out reads, taken from the same queries the rest of the workspace uses. */
export function closeOutFacts(s: SettlementData, auth: AuthorizationView | undefined, workflow: WorkflowState) {
  const batch = s.list.data ? (s.latest ? s.latest.status : ("none" as const)) : null;
  return { closed: workflow === "closed", auth: auth?.state ?? null, batch, mismatch: s.latest?.status === "awaiting-review" && s.diff ? !s.diff.ok : null };
}

export const isStep = (v: string | null): v is StepKey => !!v && (STEP_ORDER as readonly string[]).includes(v);

function Square({ step }: { step: CloseOutStep }) {
  return (
    <span aria-hidden="true" className={cn(
      "flex size-7 shrink-0 items-center justify-center font-label text-[13px]",
      step.state === "done" ? "bg-ink text-on-button" : step.state === "current" ? "border-2 border-ink" : step.state === "blocked" ? "border-2 border-danger text-danger" : step.state === "unsupported" ? "border border-dashed border-divider text-muted" : "border border-divider text-muted",
    )}>{step.number}</span>
  );
}

/**
 * ONE linear close-out: five numbered steps on the left (review the calculation, prepare, review the settlement, the read-only execution record, and the
 * unsupported sign/submit/verify), the shown step on the right. The step the work is at is marked Current; any step can be opened to read. Actions live in the
 * action panel, one confirmation each. The four-square stage rail is not repeated here: it is in the session summary above the tabs.
 */
export function CloseOut({ s, auth, obligations, calc, workflow, sessionId, shown }: {
  s: SettlementData; auth: UseQueryResult<AuthorizationView>; obligations: ObligationView[] | undefined; calc: CalculationView | undefined; workflow: WorkflowState; sessionId: string; shown: StepKey | null;
}) {
  const { steps, current } = closeOutOf(closeOutFacts(s, auth.data, workflow));
  const blocked = steps.find((x) => x.state === "blocked");
  const at: StepKey = shown ?? current ?? blocked?.key ?? "review";
  const step = steps.find((x) => x.key === at) as CloseOutStep;
  const href = (k: StepKey) => `/sessions/${sessionId}?tab=settlement&step=${k}`;

  return (
    <div className="@container"><div className="grid gap-6 @[640px]:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Close-out steps">
        <ol className="space-y-2">
          {steps.map((x) => (
            <li key={x.key}>
              <Link href={href(x.key)} aria-current={x.key === at ? "step" : undefined} className={cn("flex min-h-11 items-start gap-3 border p-3 hover:bg-tile", x.key === at ? "border-ink bg-tile" : "border-divider")}>
                <Square step={x} />
                <span className="min-w-0">
                  <span className="block text-body font-medium">{x.label}</span>
                  <span className="block text-label text-muted">{x.role}</span>
                  <span className={cn("mt-0.5 block font-label text-label uppercase tracking-wider", x.state === "blocked" ? "text-danger" : "text-muted")}>{STATE_TEXT[x.state]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="step-h" className="min-w-0 space-y-4">
        <div>
          <p className="font-label text-label uppercase tracking-wider text-muted">Step {step.number} of {steps.length} · {STATE_TEXT[step.state]}</p>
          <h2 id="step-h" className="mt-1 text-entity font-medium">{step.label}</h2>
          <p className="mt-1 text-body text-muted">{step.note}</p>
        </div>
        {at === "review" ? <ApprovalsTab query={auth} sessionId={sessionId} obligations={obligations} calc={calc} /> : null}
        {at === "prepare" ? <PrepareStep s={s} /> : null}
        {at === "batch" ? <BatchStep s={s} /> : null}
        {at === "execution" ? <ExecutionStep s={s} /> : null}
        {at === "sign" ? <SignStep /> : null}
      </section>
    </div></div>
  );
}
