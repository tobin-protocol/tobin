// The five kinds of state a session can be in, kept apart (redesign PRD 7.5): application, calculated, approval, settlement preparation and blockchain
// transaction. Each is read from a different real source. The blockchain layer is always "Not recorded": this app cannot sign, submit or verify, so no
// on-chain state exists here and nothing may be shown as settled or confirmed. Pure.
import type { AuthState, BatchStatus, Currency, WorkflowState } from "../tobin/types.ts";

export type LayerKey = "application" | "calculated" | "approval" | "settlement" | "chain";
export interface StateLayer { key: LayerKey; label: string; value: string; detail: string; /** false when this app has no way to record the layer */ recorded: boolean }
export interface LayerInput {
  workflow: WorkflowState;
  provenance: string;
  /** null means "could not be read" */
  currency: Currency | null;
  auth: AuthState | null;
  batch: BatchStatus | "none" | null;
}

const UNREAD = "Could not be read";

export function stateLayers(i: LayerInput): StateLayer[] {
  const wf = i.workflow === "configuring" ? "being configured" : i.workflow === "ready" ? "marked ready" : "closed";
  return [
    { key: "application", label: "Application record", recorded: true,
      value: i.provenance === "local-draft" ? `Local draft, ${wf}` : `${i.provenance}, ${wf}`,
      detail: "Recorded in Tobin only. No contract was called and no wallet was used." },
    { key: "calculated", label: "Netting calculation", recorded: true,
      value: i.currency === null ? UNREAD : i.currency === "none" ? "Not calculated" : i.currency === "current" ? "Calculated and current" : "Calculated, now stale",
      detail: i.currency === "stale" ? "Participants or obligations changed after the calculation." : "An application calculation by the netting engine, not a settlement." },
    { key: "approval", label: "Review", recorded: true,
      value: i.auth === null ? UNREAD : i.auth === "no-calculation" ? "Nothing to review" : i.auth === "awaiting-review" ? "Awaiting review" : i.auth === "approved" ? "Approved" : i.auth === "rejected" ? "Rejected" : "The reviewed calculation is stale",
      detail: "One reviewer's decision, recorded in Tobin. It is not a Stellar signature." },
    { key: "settlement", label: "Settlement preparation", recorded: true,
      value: i.batch === null ? UNREAD : i.batch === "none" ? "Not prepared" : i.batch === "awaiting-review" ? "Prepared, awaiting review" : i.batch === "approved" ? "Prepared and approved" : i.batch === "rejected" ? "Prepared, rejected" : "No longer applies",
      detail: "Instructions derived from the approved calculation. Preparing is not executing." },
    { key: "chain", label: "Blockchain transaction", recorded: false, value: "Not recorded",
      detail: "This app cannot sign, submit or verify a transaction, so no on-chain state exists here and nothing is shown as settled or confirmed." },
  ];
}
