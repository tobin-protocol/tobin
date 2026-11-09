// Transaction stage model: Prepared, Signed, Submitted, Confirmed are four distinct stages (PRD 12.5, design spec "Transaction stage rail").
//
// THE CONFIRMED RULE. Confirmed is reachable ONLY through `verifiedReadBack === true`, a value the backend must report after the transaction has been
// independently read back from Stellar. Today no endpoint reports it, so the HttpAdapter would pass `false` and Confirmed is never produced. A backend state
// that merely SAYS "confirmed" is not enough: without the verified flag the rail reads "Submitted, awaiting verification". test/stages.test.ts and
// test/no-confirmed.test.ts enforce this, and the second one also fails if any other source file renders the Confirmed label.

export type Stage = "prepared" | "signed" | "submitted" | "confirmed";
export const STAGES: readonly Stage[] = ["prepared", "signed", "submitted", "confirmed"];
export const STAGE_LABEL: Record<Stage, string> = { prepared: "Prepared", signed: "Signed", submitted: "Submitted", confirmed: "Confirmed" };

/** Execution states the console reports (apps/web-console/lib/registry/settlement-state.ts). */
export type ExecState =
  | "awaiting-signer" | "signing" | "signed" | "submission-pending" | "submitted"
  | "confirmed" | "reconciled" | "failed" | "expired" | "unknown-outcome" | "reconciliation-required";

export interface StageInput { state: ExecState | undefined; verifiedReadBack: boolean; /** a settlement batch is prepared and still applies, even though no execution is recorded */ prepared?: boolean }
export interface StageView {
  stages: { stage: Stage; reached: boolean }[];
  /** the furthest stage actually reached, or null if none */
  current: Stage | null;
  headline: string;
  /** set when the attempt stopped: the stage where it stopped */
  failedAt: Stage | null;
}

const REACHED: Record<ExecState, Stage | null> = {
  "awaiting-signer": "prepared", signing: "prepared", signed: "signed", "submission-pending": "signed", submitted: "submitted",
  confirmed: "submitted", reconciled: "submitted", failed: null, expired: null, "unknown-outcome": "submitted", "reconciliation-required": "submitted",
};

export function stageView(input: StageInput): StageView {
  const s = input.state;
  if (!s && input.prepared) return { stages: STAGES.map((stage) => ({ stage, reached: stage === "prepared" })), current: "prepared", headline: "Prepared, not yet signed", failedAt: null };
  if (!s) return { stages: STAGES.map((stage) => ({ stage, reached: false })), current: null, headline: "Not prepared", failedAt: null };
  const failedStates: ExecState[] = ["failed", "expired", "unknown-outcome"];
  let current: Stage | null = REACHED[s];
  // Confirmed needs the verified read-back. Nothing else can set it.
  if ((s === "confirmed" || s === "reconciled") && input.verifiedReadBack) current = "confirmed";
  const idx = current ? STAGES.indexOf(current) : -1;
  const stages = STAGES.map((stage, i) => ({ stage, reached: i <= idx }));
  const failedAt = failedStates.includes(s) ? (current ?? "prepared") : null;
  const headline =
    current === "confirmed" ? "Confirmed on Stellar. Independently verified."
    : current === "submitted" ? "Submitted, awaiting verification"
    : current === "signed" ? "Signed, not yet submitted"
    : current === "prepared" ? "Prepared, not yet signed"
    : "Not prepared";
  return { stages, current, headline, failedAt };
}

/**
 * Which stages the backend actually RECORDS. Only Prepared: the console can record an execution awaiting a signer, and nothing over HTTP can move it on
 * (signing, submission and verification have no route). The other three stages therefore render "Not supported" rather than "Not reached", so an empty
 * dot is never mistaken for "not yet".
 */
export const BACKEND_RECORDS: Record<Stage, boolean> = { prepared: true, signed: false, submitted: false, confirmed: false };
export type StageText = "Reached" | "Not reached" | "Not supported";
export function stageText(stage: Stage, reached: boolean): StageText {
  if (!BACKEND_RECORDS[stage]) return "Not supported";
  return reached ? "Reached" : "Not reached";
}

/** States that mean an execution or attempt stopped. The UI then shows the recorded reason and time, and that nothing retries by itself. */
export const STOPPED_STATES: readonly ExecState[] = ["failed", "expired", "unknown-outcome"];
export const isStopped = (s: ExecState | undefined): boolean => !!s && STOPPED_STATES.includes(s);
export const NO_AUTOMATIC_RETRY = "No automatic retry.";

/**
 * The only way another screen may show the final stage: a mark that exists solely when a verified read-back is reported. The public Discover tiles call this
 * with the record's flag, so no other file needs (or may contain) the Confirmed label.
 */
export function verifiedMark(verifiedReadBack: boolean): string | null {
  return verifiedReadBack ? STAGE_LABEL.confirmed : null;
}
