# User interfaces and the console

Status: technical document of the SCF Build Award (Open Track) submission package, 2026-11-09. Records the canonical UI decision and a PLAN for the future of `apps/web-console`; nothing is deleted or changed by this document. Our own recommended documentation (Open Track point 8 asks for UI/UX material in one place).
Evidence basis: `apps/web`, `apps/web-console` (routes, components, libraries, scripts, tests listing), `.github/workflows/`, `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md`, `docs/backend-audit/frontend-backend-mapping.md`. Tests and CI were read, not run.

Related: [architecture.md](architecture.md), [api-reference.md](api-reference.md).

## 1. Decision

`apps/web` is the canonical user-facing application (owner decision). `apps/web-console` stays as the backend: its HTTP API, SQLite persistence and operational tooling are the only implementation of those responsibilities. Its own pages are an older institutional UI plus operator tools; they are not the product surface going forward. Until the plan in section 5 is carried out, both UIs work against the same API.

## 2. What `apps/web-console` is today

### 2.1 API routes (`app/api`)

| Route | Purpose | Served by a hosted console? |
|---|---|---|
| `/api/auth/[...path]` | register, login, logout, `me`, `audit`, wallet challenge/verify, link, remove, profile, workspace, renew, logout-all | yes |
| `/api/registry/[...path]` | organizations, members, reviewers, invitations, sessions, participants, obligations, calculation, authorization, settlement preparation, execution records, wallet challenges, signer sets | yes |
| `/api/public/[...path]` | read-only Discover data (`/api/public/v1/...`) | yes (needs the proxy secret) |
| `/api/health`, `/api/live`, `/api/ready` | probes | yes (probe Host allowed) |
| `/api/stellar/cosign`, `/api/stellar/run`, `/api/stellar/validation` | owner-run Testnet tools (section 2.3) | no: 404 |
| `/api/bootstrap`, `/api/rpc` | MVP-1 local sandbox backed by the Rust bridge | no: 404 |
| `/api/w0/[...path]` | in-memory mock API with its own cookie and CSRF token | no: 404 |

The hosted allow-list is one regular expression, `^\/api\/(auth|registry|public|health|live|ready)(\/|$)` (`lib/server/config.ts:21`); the sandbox and W0 handlers also refuse in hosted mode as a second line (`lib/server/api.ts`, `app/api/w0/[...path]/route.ts`). No page is served by a hosted console. Endpoint detail is in [api-reference.md](api-reference.md).

### 2.2 Pages

| Group | Pages (`app/`) | Purpose |
|---|---|---|
| Institution (`(institution)`) | `/sign-in`, `/onboarding`, `/join`, `/account`, `/organizations`, `/sessions` | Wallet sign-in; profile and organization setup; accept an invitation; account, wallets and wallet ownership verification; organization, members, reviewers, invitations; the clearing workspace (participants, obligations, calculation, authorization, settlement preparation, execution records and attempts) |
| Owner tools | `/wallet-check`, `/cosign-check`, `/settle-run` | Section 2.3 |
| Sandbox | `/` | MVP-1 local sandbox: the real contracts in the Soroban test host through the Rust bridge, simulated unsigned authorizations, labelled as a sandbox |
| W0 | `/w0` | Mock-adapter signer console; no Stellar access |

### 2.3 What only the console provides

- The owner-run Stellar tools: Freighter validation (`/wallet-check`), transaction-level co-signing check (`/cosign-check`), the one-unit step-by-step settlement (`/settle-run`). Their server side is `lib/stellar/{run,cosign,owner-validation,owner-access,signer-set,rpc,live,compare}.ts`. `apps/web` has no equivalent and its proxy cannot reach them (`proxy-policy.ts:7`). Details and limits: [stellar-integration.md](stellar-integration.md) section 6.
- Email registration and login UI (`components/auth-panel.tsx`, used by `wallet-signin.tsx`); `apps/web` offers email and wallet sign-in too (section 4).
- Wallet ownership verification for an organization (challenge, sign, verify) through `components/wallet-verification.tsx` and the account page. Signer-set snapshots have API routes but no screen in either UI. `apps/web` shows verified accounts read-only (`components/wallets/Wallets.tsx`).
- Execution record start and attempt planning buttons (`components/sessions/settlement-panel.tsx:198,288`). `apps/web` shows execution state read-only (`components/settlement/Steps.tsx`).
- The operator CLI for the database: `scripts/db.ts` (`migrate`, `status`, `asset-add`, `asset-disable`, `asset-list`, `seed-demo`; seeding refused in production). Asset configuration has no API.

### 2.4 Persistence and migrations

