// What reopening a session really does, for the confirmation dialog. Every line is something the console does (apps/web-console/lib/registry/service.ts, read
// 2026-11-09), not an assumption:
//   POST .../sessions/:id/reopen  is administrator only (#need admin). The session must be "ready" (the only state with a transition back to "configuring";
//   a configuring or closed session gets INVALID_STATE). It changes the workflow state and NOTHING else: the calculation, the review decisions and any
//   prepared settlement batch are not touched by reopening itself. Participants, obligations and netting need "configuring" (#editable), so the FIRST
//   change made afterwards calls #invalidate: every review decision stops applying, the calculation becomes stale (its input hash no longer matches) and a
//   prepared batch becomes ineligible. Nothing is deleted: the old decisions and batch stay on record, marked "No longer applies". A closed session
//   cannot be reopened.
export interface Consequence { kind: "changes" | "kept" | "stale"; text: string }

export const REOPEN_CONSEQUENCES: readonly Consequence[] = [
  { kind: "changes", text: "The session becomes \"Being configured\" again. Participants and obligations can change, and netting can be run again." },
  { kind: "kept", text: "Reopening alone deletes nothing and changes no record: the calculation, every review decision and any prepared settlement stay exactly as they are." },
  { kind: "stale", text: "The first change you make afterwards (adding or removing a participant, recording or voiding an obligation, or running netting) makes every review decision stop applying and the calculation stale. A prepared settlement then no longer applies either." },
  { kind: "stale", text: "Nothing is erased. Old decisions and the old settlement stay on record, marked \"No longer applies\". You then calculate, review, prepare and review again, and mark the session ready again." },
];

export const KIND_LABEL: Record<Consequence["kind"], string> = { changes: "What changes", kept: "What is kept", stale: "What stops applying later" };
