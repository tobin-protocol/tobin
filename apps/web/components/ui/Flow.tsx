import type { ReactNode } from "react";
import { cn, formatDateTime } from "../../lib/format.ts";
import { stageView, STAGE_LABEL, type Stage, type StageInput } from "../../lib/stages.ts";
import { Button } from "./Button.tsx";
import { CrossIcon, StatusMark } from "./Feedback.tsx";

export const LIFECYCLE_GROUPS = ["Draft", "Participation", "Obligations", "Netting", "Approval", "Settlement"] as const;

/**
 * Session lifecycle stepper: six groups, driven by real fields only (docs/web-app-plan.md section 5). Completed = filled dot and check; current = filled
 * ring with an exact sub-label; future = outlined dot, #b1b1b1 (decorative, not text-only information: the label stays #626262 for readability).
 */
export function Stepper({ currentIndex, subLabel, stoppedAt, stoppedLabel, applicationOnly }: {
  currentIndex: number; subLabel?: string; stoppedAt?: number; stoppedLabel?: string; applicationOnly?: boolean;
}) {
  return (
    <div>
      <ol className="flex flex-wrap gap-x-6 gap-y-3" aria-label="Session progress">
        {LIFECYCLE_GROUPS.map((g, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          const stopped = stoppedAt === i;
          return (
            <li key={g} aria-current={current ? "step" : undefined} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("flex size-4 items-center justify-center rounded-full", done ? "bg-button text-on-button" : current ? "border-[5px] border-button" : "border border-disabled")}>
                {done ? <svg viewBox="0 0 12 12" className="size-2.5"><path d="M2.5 6.2l2.4 2.3 4.6-4.9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
              </span>
              <span className={cn("text-body", done || current ? "text-ink" : "text-muted", current && "font-medium")}>{g}</span>
              {stopped ? <span className="flex items-center gap-1 text-body text-danger"><CrossIcon className="mt-0" />{stoppedLabel ?? "Stopped"}</span> : null}
            </li>
          );
        })}
      </ol>
      {subLabel ? <p className="mt-2 text-body text-muted">{subLabel}{applicationOnly ? " · Application record" : ""}</p> : null}
    </div>
  );
}

/** Who must do what next, and whether it is the current user. */
export function NextAction({ title, who, forYou, children }: { title: string; who: string; forYou: boolean; children?: ReactNode }) {
  return (
    <div className="rounded-card bg-card p-4">
      <p className="text-label uppercase tracking-wide text-muted">Next action</p>
      <p className="mt-1 text-entity font-medium">{title}</p>
      <p className="mt-1 text-body text-muted">{who}{forYou ? " · This is you" : ""}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * Four fixed stages, always all visible. Only stages actually reached are filled. The final-stage rule lives in lib/stages.ts: the last stage fills only
 * with a verified read-back, which no endpoint reports today, so with real data this rail never fills it. Stages are rendered through STAGE_LABEL.
 */
export function StageRail({ input, evidence }: { input: StageInput; evidence?: Partial<Record<Stage, ReactNode>> }) {
  const v = stageView(input);
  return (
    <div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Transaction stages">
        {v.stages.map(({ stage, reached }) => {
          const failedHere = v.failedAt === stage;
          return (
            <li key={stage} className="border-t border-divider pt-2">
              <span className={cn("flex items-center gap-2 text-body", reached ? "font-medium text-ink" : "text-muted")}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", reached ? "bg-button" : "border border-muted")} />
                {STAGE_LABEL[stage]}
                {failedHere ? <span className="flex items-center gap-1 text-danger"><CrossIcon className="mt-0" />Stopped</span> : null}
              </span>
              <span className="mt-1 block text-label text-muted">{reached ? evidence?.[stage] ?? "" : "Not reached"}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-body text-muted">{v.headline}</p>
    </div>
  );
}

export interface ApproverRow { name: string; role: string; decision: "approved" | "rejected" | "pending"; at?: string }
/** Application approval. White card. Never shares a row or a button with the wallet-signature block. */
export function ApprovalBlock({ approvers, onApprove, onReject, canDecide, reason }: {
  approvers: ApproverRow[]; onApprove?: () => void; onReject?: () => void; canDecide: boolean; reason?: string | null;
}) {
  const decided = approvers.filter((a) => a.decision === "approved").length;
  return (
    <section aria-labelledby="approvals-h" className="rounded-card bg-card p-4">
      <h3 id="approvals-h" className="text-entity font-medium">Approvals</h3>
      <ul className="mt-3 divide-y divide-divider">
        {approvers.map((a) => (
          <li key={a.name} className="flex items-center justify-between gap-3 py-2.5">
            <span><span className="text-body font-medium">{a.name}</span> <span className="text-body text-muted">{a.role}</span></span>
            {a.decision === "pending" ? <StatusMark kind="progress">Pending</StatusMark> : a.decision === "approved" ? <StatusMark kind="done">Approved{a.at ? ` · ${formatDateTime(a.at)}` : ""}</StatusMark> : <StatusMark kind="failed">Rejected{a.at ? ` · ${formatDateTime(a.at)}` : ""}</StatusMark>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-body text-muted">{decided} of {approvers.length} decided</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" disabled={!canDecide} onClick={onApprove}>Approve</Button>
        <Button variant="secondary" disabled={!canDecide} onClick={onReject}>Reject</Button>
      </div>
      {!canDecide && reason ? <p className="mt-2 text-label text-muted" role="note">{reason}</p> : null}
      <p className="mt-3 text-label text-muted">Approval is recorded in Tobin. This is not an on-chain signature.</p>
    </section>
  );
}

export interface SignerRow { address: string; weight: number; state: "awaiting" | "signed" | "rejected" }
/**
 * Stellar authorization. A #f0f0f0 card, visually different from the approval block. Signing is NOT supported by this app (decision D3): with
 * `signingSupported` false (the default and the only value used today) there is no sign button and the block says so.
 */
export function SignatureBlock({ signers, threshold, signingSupported = false }: { signers: SignerRow[]; threshold: number; signingSupported?: boolean }) {
  return (
    <section aria-labelledby="signatures-h" className="rounded-card bg-panel p-4">
      <h3 id="signatures-h" className="text-entity font-medium">Wallet signatures</h3>
      {signingSupported ? (
        <>
          <ul className="mt-3 divide-y divide-divider">
            {signers.map((s) => (
              <li key={s.address} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-mono text-ident text-muted">{s.address}</span>
                <span className="text-body">weight {s.weight} · {s.state === "signed" ? "Signed" : s.state === "rejected" ? "Rejected" : "Awaiting signature"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-body text-muted">Threshold {threshold}</p>
          <Button variant="primary" className="mt-3">Sign with wallet</Button>
        </>
      ) : (
        <p className="mt-2 text-body text-muted">Not supported. This app cannot request or collect Stellar signatures. Signing is performed by separate, owner-run tools.</p>
      )}
    </section>
  );
}