SQLite file through `node:sqlite` at `TOBIN_DB_PATH` (required in production; an in-memory path is refused in production, `lib/server/backend.ts:18-27`). WAL, `foreign_keys=ON`, `busy_timeout=5000`, writes in `BEGIN IMMEDIATE` transactions. Migrations 1 to 8 are TypeScript strings in `lib/db/database.ts`, each applied in its own transaction and recorded in `schema_migrations`; a database newer than the code is refused. `/api/ready` reports 503 while migrations are pending. The singleton backend lives on `globalThis`, so the design assumes one process (single replica). Tables and immutability: [technical-specification.md](technical-specification.md) section 11.

### 2.5 Authentication, sessions, guards

- Opaque random session token in an `HttpOnly`, `SameSite=Strict` cookie (`tobin_session`, `Secure` in production); only its SHA-256 is stored. Email accounts use scrypt; wallet sign-in uses a server-built, single-use, 5-minute challenge. Idle and absolute limits for wallet sessions are in the specification section 13.
- Guards (`proxy.ts`, `lib/server/guards.ts`): local mode accepts only `127.0.0.1:PORT` and `localhost:PORT` as Host, refuses foreign Origin on `/api`, requires JSON for POST. Hosted mode accepts only configured hosts, serves only the hosted path list, requires the shared proxy secret on every non-probe request (constant-time comparison), refuses to start when configuration is missing (`instrumentation.ts`). Every non-GET registry or auth request also needs header `x-tobin-request: 1`.
- Authorization is enforced in `Registry` on every call, never from a client-supplied role or id.

## 3. Dependencies on each part (what would break)

| Part | Depended on by | Evidence |
|---|---|---|
| `/api/auth`, `/api/registry`, `/api/public`, probes, SQLite | `apps/web` (all data), the hosted deployment, CI hosted-mode check | `apps/web/lib/tobin/client.ts`, `proxy.ts`; `ci.yml` job "Web app" runs `apps/web/scripts/check-hosted-config.mjs` against a console build |
| Institution pages | nothing in `apps/web`; console tests `test/browser/{sessions,settlement,authorization,clearing,backend,wallet-auth}-journey.mjs` (run locally; not in the CI files we read except where listed below) | `apps/web-console/package.json` scripts |
| Owner tools (`lib/stellar/*`, three pages, three routes) | the MVP-1.5 evidence procedure; unit tests `run.test.ts`, `stellar-*.test.ts`, `signer-set*.test.ts`, `attempts-ops.test.ts`, `entry-lifetime-policy.test.ts` | `test/` listing; `ci.yml` runs `npm test --workspace tobin-web-console` |
| Sandbox (`/`, `/api/bootstrap`, `/api/rpc`, `lib/console`, `lib/server/{api,sandbox}.ts`) | tests `console*.test.ts`, `api.test.ts`; the browser job in `.github/workflows/integration.yml` (`journey.mjs` at 1200 and 420 px, needs the Rust bridge) | workflow files |
| W0 (`/w0`, `/api/w0`, `lib/w0`) | tests `w0-*.test.ts`, `w1-*.test.ts`; its own workflow `.github/workflows/w0-console.yml` | workflow file |

## 4. Overlap: capabilities by UI

"Differs" notes behaviour that is not the same in the two UIs (from reading the components and client code).

