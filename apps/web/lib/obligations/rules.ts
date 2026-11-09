// Obligation form rules. The client pre-checks what it can mirror (apps/web-console/lib/registry/clearing.ts parseObligationAmount, service.ts text()), but the
// server is the authority: its message is what the user sees, placed under the field it is about.
import "../zod-setup.ts";
import { z } from "zod";
import type { ActivityItem } from "../tobin/types.ts";

export type FieldName = "debtor" | "creditor" | "amount" | "asset" | "reference" | "form";

/** Mirrors the backend: a positive whole number of base units, 1 to 39 digits, no leading zero. */
export const AMOUNT_PATTERN = /^[1-9][0-9]{0,38}$/;
export const ASSET_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

export const obligationForm = z.object({
  debtor: z.string().min(1, "Choose the debtor."),
  creditor: z.string().min(1, "Choose the creditor."),
  amount: z.string().trim().regex(AMOUNT_PATTERN, "Enter a positive whole number of base units, digits only (no decimals, signs or spaces)."),
  asset: z.string().min(1, "Choose the asset."),
  reference: z.string().trim().max(200, "Use at most 200 characters.").refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), "Do not use control characters, < or >."),
}).refine((v) => v.debtor === "" || v.debtor !== v.creditor, { path: ["creditor"], message: "The debtor and the creditor must be different participants." });
export type ObligationForm = z.infer<typeof obligationForm>;

/**
 * Which field a backend validation message is about. The messages are the backend's real ones (service.ts / clearing.ts); an unrecognised message stays
 * form-level rather than being pinned to a field it may not concern.
 */
export function fieldOfError(message: string): FieldName {
  const m = message.toLowerCase();
  if (m.includes("debtor and creditor")) return "creditor";
  if (m.includes("the debtor")) return "debtor";
  if (m.includes("the creditor")) return "creditor";
  if (m.includes("amount")) return "amount";
  if (m.includes("asset") || m.includes("nets ")) return "asset";
  if (m.includes("reference")) return "reference";
  return "form";
}

/** Events of ONE obligation, from the session activity. There is no per-obligation history endpoint: the backend logs the first 8 id characters. */
export function historyOf(obligationId: string, activity: readonly ActivityItem[]): ActivityItem[] {
  const tag = `obligation ${obligationId.slice(0, 8)}`;
  return activity.filter((a) => a.kind.startsWith("obligation.") && a.detail.includes(tag)).sort((x, y) => x.at.localeCompare(y.at));
}

/** The state change an obligation event records, for the history (redesign PRD 8.5: previous and current state). Unknown kinds say nothing rather than guess. */
export function transitionOf(kind: string): { from: string | null; to: string } | null {
  if (kind === "obligation.created") return { from: null, to: "Active" };
  if (kind === "obligation.voided") return { from: "Active", to: "Voided" };
  return null;
}
export const transitionText = (t: { from: string | null; to: string }): string => (t.from ? `${t.from} to ${t.to}` : `Recorded as ${t.to}`);

/**
 * Whether the Void action is offered, and the reason when it is not. Void is administrator-only and only while the session is being configured (the console's
 * `#editable`). It is a separate confirmed action with its own history entry; there is no edit and no delete. PRESENTATION ONLY: the server decides.
 */
export function voidGate(input: { adminAllowed: boolean; adminReason: string | null; workflow: "configuring" | "ready" | "closed"; status: "active" | "voided" }): { allowed: boolean; reason: string | null } {
  if (input.status === "voided") return { allowed: false, reason: "This obligation is already voided." };
  if (!input.adminAllowed) return { allowed: false, reason: input.adminReason ?? "Only administrators can do this." };
  if (input.workflow === "ready") return { allowed: false, reason: "The session is marked ready. Obligations can only change while it is being configured. An administrator can reopen it." };
  if (input.workflow === "closed") return { allowed: false, reason: "A closed session cannot change." };
  return { allowed: true, reason: null };
}

export type History = { kind: "ok"; items: ActivityItem[] } | { kind: "unavailable"; reason: string };
export const HISTORY_UNAVAILABLE = "History unavailable for this obligation";

/**
 * The history of ONE obligation. The console's activity log names an obligation by the first 8 characters of its id only (`#short` in service.ts), and the
 * activity payload carries no full id (it is { at, kind, actor, detail }). So events can only be matched on that prefix. If another obligation of the SAME
 * session shares the prefix, its events cannot be told apart, and showing them would mix two obligations' histories: the history is then unavailable.
 */
export function obligationHistory(obligationId: string, sessionObligationIds: readonly string[], activity: readonly ActivityItem[]): History {
  const prefix = obligationId.slice(0, 8);
  const clash = sessionObligationIds.some((other) => other !== obligationId && other.slice(0, 8) === prefix);
  if (clash) return { kind: "unavailable", reason: "Another obligation in this session shares the first 8 characters of its id, and the activity log records only those 8 characters, so the two cannot be told apart." };
  return { kind: "ok", items: historyOf(obligationId, activity) };
}
