# Backend and persistence: implementation report

All paths are under `apps/web-console/` unless stated. Nothing was committed.

## What was built
**Persistence.** `lib/db/database.ts` (connection, `tx()` transactions with BEGIN IMMEDIATE, migration runner and status), `lib/registry/sqlite-store.ts` (`RegistryStore` over SQLite). `RegistryStore` gained `transaction()`, `putParticipant()` and `participantsOfSession()`; the in-memory store implements them (snapshot rollback) and is now documented as unit-test-only.

**Registry** (`lib/registry/service.ts`). Public behaviour preserved; every mutating method now runs inside `store.transaction`. Added: `addSessionParticipant`, `sessionParticipants`, email binding on invitation acceptance (verified users only). Types: `SessionParticipant`; `ActingUser.email`.

**Authentication** (`lib/auth/service.ts`, `lib/auth/http.ts`). Register, login, logout, `me`; scrypt hashing; server-side sessions (SHA-256 of an opaque token); persisted failure throttling; cookie `tobin_session`.

**Backend wiring** (`lib/server/backend.ts`). Process singleton; reads `TOBIN_DB_PATH`; production without it, or with `:memory:`, throws `BackendUnavailable` so every request answers 503. No in-memory fallback exists on this path.

**API** (`lib/registry/http.ts`, `app/api/...`).
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/register`, `/login`, `/logout` | POST | account and session lifecycle |
| `/api/auth/me` | GET | current user |
| `/api/health` | GET | status, schema version, pending migrations only |
| `/api/registry/orgs` | GET, POST | list mine, create |
| `/api/registry/orgs/:org` | GET | details and my role |
| `.../:org/update` | POST | profile (admin) |
| `.../:org/members` | GET | members (email visible to admins only) |
| `.../:org/members/:uid/role`, `/remove` | POST | role change, removal (admin, last-admin protected) |
| `.../:org/invitations` | GET (admin), POST | list, create (token returned once) |
| `.../:org/invitations/:id/revoke` | POST | revoke |
| `/api/registry/invitations/accept` | POST | accept with token |
| `.../:org/wallets` | GET, POST | unproven wallet claims |
| `.../:org/sessions` | GET, POST | listing, local draft |
| `.../:org/sessions/:id` | GET | workspace |
| `.../:org/sessions/:id/participants` | POST | application participant (admin) |
There is no route that sets or changes provenance, no chain read, no confirmation, and no way to edit or delete activity. Mutations are POST to stay within the existing proxy guards.

**UI** (existing design system, no new library). `/sign-in` (`components/auth-panel.tsx`), `/organizations` (`components/organizations-app.tsx`: select, create, details, members, roles, invitations, accept), institutional navigation extended with Organizations and an account area (`components/institution-nav.tsx`), `/sessions` now uses cookie authentication, shows who is signed in, prompts sign-in, and explains the no-organization case. Shared `components/api-client.ts`. `(institution)/layout.tsx` now also loads the shared session styles.

**Operator tooling.** `scripts/db.ts` with `migrate`, `status`, `seed-demo`; npm scripts `db:migrate`, `db:status`, `db:seed-demo`, `test:backend-browser`.

## Registry behaviour changes (intentional)
- Fixtures: no longer seeded at startup (`lib/registry/demo-seed.ts`, explicit command only).
- Development identity: no longer reachable from any route; `TOBIN_ALLOW_DEV_IDENTITY` is no longer read anywhere.
- Workspace Participants tab: shows application participants when recorded (labelled as not an on-chain admission); otherwise the previous "no admitted participants" explanation.
- Activity "Who" shows the display name when known.

## Files created
`lib/db/database.ts`, `lib/db/node-sqlite.d.ts`, `lib/registry/sqlite-store.ts`, `lib/registry/demo-seed.ts`, `lib/auth/service.ts`, `lib/auth/http.ts`, `lib/server/backend.ts`, `app/api/auth/[...path]/route.ts`, `app/api/health/route.ts`, `app/(institution)/sign-in/page.tsx`, `app/(institution)/organizations/page.tsx`, `components/api-client.ts`, `components/auth-panel.tsx`, `components/organizations-app.tsx`, `scripts/db.ts`, `test/backend-helpers.ts`, `test/backend-db.test.ts`, `test/backend-security.test.ts`, `test/browser/backend-journey.mjs`, and the documents in `docs/product/architecture/mvp-1.2/`.

## Files modified
`lib/registry/{types,store,service,identity,http,session-view}.ts`, `app/api/registry/[...path]/route.ts`, `app/(institution)/{layout.tsx,institution.css,sessions/page.tsx}`, `components/institution-nav.tsx`, `components/sessions/sessions-app.tsx`, `test/sessions.test.ts` (authentication seam and request header), `test/browser/sessions-journey.mjs` (real sign-in against a seeded temporary database; banner and isolation checks adapted), `package.json` (scripts), root `.gitignore` (`.data/`).
`/w0`, `/`, W0 libraries, contracts, signer, W2 helper, the registry rules' provenance semantics: not modified.

## Dependencies
None added. SQLite is `node:sqlite` (Node 24); scrypt and hashing are `node:crypto`.
