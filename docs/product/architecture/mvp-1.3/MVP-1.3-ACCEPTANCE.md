# MVP-1.3 acceptance matrix

PASS (implemented and tested), PARTIAL, NOT TESTED, NOT IMPLEMENTED. AU = `authorization.test.ts`, AO = `authorization-ops.test.ts`, AJ = `authorization-journey.mjs` (production build, real SQLite, headless Chrome). All evidence is same-author and local.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Authorized reviewers, granted per organization by an administrator | AO authority; AJ step 2 | PASS |
| 2 | Approve a specific current snapshot; reject with a mandatory reason; history; reviewer and time shown | AO happy path, rejection; AJ steps 3 and 5 | PASS |
| 3 | Organization-scoped, non-disclosing for outsiders | AO isolation; AJ step 7 | PASS |
| 4 | Separation of duties: recorder, editor (including earlier revisions) and calculator cannot decide | AU; AO separation; AJ step 2 | PASS |
| 5 | Decision bound to the exact calculation id; older or unknown ids refused | AO stale/bound | PASS |
| 6 | Stale calculation cannot be approved; closed session cannot receive a decision | AO stale, closed | PASS |
| 7 | Recalculation does not inherit a decision; a new decision is required | AO recalculation; AJ step 4 | PASS |
| 8 | Changed obligations or participants invalidate the approval, recorded explicitly, history kept | AO changes (edit, void, record, add and remove participant); AJ step 6 | PASS |
| 9 | Duplicate and conflicting decisions refused deterministically | AO duplicate, tampering (UNIQUE) | PASS |
| 10 | Concurrent decisions cannot produce inconsistent state | AO concurrency (two connections, sequential in one process) | PARTIAL (no true multi-process test) |
| 11 | Decisions, invalidations and reviewer changes in immutable activity; tables immutable | AO activity; AJ step 8 | PASS |
| 12 | API tampering cannot bypass authorization (body fields, header, session, GET) | AO tampering | PASS |
| 13 | Rollback preserves consistency | AO rollback | PASS |
| 14 | Persistence across restart | AJ step 8; AO migration 3 upgrade | PASS |
| 15 | UI: review the calculation, see eligibility and reasons, approve, reject with reason, history; stages distinguished (readiness, authorization, signing, submission, confirmation) | AJ 44 checks at 1200 and 420 px | PASS |
| 16 | Approved is never shown for readiness alone; approval never presented as a signature | AJ steps 1, 5 | PASS |
| 17 | Loading, retry and server-error states of the new panel | present in code; not asserted | PARTIAL |
| 18 | Focus visibility, accessible names and structure | structure and overflow checks in AJ; focus outline is the shared rule, not asserted for the new controls | PARTIAL |
| 19 | Regression: full suite, typecheck, build, clearing, backend, sessions and W0 journeys, release scan | see `MVP-1.3-CLOSURE.md` | PASS |
| 20 | Light theme, other browsers, screen readers, contrast | not done | NOT TESTED |
| 21 | Multi-process contention, load, backup and restore | not done | NOT TESTED |
| 22 | Independent security review | not done | NOT TESTED |
| 23 | Minimum number of reviewers, approval of grants, multi-stage committees, identity verification, MFA | not part of this milestone | NOT IMPLEMENTED (deferred) |
| 24 | Stellar signing, wallets, transaction construction or submission, settlement, contracts | excluded by scope | NOT IMPLEMENTED (out of scope) |
