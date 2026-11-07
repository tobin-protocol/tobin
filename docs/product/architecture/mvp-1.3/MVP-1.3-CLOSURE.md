# MVP-1.3 closure

**Verdict: COMPLETE WITH LIMITATIONS** for institutional clearing authorization as an application-level workflow. An approval is a recorded decision on one calculation. It is not a Stellar signature, transaction, settlement or on-chain fact. All evidence is local and same-author. No independent review, no production-readiness claim.

## Results (2026-11-07, Windows, Node 24.14, Chrome 156 headless)
| Check | Result |
|---|---|
| `node --test test/*.test.ts` (apps/web-console) | 354 tests, 346 pass, 0 fail, 8 skipped (pre-existing skips) |
| New: `authorization.test.ts` and `authorization-ops.test.ts` | 3 + 16 = 19 pass (repeated three times with random ids) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build:console` | succeeded |
| authorization journey 1200 / 420 px | 44 of 44 / 44 of 44 |
| clearing journey 1200 / 420 px | 71 of 71 / 71 of 71 |
| backend journey 1200 / 420 px | 42 of 42 / 42 of 42 |
| sessions journey 1200 / 420 px | 78 of 78 / 78 of 78 |
| W0 journey (default width) | 43 of 43 |
| Release scan (web-console lib, components, app, scripts, test; mvp-1.2 and mvp-1.3 docs) | 121 files, 0 findings |

Evidence types: automated unit and integration tests (real SQLite, real handlers); automated real-browser journeys (production build); concurrency tested sequentially across two connections only; screenshots viewed: the approved state at 420 px. Not independently verified.

## Limitations
- No true multi-process concurrency test; loading and retry states and focus visibility of new controls not asserted; Chrome and dark theme only; no contrast or screen-reader testing.
- Separation of duties is account-based; one person with two accounts defeats it; no identity verification or MFA. An organization needs two accounts to approve anything.
- No minimum number of reviewers, no approval of reviewer grants, no multi-stage committee.
- Refused decision attempts are not written to the activity history.
- Each snapshot can be decided once; reviewing again after a rejection requires recalculating.
- Closing a session does not require an approval, and approval does not freeze the session (what authorization gates is for MVP-1.4 to define).

## Deferred decisions for the owner
1. Whether closing or preparing settlement must require an active approval, and whether approval should freeze the session.
2. A minimum number of distinct reviewers (for example two) and who approves reviewer grants.
3. Whether the separation policy should also cover participant changes.
4. How accounts map to real individuals (identity verification, MFA) before the pilot.

## Boundaries kept
MVP-1.2 frozen behaviour is unchanged (one additive invalidation hook; migrations 1 and 2 untouched; its tests pass with only schema-version assertions updated). Roadmap MVP-1.2 to MVP-1.8 unchanged. MVP-1.4 (Settlement Preparation Engine) has not been started.

## Formal record
**MVP-1.3 - COMPLETE WITH LIMITATIONS.** Not independently audited, not production-ready, not institutionally validated. Baseline MVP-1.2 commit `b473ad8` is preserved and unchanged; migrations 1 and 2 are unchanged. Results above were re-run in a fresh execution before the MVP-1.3 commit (354 tests, 346 pass, 0 fail, 8 skipped; typecheck and build succeeded; authorization, clearing, backend and sessions journeys at 1200 and 420 px: 44/44, 71/71, 42/42, 78/78; W0 43/43).

## Product decisions recorded for future milestones (not implemented here)
- Settlement preparation must require an active approval of the exact current calculation snapshot.
- Approval freezes the approved version logically; corrections require a new revision, a new calculation and a fresh approval.
- One independent reviewer is sufficient for the initial MVP.
- Two genuinely independent reviewers should be required for the controlled institutional pilot (MVP-1.8). Multiple accounts controlled by one individual must not count as independent reviewers.
- Before the pilot, individual identity and institutional membership must be verifiable.
