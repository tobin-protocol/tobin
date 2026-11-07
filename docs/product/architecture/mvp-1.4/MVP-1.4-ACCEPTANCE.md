# MVP-1.4 acceptance matrix

PASS (implemented and tested), PARTIAL, NOT TESTED, NOT IMPLEMENTED. SU = `settlement.test.ts` (10 tests), SO = `settlement-ops.test.ts` (16 tests), SJ = `settlement-journey.mjs` (48 checks per width; production build, real SQLite, headless Chrome). All evidence is same-author and local.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Prepare only from the current calculation with an active approval of that exact snapshot; every other precondition enforced server-side | SO preconditions, happy path; SJ steps 1, 2 | PASS |
| 2 | Stale, unapproved, rejected, invalidated, superseded and closed-session cases refused, nothing written | SO preconditions | PASS |
| 3 | Asset registry: network plus code plus issuer identity; unsupported, disabled and ambiguous refused; not API-writable; labelled operator configuration | SU asset; SO asset registry, constraints; SJ step 1 | PASS |
| 4 | Deterministic instructions from the snapshot, exact base-unit arithmetic, stable ids and ordering | SU deterministic, exact arithmetic | PASS |
| 5 | Conservation and reconciliation to approved nets; no zero, negative, duplicate or offsetting instruction | SU (hand-computed ring, 300 seeded cases, tampering cases) | PASS |
| 6 | Zero-net and empty calculations | SU; SO zero-net | PASS |
| 7 | Algorithm reuses the existing engine; independent verification; documented, not claimed minimal | SU; implementation document | PASS |
| 8 | Persistent immutable batch bound to one calculation, asset, preparer, time and validation results | SO happy path, immutability | PASS |
| 9 | Batch review: approve or reject, mandatory reason, bound to batch and fingerprint, one decision, immutable | SO batch review; SJ steps 3, 5 | PASS |
| 10 | Preparer cannot decide; reviewer capability required; administrators prepare | SO authorization, separation; SJ steps 2, 3, 7 | PASS |
| 11 | Source changes and recalculation invalidate batches; history kept; no inheritance; new calculation gives a new batch | SO source changes; SJ steps 4, 6 | PASS |
| 12 | Duplicate requests and races deterministic | SO duplicate, concurrency (two connections, sequential) | PARTIAL (no true multi-process test) |
| 13 | Rollback preserves consistency | SO atomicity | PASS |
| 14 | Organization and session isolation, uniform 404 | SO authorization; SJ step 7 | PASS |
| 15 | UI: preparation checks, prepare, instruction review, validation, review, history, invalidated display, seven-stage ladder, no wording implying funds moved | SJ 48 checks at 1200 and 420 px | PASS |
| 16 | Loading, retry and server-error states of the new panel | present in code; not asserted | PARTIAL |
| 17 | Focus visibility, accessible names and structure | structure and overflow checks in SJ; focus outline is the shared rule, not asserted for new controls | PARTIAL |
| 18 | Activity for preparation, decisions, invalidation | SO activity; SJ step 8 | PASS |
| 19 | Persistence across restart; migration 4 upgrade | SO persistence, migration; SJ step 8 | PASS |
| 20 | Regression: full suite, typecheck, build, all earlier journeys, release scan | `MVP-1.4-CLOSURE.md` | PASS |
| 21 | Light theme, other browsers, screen readers, contrast | not done | NOT TESTED |
| 22 | Multi-process contention, load, backup and restore | not done | NOT TESTED |
| 23 | Independent security review | not done | NOT TESTED |
| 24 | Asset identity carried on obligations; asset administration UI; on-chain asset checks | deferred | NOT IMPLEMENTED (deferred) |
| 25 | Wallets, transaction construction, signing, submission, polling, on-chain verification, settlement | MVP-1.5 and out of scope | NOT IMPLEMENTED (out of scope) |
