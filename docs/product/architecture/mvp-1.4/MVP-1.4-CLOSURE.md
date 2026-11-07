# MVP-1.4 closure

**Verdict: COMPLETE WITH LIMITATIONS.**

**MVP-1.4 prepares settlement instructions. It does not connect wallets, sign transactions, submit transactions or confirm settlement on Stellar.** No funds have moved and nothing is claimed to have. All evidence is local and same-author; no independent review; not production-ready.

## Results (Windows, Node 24.14, Chrome 156 headless; run in this execution)
| Check | Result |
|---|---|
| `node --test test/*.test.ts` (apps/web-console) | 380 tests, 372 pass, 0 fail, 8 skipped (pre-existing skips) |
| New: `settlement.test.ts` / `settlement-ops.test.ts` | 10 / 16 pass (run three times) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build:console` | succeeded |
| settlement journey 1200 / 420 px | 48 of 48 / 48 of 48 |
| authorization journey 1200 / 420 px | 44 of 44 / 44 of 44 |
| clearing journey 1200 / 420 px | 71 of 71 / 71 of 71 |
| backend journey 1200 / 420 px | 42 of 42 / 42 of 42 |
| sessions journey 1200 / 420 px | 78 of 78 / 78 of 78 |
| W0 journey (default width) | 43 of 43 |
| Release scan (web-console lib, components, app, scripts, test; mvp-1.2, 1.3, 1.4 docs) | see final report for the file count; 0 findings |

Defects found by the journey and fixed: the checks and Prepare button were hidden after a data change because an invalidated batch still existed for the stale calculation (two checks failed); the wording check initially matched the page's own negated disclaimer (the check was refined, the page wording is unchanged). Evidence types: automated unit and integration tests (real SQLite, real handlers); automated real-browser journeys (production build); concurrency tested sequentially across two connections only; one 420 px screenshot viewed (prepared batch). Not independently verified.

## Limitations
- Asset registry is local operator configuration: no issuer was verified on any network; obligations carry only a code, so a code matching several supported entries is refused.
- One batch per calculation; any correction, including after a rejection, needs a new calculation, a fresh approval and a new batch.
- No true multi-process concurrency test; loading and retry states and focus visibility of new controls not asserted; Chrome and dark theme only.
- Separation of duties is account-based; no minimum reviewer count; reviewer grants are not approved; refused attempts are not written to activity.
- The 16-instruction limit is a provisional engine target. Preparation never touches wallets, so no participant has a payable address yet.
- Closing a session does not require an approved batch, and approval does not freeze the session beyond making the batch ineligible when anything changes.

## Deferred (not introduced here)
Two genuinely independent reviewers for the controlled pilot (accounts controlled by one individual do not count) and verifiable individual identity and institutional membership before the pilot (MVP-1.8). Wallet connectivity, transaction construction, signing, submission, polling, independent on-chain verification and failure, expiry and duplicate handling (MVP-1.5). Asset identity on obligations and registry administration. Roadmap MVP-1.2 to MVP-1.8 unchanged; MVP-1.5 has not been started.

## Decisions for the owner
1. Should obligations carry a full asset identity (network, code, issuer) so ambiguity cannot arise?
2. Should a rejected batch be re-preparable from the same approved calculation, instead of requiring a new calculation?
3. Should closing a session require an approved, still-eligible batch?

## Formal acceptance
**MVP-1.4 - COMPLETE WITH LIMITATIONS.** Not independently audited, not production-ready, no on-chain settlement. Baselines preserved: MVP-1.2 `b473ad8`, MVP-1.3 `d8db785` (unchanged; migrations 1 to 3 unchanged).

Re-run in a fresh execution before the MVP-1.4 commit: 380 tests, 372 pass, 0 fail, 8 skipped; `tsc` exit 0; production build succeeded; journeys at 1200 and 420 px: settlement 48/48 and 48/48, authorization 44/44 and 44/44, clearing 71/71 and 71/71, backend 42/42 and 42/42, sessions 78/78 and 78/78; W0 43/43; release scan 131 files, 0 findings. (Two runs first hit my own shell timeouts, not failures, and were repeated with longer limits.)

Verified against the code: preparation evaluates the preconditions server-side; derivation uses the engine's largest-first allocation with bigint arithmetic and independent reconciliation; batches, instructions, reviews and invalidations are immutable by trigger; asset identity in the registry is network plus code plus issuer or native, configured only by the operator command, with ambiguous codes refused and no issuers invented; migration 4 is additive.

Limitations preserved: concurrency tested only across two connections sequentially, not multi-process; loading, retry and focus states not asserted; Chrome and dark theme only; same-author evidence; account-based separation of duties and no minimum reviewer count; no registry issuer independently verified; the 16-instruction ceiling is a provisional engine target, not a verified protocol limit.

Three owner decisions raised in this report were approved afterwards and are implemented in MVP-1.5 preparation work (see `../mvp-1.5/`): obligations carry full asset identity; a rejected batch can be prepared again from the same current, approved calculation; session closure requires an approved, still-eligible batch.
