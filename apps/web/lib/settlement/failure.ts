// What to show when an execution or attempt has stopped. The real backend cannot reach these states over HTTP today (nothing can sign, submit or verify), so
// real screens will not show them; the same component is rendered from labelled FIXTURES in /dev/components and covered by unit tests, so it is ready when a
// route exists. Nothing here retries anything: "No automatic retry" is always stated.
import { isStopped, NO_AUTOMATIC_RETRY, type ExecState } from "../stages.ts";

export interface Failure { state: ExecState; title: string; detail: string; at: string | null; notes: string[] }

const TITLE: Partial<Record<ExecState, string>> = {
  failed: "This execution failed",
  expired: "This execution expired",
  "unknown-outcome": "The outcome of this execution is unknown",
};

export function failureOf(state: ExecState | undefined, events: readonly { detail: string; at: string }[]): Failure | null {
  if (!state || !isStopped(state)) return null;
  const last = events[events.length - 1];
  return {
    state,
    title: TITLE[state] ?? "This execution stopped",
    detail: last?.detail ?? "No data",
    at: last?.at ?? null,
    notes: [
      NO_AUTOMATIC_RETRY,
      ...(state === "unknown-outcome" ? ["An unknown outcome is resolved only by reading the network, which this app cannot do. It is not treated as a failure and not as a success."] : []),
      "A new attempt is a separate action by an administrator after the failure has been reviewed. This app does not start attempts.",
    ],
  };
}
