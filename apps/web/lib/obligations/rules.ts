// Obligation form rules. The client pre-checks what it can mirror (apps/web-console/lib/registry/clearing.ts parseObligationAmount, service.ts text()), but the
// server is the authority: its message is what the user sees, placed under the field it is about.
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
