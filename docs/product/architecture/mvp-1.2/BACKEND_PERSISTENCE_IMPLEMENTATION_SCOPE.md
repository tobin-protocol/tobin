# Backend and persistence: implementation scope

## In scope (implemented)
- Durable SQLite persistence of organizations, memberships and roles, invitations, wallet-link claims, session records with provenance, session participants, activity, users and server-side auth sessions; versioned migrations with observable status.
- Local email and password authentication with server-side sessions, login, logout, expiry handling, secure cookie, rate-limited sign-in; development identity restricted to unit tests.
- Organization backend: create, read, list mine, update profile, members, role changes, removal, last-administrator protection, isolation.
- Invitation lifecycle: create, hash-only storage, expiry, single use, revoke, accept, duplicate prevention, email binding, activity.
- Persistent session registry and participants with unchanged provenance semantics; append-only activity.
- API: `/api/auth/*`, `/api/registry/*` (existing routes preserved; new organization, member, invitation, wallet-claim and participant routes), `/api/health`.
- Minimum UI on the existing design system: `/sign-in`, `/organizations`, sign-in prompts and account area in the institutional navigation; `/sessions` switched to authenticated data.
- Operator commands `db:migrate`, `db:status`, `db:seed-demo`.
- Tests: unit, database integration, security, browser journeys; documentation.

## Excluded (not touched)
Freighter and wallet work, transaction preparation or signing, Stellar SDK and RPC readers, contract decoding, contracts, multisig, signer tooling, W0/W1 console, W2 helper, the 10-ledger expiry policy, settlement, minting, payment routing, new netting, a new navigation system beyond two entries and the account area, redesign, analytics, deployment automation, email delivery, SSO, MFA, password reset, PostgreSQL.

## Acceptance criteria
The matrix in `BACKEND_PERSISTENCE_ACCEPTANCE.md` (PASS, FAIL, BLOCKED, NOT TESTED).

## Test strategy
1. Unit tests: Registry rules over the in-memory store (existing `registry.test.ts`, `sessions.test.ts`).
2. Database integration (`backend-db.test.ts`): real SQLite, migrations, restart persistence, constraints, transactions, two connections.
3. Security (`backend-security.test.ts`): real handlers, real sessions; one test per threat in `BACKEND_PERSISTENCE_SECURITY_REPORT.md`.
4. Browser journeys against a production build and a real database file: `sessions-journey.mjs` (existing journey adapted to real sign-in) and `backend-journey.mjs`, each at 420px and 1200px.
5. Regression: full web-console suite, typecheck, production build, release scan, existing W0 journey.
