# MVP-1.2 freeze record

**MVP-1.2 (Clearing Operations Foundation): ACCEPTED AND FROZEN.**

Clearing remains application-level. Nothing in MVP-1.2 is signed, submitted or settled on Stellar, and nothing is confirmed on a chain. All evidence is local and same-author; no independent security review, no production-readiness claim, no Testnet settlement.

## Accepted scope
The backend and persistence foundation (SQLite, migrations 1 and 2, local accounts and server sessions, organizations, memberships, invitations, unproven wallet claims, immutable activity) and the clearing operations foundation (session participants with soft removal, obligations with revisions and voiding, one asset per session, server-side netting with the existing engine, immutable calculation snapshots, staleness, readiness, the workflow configuring / ready / closed, readable activity, the institutional UI). Details: the eight `BACKEND_PERSISTENCE_*.md` and five `CLEARING_OPERATIONS_*.md` documents in this folder (preserved unchanged except for the final-acceptance section appended to the closure document).

## Verified in this execution (2026-11-07, Windows, Node 24.14, Chrome 156, headless)
| Check | Result |
|---|---|
| `node --test test/*.test.ts` (apps/web-console) | 335 tests, 327 pass, 0 fail, 8 skipped (the 8 skips pre-date MVP-1.2) |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build:console` | succeeded |
| clearing journey 1200 / 420 px | 71 of 71 / 71 of 71 |
| backend journey 1200 / 420 px | 42 of 42 / 42 of 42 |
| sessions journey 1200 / 420 px | 78 of 78 / 78 of 78 |
| W0 journey (regression, default width) | 43 of 43 |
| Release scan over the MVP-1.2 source, tests and documents | 0 findings (count in the final report) |
Criterion-by-criterion evidence: `CLEARING_OPERATIONS_ACCEPTANCE.md` and the security tables in `CLEARING_OPERATIONS_SECURITY_REPORT.md` and `BACKEND_PERSISTENCE_SECURITY_REPORT.md`.

## Frozen boundaries
Database migrations 1 and 2 (never edited; later work adds new numbered migrations); calculation engine use and semantics (`lib/registry/clearing.ts`, snapshot input and hash definition); provenance model; the security checks and tests; the participant, obligation, workflow and activity semantics. Only narrowly scoped bug fixes are allowed, recorded as post-freeze corrections and kept apart from MVP-1.3. MVP-1.3 integrates by adding one hook that records authorization invalidations inside the existing mutation transactions; it changes no MVP-1.2 behaviour.

## Outstanding limitations
Concurrency tested only across two connections sequentially in one process; loading and retry states and focus visibility of new controls not asserted; Chrome and dark theme only, no contrast or screen-reader testing; participants only from the session's own organization; administrators alone record and calculate; asset codes are shape-checked only; single-instance SQLite (`node:sqlite` is experimental); local passwords only, no MFA, SSO, email delivery or password reset; no backup-restore drill.

## Deferred decisions
Debtor or counterparty confirmation of obligations; maker-checker beyond MVP-1.3's authorization; an asset registry; cross-organization participation; production identity provider, email provider, PostgreSQL and hosting.

## Next authorized milestone
MVP-1.3, Institutional Clearing Authorization (`../mvp-1.3/`). The roadmap MVP-1.2 to MVP-1.8 is unchanged.
