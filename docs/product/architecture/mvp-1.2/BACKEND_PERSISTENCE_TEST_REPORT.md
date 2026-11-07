# Backend and persistence: test report

Environment: Windows 11, Node v24.14.0, Chrome 156.0.8078.81 (headless, viewport emulation, dark theme only), production build for all browser journeys, SQLite files created in temporary directories and deleted afterwards. All runs were executed in this milestone; nothing below is carried over from earlier reports unless stated.

## Commands and results
| Command (from `apps/web-console` unless stated) | Result |
|---|---|
| `npm test` (`node --test test/*.test.ts`) | 311 tests, 303 pass, 0 fail, 8 skipped (the 8 skips pre-date this work) |
| of which `node --test test/backend-db.test.ts` | 9 tests, 9 pass |
| of which `node --test test/backend-security.test.ts` | 17 tests, 17 pass |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build:console` (repository root) | succeeded; only warning is Node's ExperimentalWarning for SQLite. Routes: `/`, `/_not-found`, `/api/auth/[...path]`, `/api/bootstrap`, `/api/health`, `/api/registry/[...path]`, `/api/rpc`, `/api/w0/[...path]`, `/organizations`, `/sessions`, `/sign-in`, `/w0` |
| `TOBIN_WIDTH=1200 node test/browser/backend-journey.mjs <abs dir>` | 42 of 42 (run three times during development; the last run after the final UI change) |
| `TOBIN_WIDTH=420 node test/browser/backend-journey.mjs <abs dir>` | 42 of 42 |
| `TOBIN_WIDTH=1200 node test/browser/sessions-journey.mjs <abs dir>` | 78 of 78 |
| `TOBIN_WIDTH=420 node test/browser/sessions-journey.mjs <abs dir>` | 78 of 78 |
| `node test/browser/w0-journey.mjs <dir>` (regression, default 1200px) | 43 of 43 |
| Release scan (`scanFile`) over lib, components, `(institution)`, `app/api`, scripts, test, mvp-1.2 docs | 91 files, 0 findings |
| `node scripts/db.ts status / migrate / seed-demo` (manual) | status before migrate: pending [1]; migrate idempotent (run twice); seed-demo refused without password and refused with `NODE_ENV=production`; succeeded otherwise |

## What the new suites cover
- `backend-db.test.ts`: migration apply, status, idempotence; failing migration rolls back fully; newer database refused; data survives close and reopen of the file (organization, invitation, draft stays `local-draft`, wallet claim `none`, activity order, login); schema constraints (provenance combinations, foreign keys, immutable activity, lower-case unique email); transaction rollback; two connections racing for one invitation; last-administrator rule; backend refuses to start on a too-new database.
- `backend-security.test.ts`: S1 to S15 and the extra controls listed in `BACKEND_PERSISTENCE_SECURITY_REPORT.md`, plus participants, wallet claims, activity and health.
- `backend-journey.mjs` (browser, production build, real database): sign-in page and generic failure, registration, cookie flags, organization creation, last-admin refusal in the UI, invitation with the honest no-email note and one-time code, sign-out, invitee registration and acceptance, wrong code, replay, member limits (cannot create a draft), administrator draft, workspace banner and activity, restart of the server with the same database (session, draft, organization and members survive), isolation between two real accounts, forged headers, removed cookie, `/w0` separation, health. Accessibility structure and horizontal-overflow checks at both widths.
- `sessions-journey.mjs`: the previous 74 checks, adapted: it now seeds a temporary database with the explicit operator command, signs in through the real page, checks cookie flags, and performs isolation with two real accounts (3 new checks in the sign-in step and 1 in isolation).

## Defects found by testing and fixed
1. A failed create showed "Could not load sessions" earlier (previous milestone, unchanged).
2. Keyboard focus outline missing on the new Sign out button (the nav only styled links): fixed.
3. UI race: the "organization created" and "invitation accepted" notices appeared before the lists refreshed, briefly showing "You are not a member of any organization": notice now set after the refresh.
4. Test seams: the Registry clock was not injectable through `createBackend`; added `opts.clock` so expiry can be tested.
5. Turbopack warning from `path.resolve` on an environment value: removed (relative paths are used as given).

## Limits of this evidence
- Same author as the implementation; no independent review.
- Unit and security tests use scrypt cost 10 for speed. The production cost (16) is exercised only by the browser journeys and the seed command, not by the unit suites.
- One browser engine, emulated viewports, dark theme only; contrast ratios and screen readers not tested.
- The two-connection test runs sequentially in one process; true multi-process write contention was not tested.
- No load, soak or backup-restore test. No test against any database other than SQLite.
- Light theme, empty-list browser state, chain-read and chain-confirmed browser states not tested (unchanged from the earlier verification).
- The W0 journey was run once as a regression; W0 code is unchanged.
