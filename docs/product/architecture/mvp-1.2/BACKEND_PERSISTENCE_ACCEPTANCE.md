# Backend and persistence: acceptance matrix

Status values: PASS, FAIL, BLOCKED, NOT TESTED. Evidence names refer to `BACKEND_PERSISTENCE_TEST_REPORT.md` (DB = `backend-db.test.ts`, SEC = `backend-security.test.ts`, BJ = `backend-journey.mjs`, SJ = `sessions-journey.mjs`). All evidence is same-author and local.

| # | Requirement | Implementation | Verification | Evidence | Status |
|---|---|---|---|---|---|
| **Persistence** |||||
| 1 | Production registry uses durable database storage | `SqliteRegistryStore` via `getBackend` | restart tests | DB restart test, BJ step 7 | PASS |
| 2 | Schema and migrations | `MIGRATIONS`, `migrate`, `migrationStatus` | apply, idempotent, rollback, newer-db refusal | DB (4 tests) | PASS |
| 3 | Organizations, memberships, invitations persist | tables | reopen test | DB restart, BJ 7 | PASS |
| 4 | Sessions and participants persist | tables | reopen, API | DB restart, SEC participants, BJ 7 | PASS |
| 5 | Activity persists, immutable | table and triggers | constraint tests | DB constraints, SEC activity | PASS |
| 6 | Wallet-link claims persist as unproven | `org_wallets`, `proof` ignored from input | reopen, API | DB restart, SEC wallets | PASS |
| 7 | Persistence survives application restarts | file database | process restart in browser journey | BJ step 7 | PASS |
| 8 | No production request falls back to in-memory storage | fail-closed config | unit and live check | SEC S13b; live server without `TOBIN_DB_PATH`: 503 | PASS |
| 9 | Fixtures not seeded or migrated automatically | explicit seed command, refused in production | manual and journeys | seed-demo runs; SJ seeds explicitly | PASS |
| **Authentication** |||||
| 10 | Real authentication integration | local accounts, scrypt, server sessions | tests | SEC auth test, BJ 1, SJ S0 | PASS (local accounts only; external identity provider not configured) |
| 11 | Server-side identity verification | `AuthService.resolve` | tests | SEC S2 | PASS |
| 12 | Login and logout | `/api/auth/*`, nav button | tests, browser | SEC, BJ 1 and 4 | PASS |
| 13 | Expired sessions rejected | 8 h absolute expiry | clock test | SEC S2 | PASS |
| 14 | Arbitrary identity headers rejected | none read | tests | SEC S3, BJ 8 | PASS |
| 15 | Development identity unavailable in production | constructor throws; no route uses it | tests | SEC S13 | PASS |
| 16 | Missing production configuration fails safely | `readBackendConfig` | unit and live | SEC S13b, live 503 | PASS |
| 17 | SSO, MFA, email verification, password reset | not implemented | n/a | not in scope | NOT TESTED (not implemented) |
| **Authorization** |||||
| 18 | Organization isolation enforced server-side | `Registry.#need` | tests | SEC S5, SJ F, BJ 8 | PASS |
| 19 | Admin/member permissions | Registry | tests | SEC S6, BJ 5 | PASS |
| 20 | Unauthorized role changes rejected | admin-only | tests | SEC S6 | PASS |
| 21 | Last-administrator protection | inside transaction | tests | SEC S7, DB, BJ 2 | PASS |
| 22 | Consistent not-found for cross-organization access | same body as nonexistent | tests | SEC S5 | PASS |
| **Invitations** |||||
| 23 | Secure token generation | 192-bit random | code and tests | SEC S11 | PASS |
| 24 | Token hashes persisted, secret never stored | SHA-256 | database dump test | SEC S11 | PASS |
| 25 | Expiry | 7 days | clock test | SEC S9 | PASS |
| 26 | Single use | transactional status check | replay tests | SEC S8, DB two-connection | PASS |
| 27 | Revoked invitations rejected | status | tests | SEC S10 | PASS |
| 28 | Duplicate membership prevented | membership check, composite key | tests | SEC S8 (same user replay) | PASS |
| 29 | Invitation activity recorded | `invitation.created/accepted/revoked` | tests | SEC activity, DB restart | PASS |
| 30 | Email delivery | not configured; UI and API state nothing was sent | browser | BJ 3 | PASS (honest absence); production delivery BLOCKED on a provider |
| **Sessions** |||||
| 31 | Existing Sessions UI works with persistent storage | `/sessions` over the API | journey | SJ 78/78 at both widths | PASS |
| 32 | Draft creation | admin-only | tests | SJ B, BJ 6 | PASS |
| 33 | Session listing organization-scoped | Registry | tests | SEC S5, SJ | PASS |
| 34 | Workspaces load | `workspaceOf` | journey | SJ C/D/E, BJ 6 | PASS |
| 35 | Participants persist | table, API | tests | SEC participants, DB schema | PASS (API and tests; no UI control to add participants) |
| 36 | Activity history persists | table | tests | DB restart, BJ 6 and 7 | PASS |
| 37 | Provenance semantics preserved | Registry plus CHECK constraints | tests | SEC S14/S15, DB constraints | PASS |
| 38 | Fixture records cannot become chain-confirmed through ordinary API | no route; constraint | tests | SEC S14 | PASS |
| 39 | Draft records cannot become chain-confirmed through ordinary API | no route; constraint | tests | SEC S15 | PASS |
| **Organizations UI** |||||
| 40 | Create, list/select, details, members, invitations, accept, role management | `/organizations` | browser | BJ steps 2 to 5 | PASS |
| 41 | Active organization validated server-side | every request carries the organization id and is authorized | tests | SEC S5 | PASS |
| **Quality** |||||
| 42 | Unit tests | | `npm test` | 311 tests, 303 pass, 0 fail, 8 skipped (pre-existing) | PASS |
| 43 | Database integration tests | | real SQLite | DB 9/9 | PASS |
| 44 | Security tests | | | SEC 17/17 | PASS |
| 45 | Browser journeys | | 420 and 1200 px | BJ 42/42 x2, SJ 78/78 x2 | PASS |
| 46 | Regression (W0 journey, registry, sessions) | | | W0 43/43; registry and sessions suites in `npm test` | PASS |
| 47 | Typecheck | | `tsc --noEmit` | exit 0 | PASS |
| 48 | Production build | | `npm run build:console` | succeeded | PASS |
| 49 | Release scan | | | 91 files, 0 findings | PASS |
| 50 | Multi-process write contention, load, backup and restore drill | not done | | | NOT TESTED |
| 51 | PostgreSQL or any second database | not implemented | | | NOT TESTED |
| 52 | Light theme, contrast ratios, screen readers, other browsers | not done | | | NOT TESTED |
| 53 | No unresolved critical security findings | | same-author review only | Security report | PASS (none known; no independent review) |
| 54 | Documentation complete | eight documents | | this folder | PASS |
| 55 | No wallet, Stellar, signer, contract, W0 or W2 change | | diff review | only web-console institutional files, one `.gitignore` entry and package scripts changed | PASS |

Verdict inputs: every core persistence, authentication, authorization and isolation requirement is PASS. Items marked NOT TESTED are outside this milestone or explicitly deferred. Items 17, 30 (production delivery) and the production configuration listed in `BACKEND_PERSISTENCE_OPERATIONS.md` are not configured and are not claimed.
