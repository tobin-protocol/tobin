// FIXTURE data, never returned by the backend and never used by a real screen. It exists only so the failed-state rendering can be seen in
// /dev/components (labelled "fixture") and tested. The details are invented for illustration.
import type { ExecState } from "../stages.ts";

export interface FailedFixture { state: ExecState; events: { detail: string; at: string }[] }

export const FAILED_FIXTURES: FailedFixture[] = [
  { state: "failed", events: [{ detail: "FIXTURE: the transaction was included and failed.", at: "2026-01-02T10:15:00.000Z" }] },
  { state: "expired", events: [{ detail: "FIXTURE: the signature window passed before submission.", at: "2026-01-02T11:00:00.000Z" }] },
  { state: "unknown-outcome", events: [{ detail: "FIXTURE: the network could not be read, so the outcome is unknown.", at: "2026-01-02T12:30:00.000Z" }] },
];
