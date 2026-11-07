# Clearing operations: acceptance matrix

Status values: PASS (implemented and tested), PARTIAL, FAIL, BLOCKED, NOT TESTED. OPS = `test/clearing-ops.test.ts`, UNIT = `test/clearing.test.ts`, CJ = `test/browser/clearing-journey.mjs` (production build, real SQLite, headless Chrome, real cookies). All evidence is same-author and local.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Admins manage session participants (add, list, details, remove, status, organization shown) | OPS participants, end-to-end; CJ steps 2 and 5 | PASS |
| 2 | Duplicate participants prevented; only organization members eligible | OPS participants | PASS |
| 3 | Removal refused while active obligations exist; safe resolution path (void first) | OPS participants; CJ step 5 | PASS |
| 4 | Participants from another organization | not supported by design (needs cross-organization authorization) | NOT IMPLEMENTED (deferred) |
| 5 | Obligations: create, list, details, update (revisions), void, history kept | OPS; CJ steps 3, 4, 7 | PASS |
| 6 | Validation: amounts, same party, non-participants, removed participants, asset, mixed assets, size, authority | UNIT amounts and assets; OPS validation; CJ step 3 | PASS |
| 7 | Exact arithmetic, no rounding | UNIT (28-digit amounts, i128 bounds); OPS | PASS |
| 8 | Netting by the existing engine from persisted obligations; never from the client | UNIT; OPS calculation; CJ step 6 | PASS |
| 9 | Deterministic and value-conserving results (hand-computed expected values) | UNIT; OPS end-to-end; CJ steps 6 and 7 | PASS |
| 10 | Calculation snapshot with input, hash, time, actor, asset | OPS (persisted and reloaded); constraints | PASS |
| 11 | Staleness after any change; stale never shown as current | UNIT; OPS; CJ step 7 | PASS |
| 12 | Readiness checks reflect persisted state, with fix hints | UNIT; OPS; CJ steps 1, 7, 8 | PASS |
| 13 | Workflow transitions explicit; edits frozen when ready or closed; closed final | UNIT; OPS | PASS |
| 14 | Activity for participants, obligations, calculation, state, readiness; immutable; no secrets | OPS activity, constraints; CJ step 9 | PASS |
| 15 | Calculation failure recorded as activity | OPS calculation (no obligations, then success) | PASS |
| 16 | Persistence across reopen and restart | OPS persistence, version-1 upgrade; CJ steps 10 and 11 | PASS |
| 17 | Cross-organization and cross-session isolation; uniform 404 | OPS isolation; CJ step 13 | PASS |
| 18 | Member (non-admin) limits in UI and API | OPS; CJ step 12 | PASS |
| 19 | Transactions, constraints, rollback | OPS atomicity, constraints | PASS |
| 20 | Concurrency across two connections | OPS (sequential, one process) | PARTIAL (no true multi-process test) |
| 21 | Complete workflow usable through the UI, desktop and 420 px | CJ 71 checks at each width | PASS |
| 22 | Loading, empty, error, success, validation states | CJ (empty, validation, success, server error shown); loading and retry states exist but are not asserted | PARTIAL |
| 23 | Mobile action wrapping, keyboard focus, labels | CJ structure and overflow checks; screenshots viewed at 420 px (obligations, net positions); focus outline shared CSS (not asserted for new controls) | PARTIAL |
| 24 | Regression: unit suite, typecheck, build, backend journey, sessions journey, W0 journey | see closure report | PASS |
| 25 | Release scan | see closure report | PASS |
| 26 | Light theme, other browsers, screen readers, contrast | not done | NOT TESTED |
| 27 | Multi-process contention, load, backup and restore | not done | NOT TESTED |
| 28 | Independent security review | not done | NOT TESTED |
| 29 | Wallets, signing, settlement, contracts, on-chain confirmation | out of scope; nothing implemented | NOT IMPLEMENTED (out of scope) |
