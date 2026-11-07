# Clearing operations: closure

**Verdict: COMPLETE WITH LIMITATIONS** for the application-level clearing workflow. Nothing here is on-chain, signed, settled or production-ready. All evidence is same-author and local. Nothing was committed or pushed.

## Implemented and tested (PASS)
Session participant management; persisted obligations (create, update with revisions, void); validation (amount, parties, asset, one asset per session); netting with the existing engine from persisted obligations; immutable calculation snapshots; staleness; readiness checks; workflow (configuring, ready, closed); activity for all operations; persistence across restarts; organization and session isolation; the whole flow in the institutional UI.

## Results (this milestone, this machine: Windows, Node 24.14, Chrome 156)
| Check | Result |
|---|---|
| `npm test` (`node --test test/*.test.ts`, `apps/web-console`) | 335 tests, 327 pass, 0 fail, 8 skipped (the 8 skips pre-date this work) |
| New: `clearing.test.ts` / `clearing-ops.test.ts` | 12 / 12 pass (the ops file was run repeatedly with random ids) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build:console` | succeeded |
| `TOBIN_WIDTH=1200 / 420 node test/browser/clearing-journey.mjs` | 71 of 71 / 71 of 71 |
| backend journey 1200 / 420 | 42 of 42 / 42 of 42 |
| sessions journey 1200 / 420 | 78 of 78 / 78 of 78 |
| W0 journey (regression) | 43 of 43 |
| Release scan (`scanFile`, web-console lib, components, app, scripts, test, and mvp-1.2 docs) | 0 findings (file count in the final reply) |

Existing tests changed (not removed or weakened): schema version expectations (1 to 2); "removing a member removes the participant record" now asserts the stronger "kept, marked removed"; two journeys' old wording checks ("a draft has no obligations", raw activity kind names) were replaced by the new empty states and readable labels, with the same number of checks.

## Partially implemented / not tested
- Concurrency tested only across two connections sequentially, not true multi-process.
- Loading and retry states exist but are not asserted by a test; focus visibility of the new controls relies on the shared CSS rule and was not asserted.
- Screenshots viewed: obligations and net positions at 420 px only; other screenshots were saved but not viewed.
- Chrome only, dark theme only, emulated viewports; no contrast or screen-reader testing.

## Not implemented (by scope or design)
Participants from other organizations; counterparty confirmation or debtor authorization of obligations; maker-checker separation; asset registry; wallets, signing, settlement, contracts, on-chain confirmation; production identity, email, PostgreSQL, multi-instance hosting.

## Known limitations
- Administrators alone create obligations and run calculations.
- Netting handles are bookkeeping keys derived from session and user ids; they are not wallets.
- A single session nets a single asset.
- Position order in a snapshot follows sorted user ids, not names.
- Production configuration items from `BACKEND_PERSISTENCE_OPERATIONS.md` remain outstanding.

## Decisions for the owner
1. Whether obligations need debtor authorization or counterparty confirmation before netting (changes the trust model; needs cross-organization design).
2. Whether to separate who records from who calculates and approves readiness (maker-checker).
3. An asset registry or allow-list instead of shape-only asset codes.
4. Whether "ready" should later gate a signing phase, and what freezes at that point.

## Final acceptance (added at the freeze)
Re-verified in a fresh execution before acceptance: unit suite 335 tests, 327 pass, 0 fail, 8 skipped; typecheck exit 0; build succeeded; clearing journey 71/71 at 1200 and 420 px; backend journey 42/42 at both; sessions journey 78/78 at both; W0 journey 43/43. Verdict recorded in `MVP-1.2-FREEZE.md`: MVP-1.2 ACCEPTED AND FROZEN. Clearing remains application-level and is not signed, submitted or settled on Stellar. All evidence is local and same-author.