| Capability | `apps/web` | `apps/web-console` pages | Differs |
|---|---|---|---|
| Email register and sign in | `/sign-in` | auth panel inside `/sign-in` | wording and layout only |
| Wallet sign-in (Freighter message) | Connect wallet window, scheme `sep-53` | `/sign-in` | console also accepts a `raw` scheme at the API |
| Onboarding (profile, first organization) | `/onboarding` | `/onboarding` | same API |
| Accept invitation | `acceptInvitation` client method; the `/onboarding` route handles joining (not traced further) | `/join` | same API |
| Organization, members, roles, reviewer grants, invitations | `/organization` | `/organizations` | same API; `apps/web` states what a role change grants and removes |
| Account: wallets, audit, profile, log out everywhere | `/settings`, `/organization?tab=wallets` | `/account` | `apps/web` wallets tab is read-only for linking; the console `/account` offers ownership verification |
| Wallet ownership verification for an organization | read-only list | `/account` (challenge, sign, verify) | **console only** |
| Signer-set snapshots | permission defined (`signer-sets.record`), no screen found | no screen found; API only (`POST .../signer-sets`) | neither UI |
| Sessions list and create | `/sessions`, `/sessions/new` | `/sessions` | `apps/web` has a creation wizard and cross-session overview |
| Participants, obligations (record, void), edit | session workspace tabs | session workspace | `apps/web` client has `record` and `void`; the console UI also offers `update` |
| Netting calculation | Netting tab, `calculate` | calculate button | same API |
| Mark ready, reopen, close | session actions | session actions | same API |
| Approve or reject a calculation | `/reviews`, session | authorization panel | same API |
| Prepare a settlement batch; approve or reject it | settlement steps 2 and 3 | settlement panel | same API |
| Execution record and attempt planning (start, begin) | read-only step 4 | buttons | **console only** (writes) |
| Cross-session Overview, Reviews, global Obligations and Activity | yes, derived in the browser from up to 10 sessions by default | no | `apps/web` only; derived, not aggregate endpoints |
| Public Discover | `/discover` page reads `GET /api/public/v1/*` through the proxy (`lib/discover/http.ts`, merged in #52); live-verified 2026-11-09 at 1440, 768 and 390 px (all four calls 200; "No data" for the three null figures, 0 institutions opted in, empty lists). Known issue: the Institutions tab empty state reuses "Public settlement data is not available yet." (`lib/discover/view.ts:26`) | none | wired; lists empty |
| Wallet check, co-sign check, one-unit settlement | none | `/wallet-check`, `/cosign-check`, `/settle-run` | **console only**, local only |
| Sandbox and W0 | none | `/`, `/w0` | console only, development tools |
| Notifications, signing/submission/verification in the UI | marked "not supported" | owner tools only | n/a |

## 5. Migration and retirement plan (a plan only)

Principle: the backend API and the owner tools are the assets; the console's own institutional pages are the part that can retire. Each step has entry and exit criteria; no step is started by this document. Steps are ordered, but the owner decides timing and whether the later ones happen. Their relation to milestones MVP-1.6 and MVP-1.7 is stated in [../product/roadmap.md](../product/roadmap.md); milestones are not tranches.

| # | Step | Entry criteria | Exit criteria | Main risk |
|---|---|---|---|---|
| 1 | Close the read-only gaps in `apps/web`: wallet ownership verification, a signer-set screen, execution-record and attempt-planning actions, invitation acceptance parity | The routes stay unchanged; permission rules (`apps/web/lib/permissions/can.ts`) already define the actions | Each console-only row of section 4 marked "console only" for writes is available in `apps/web` with tests; no API change | Duplicated UI rules drift from `Registry`; the server remains the authority |
| 2 | Wire Discover to `GET /api/public/v1/*` (done in #52; kept for the record) | Step 1 not required; Discover contract (`docs/web-redesign/discover-contract.md`) | The page shows real opted-in institutions and says settlements are not published | Publishing more than the opt-in name, type and jurisdiction |
| 3 | Real-extension validation of wallet-first sign-in in `apps/web` | An installed Freighter in Edge and Chrome | Recorded results for connect, sign, reject, wrong network, locked | Outstanding item in `AGENTS.md` section 13; failure blocks step 5 |
| 4 | Decide the hosted owner-tool path (approval-gated): either keep the tools local, or add a settlement execution surface to `apps/web` | Owner approval of P8 design (not approved today); BD-05/BD-19 respected (no key on the server) | An approved design and a test plan; until then nothing changes | Largest security surface; this is the point at which hosted signing flows would first exist |
| 5 | Stop linking to console pages and retire `(institution)` pages | Steps 1 and 3 done; the browser journeys for those pages replaced by `apps/web` Playwright tests; `check-hosted-config.mjs` unaffected | No user-facing console page is linked; console journeys removed or kept only for the sandbox | Losing the only screen for an operation (check the section 4 table again) |
| 6 | Move the console toward a headless API package | Step 5 done | Route handlers unchanged; pages directory removed from the production image only | Build scripts and CI jobs that assume pages exist (`build:console`, W0 workflow) |
| 7 | Retire the sandbox and W0 | Nothing uses them: remove `integration.yml` browser job and `w0-console.yml`, the `console*.test.ts`, `w0-*.test.ts`, `w1-*.test.ts` files and the two route families together | The test suites and workflows referencing them are gone in the same change; CI green | The sandbox is the only place the real contracts are exercised through the TypeScript SDK in a browser; the Rust bridge tests in `packages/mvp1-sdk` remain |

Must NOT be removed by this plan: the backend API (`/api/auth`, `/api/registry`, `/api/public`, probes), the SQLite persistence and migrations (until the separate PostgreSQL migration, P3 to P5, replaces them under its own plan), `scripts/db.ts` (it is the only way to configure assets), the owner tools and their libraries until an equivalent in `apps/web` or an approved replacement exists and has been used once with evidence, the hosted guards, and every history table or trigger. The sandbox and W0 are removable only after the checks in step 7.

## 6. Limits of this document

Component-level behaviour was read from code, not exercised. Accessibility, cross-browser behaviour and mobile layouts of `apps/web` are partly or not reviewed (`docs/web-redesign/open-items.md`). Real-extension wallet sign-in in `apps/web` is not yet validated.
