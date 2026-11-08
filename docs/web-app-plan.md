# Tobin web app (`apps/web`): build plan

Status: **plan for review. Nothing has been built.** Written 2026-11-08 after reading `docs/web-app-prd.md`, `docs/web-app-design-spec.md`, the root and app READMEs, `AGENTS.md`, every `package.json`, and the source of the existing application's HTTP surface (`apps/web-console/lib/registry/http.ts`, `lib/auth/http.ts`, `lib/server/guards.ts`, `lib/registry/types.ts`, the `app/api/stellar/*` routes).

Terms follow [`COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`](COMMUNICATION-AND-MATURITY-TERMINOLOGY.md). Every statement about the backend below was read from source, not assumed.

## 1. What the repository is today

| Item | Finding |
|---|---|
| Package manager | npm workspaces (`apps/*`, `packages/*`), one root lockfile, Node 24 |
| Existing apps | `apps/landing` (Next.js 16.4.3, React 19.3, Tailwind v4 through `@tailwindcss/turbopack`, motion), `apps/docs` (Fumadocs), `apps/web-console` (Next.js 16.4.3, **no Tailwind**, plain CSS) |
| Backend | **`apps/web-console` is both the UI and the only backend.** Its Next.js route handlers (`/api/auth`, `/api/registry`, `/api/stellar/*`, `/api/health`) and a SQLite file (`node:sqlite`, numbered migrations, immutable tables) are the application. There is no separate API service |
| Protocol and SDK | `contracts/` (Soroban, Rust) and `packages/mvp1-sdk` (netting engine, digests, prepared contract calls, a local-bridge transport only; **no network or wallet transport**) |
| Wallet library | `@stellar/freighter-api` 6.0.1 is already pinned and used by the console. `@stellar/stellar-sdk` 17.4.0 is pinned. **Stellar Wallets Kit is not installed** |
| Stage | Implemented MVP-1.2 to MVP-1.5 and wallet-first auth; Stellar Testnet only; production deployment not approved; evidence is same-author. The UI will say so (PRD and prompt section 1) |
| Libraries the prompt lists | `zod` is present (a transitive dependency). **Absent:** TanStack Query, TanStack Table, react-hook-form, nuqs, Playwright, Geist. Each needs `npm install` and a regenerated `ci/dependency-baseline.csv` |

## 2. Findings that change how the build must work

These are not preferences. Each one is a fact in the code that the PRD or the prompt did not account for.

**F1. A full institutional web application already exists.** `apps/web-console` already has sign-in, onboarding, organizations, sessions, obligations, netting, reviewer authorization, settlement preparation, and owner-run Stellar tools. `apps/web` would be a **second UI over the same backend**, not a greenfield app. This needs an explicit relationship decision (section 8, D1).

**F2. The API cannot be called from another origin.** `guards.ts` accepts only `Host` equal to `127.0.0.1:PORT` or `localhost:PORT`, refuses any foreign `Origin` on `/api/*` with 403, sends no CORS headers, requires an `x-tobin-request: 1` header on every non-GET, and the session cookie is `HttpOnly; SameSite=Strict`. A browser page served from `apps/web` therefore cannot call it directly. **Workable without a backend change:** `apps/web` exposes a same-origin proxy (a Next.js route handler, a BFF) that forwards the request and cookies server-side, drops the browser `Origin`, and adds the request header. Changing the guards is a backend change and would need your approval.

**F3. A "session" is a single-organization application record, and participants are users.** `SessionParticipant` is a *user* of the acting organization; `viewParticipants` labels every participant with the acting organization's name. Debtors and creditors of an obligation are user ids. There is no cross-organization session, no external participant, no session invitation to another organization, and no "join" operation in the application. Cross-organization clearing exists only in the contract (Stellar accounts as participants). PRD sections 2.6, 7.2 (Participants step), 7.3, 8.4 and Journey 4 have **no backend support**.

**F4. Several PRD screens have no endpoint.** There is no org-wide obligations list (obligations are per session), no org-wide activity feed (activity is returned inside a session workspace; `/api/auth/audit` returns only the signed-in user's own events), no notifications, no search, no ownership transfer, and no member "last activity". Client-side aggregation over sessions is possible for obligations and activity, but is N+1 requests and must be labelled as such.

**F5. The role model differs from the PRD.** Real: membership `role` is `admin` or `member`; a **reviewer** is a separate grant (`org_reviewers`); membership `status` is `active` or `suspended`. The PRD's Owner, Operator, Approver and Viewer do not exist. There is a `LAST_ADMIN` rule instead of an owner. **Every write operation is admin-only** (`service.ts`, `#need(orgId, u, true)`): creating sessions, adding participants, recording, correcting and voiding obligations, calculating, marking ready, preparing settlement batches, beginning execution attempts, linking organization wallets, inviting, and editing the profile. A member without a reviewer grant can only read. Reviewer decisions (calculation and batch) need the reviewer grant. So there is no separate "Operator": the operator's tasks belong to the admin.

**F6. Approvals are a single reviewer decision, not "N of M".** One reviewer approves or rejects one exact calculation; another reviewer decision approves or rejects one settlement batch. Separation of duties is enforced by the server (`SEPARATION_OF_DUTIES`). There is no required-approver count, no approval request routing, and no notification.

**F7. Stellar execution is not in the registry API.** The registry exposes settlement **preparation** (preview, batches, validation, approve/reject, execution preconditions, attempts with plans). Its own notes say wallet signing, submission and on-chain verification are not implemented there. The owner-run routes `/api/stellar/{cosign,run,validation}` do sign (Freighter) and submit, but only for a user whose verified wallet is a configured owner-tool account. So the UI can show **Prepared** for real, execution attempt states where the API returns them, and must render Signed/Submitted/Confirmed as **Not supported** for ordinary users.

**F8. Wallet sign-in binds the challenge to the `Host` header.** `issueSignInChallenge` receives `request.headers.get('host')`. Through a BFF the backend sees its own host, so the domain shown in the signed message is the backend's, not `apps/web`'s. Acceptable for local use; it weakens the domain-binding argument and must be disclosed, not hidden.

**F9. Invitations are token-based and send no email.** `invite` returns a one-time token for the administrator to hand over. There is no delivery provider. The UI must say so.

**F10. Hosting.** The backend is SQLite plus local-only guards and runs on `127.0.0.1`. `apps/web` can be deployed to Vercel as a static or SSR shell, but it has **no reachable backend there**. Until a hosted backend exists, `apps/web` works against a locally running console.

## 3. Capability matrix: PRD against what exists

Unless a row says otherwise, writes require the **admin** role and decisions require a **reviewer** grant (section 2, F5). Legend. **Real**: backed by an endpoint that exists. **Real, limited**: exists with the limit stated. **Derived**: computed client-side from real endpoints (labelled). **Sample**: only with `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1`, behind the visible "Sample data" banner. **Not supported**: rendered as such.

| PRD area | Status | Evidence and limit |
|---|---|---|
| Sign-in by wallet challenge (4.2) | Real | `POST /api/auth/wallet/challenge`, `/wallet/verify`; challenge is single-use, expiring, server-verified |
| Email and password sign-in (4.1) | Real | `register`, `login` |
| Session expired, sign-out, renew, revoke all (4.1, 16.3) | Real | `logout`, `renew`, `logout-all`, `GET /api/auth/me` |
| Wallet not installed / rejected / expired challenge (4.2) | Real (client states) | Freighter API errors; server `INVALID_CHALLENGE` |
| First-time onboarding, create or join organization (4.3, 5.1, 5.2) | Real | `POST /orgs`, `POST /invitations/accept` with a token. Fields: name, description, visibility, institution type (`bank`, `payment-institution`, `broker-dealer`, `fintech`, `corporate-treasury`, `other`), jurisdiction. **Not supported:** website, logo, primary contact, PRD's other organization types |
| Organization selector, switching (3.2, Journey 10) | Real | `GET /orgs`, `/api/auth/me` (`organizations`, `lastOrgId`), `POST /api/auth/workspace` |
| Organization profile edit (5.1) | Real, limited | `POST /orgs/:id/update` (name, description, visibility) |
| Members list, role change, suspend, remove (5.3) | Real, limited | `members`, `role` (admin or member), `status`, `remove`. **Not supported:** last activity, ownership transfer |
| Invitations: send, list, revoke (5.3) | Real, limited | token handed over; statuses `pending`, `accepted`, `revoked` only. **Not supported:** `rejected`, `expired` as stored states (an `expiresAt` exists, so expiry is derivable) |
| Reviewer grants (2.4) | Real | `reviewers`, `grant`, `revoke` |
| Overview counts (6.1) | Derived | session list rows and members; no aggregate endpoint. Settled value: **Not supported** (nothing is chain-confirmed through this API) |
| Sessions list, filter, sort, paginate (7.1) | Real, limited | `GET /orgs/:id/sessions` returns rows; filtering, sorting and pagination are **client-side** (the API has none). "Created by / Joined / Awaiting my organization" are **Not supported** (single-organization model, F3) |
| Create session (7.2) | Real, limited (admin only) | `POST /orgs/:id/sessions` takes only a `label`; the id is generated server-side. Participants step, parameters step: **Not supported** (participants are added after creation; no protocol parameters are settable here) |
| Session invitation and joining (7.3, Journey 4) | **Not supported** | F3. A sample-data flow is possible only if you approve it (section 8, D3) |
| Session workflow state (7.4) | Real, limited | application `configuring`, `ready`, `closed`; `provenance` `fixture`, `local-draft`, `chain-read`, `chain-confirmed`; optional chain observation `OPEN`, `COMMITTED`, `APPROVED`, `SETTLED`. See the lifecycle mapping in section 5 |
| Session participants add/remove (8.4) | Real, limited | users of the same organization; wallet is an **unproven claim**, labelled so |
| Session obligations list (8.5) | Real | `GET .../obligations` |
| Obligations: create (9.2) | Real, limited | `POST`; debtor and creditor are session participants; asset code plus canonical `assetRef`; reference. **Not supported:** supporting-information field, due date or expiry |
| Obligation detail and history (9.3) | Real, limited | detail has `revision`, created and updated by/at. **Per-revision history is not exposed by the API** unless the activity feed supplies it; render only what exists |
| Obligation edit and void (9.4) | Real | `update` (bumps `revision`) and `void` (reason required). UI presents both as explicit **recorded corrections**, never as edit or delete |
| Global obligations page (9.1) | Derived | aggregated over sessions; labelled |
| Netting: run, result, positions (10) | Real | `POST .../calculate`, `GET .../calculation`: gross, input hash, positions (`net`, role debtor, creditor or flat), obligation count. Never nets assets together: a calculation is per asset |
| Excluded obligations with reasons (10.4, 10.6) | Real, limited | voided obligations are the only exclusion the API models; legacy-unresolved asset identity is reported by eligibility. Anything else: **Not supported** |
| Calculation version, validation result (10.4) | Real, limited | `inputHash`, `createdAt`, `createdBy`; no version field; readiness endpoint reports consistency |
| Original-vs-net two-pane view (10.3) | Derived | built from the obligations and positions already returned |
| Netting graph view | Derived (optional) | same data; behind a toggle, as specified |
| Approvals (11) | Real, limited | institutional authorization: `GET/POST .../authorization`, `approve`, `reject` (reason). One reviewer decision per calculation; stale approvals are invalidated. **Not supported:** N-of-M approval, approval requests, an approvals list across sessions (aggregate only) |
| Settlement preparation (12.2) | Real | preview, `prepare`, batches, validation, instructions with fingerprints |
| Settlement review and mismatch (12.3) | Real, limited | batch `validation` is a real check list; batch approve/reject needs `instructionsHash` |
| Stellar authorization, signing, submission (12.4, 12.5) | **Not supported** for ordinary users | F7 |
| Verification and confirmation (12.6) | **Not supported** | no route marks Confirmed; the stage rail will never show Confirmed |
| Execution attempts and states (12.5, 12.7) | Real, limited | `.../execution`, `.../attempts` return states (`awaiting-signer`, `signed`, `submitted`, `confirmed`, ...) and events; shown read-only as returned |
| Failed settlement, no auto-retry (12.7) | Real, limited | attempt states and `reviewedFailure` on `begin`; no automatic retry exists |
| Activity: session and global (13) | Real (session), Derived (global) | session workspace includes activity; no org feed (F4) |
| Wallets: list, link, verify, remove (14) | Real | user wallets (`wallet/link/*`, `wallet/remove`), org wallet claims (`wallets`), org verifications (`wallet-challenges`, `wallet-verifications`). Connected vs verified are separate in the data |
| Signer sets: weight, threshold (14.5) | Real, limited | `signer-sets` reads Horizon and the RPC (admin only, Testnet only) |
| Wallet disconnect (14.4) | Real, limited | disconnecting the browser wallet is client-side; `wallet/remove` unlinks it from the account |
| Notifications (15) | **Not supported** | no endpoint (F4) |
| Global search (17) | **Not supported** (client-side search of already loaded records is possible, labelled) | no endpoint |
| Settings: profile, sessions, notification preferences (16) | Real (display name, revoke all); notification preferences **Not supported** | `profile`, `logout-all` |
| Mainnet | **Not supported** | no Mainnet path exists; the environment indicator is fixed to Testnet |

## 4. Roles: `can(role, capability)`

Presentation only; the backend decides. The PRD's five roles map onto the real model like this, and the unmappable ones are shown as **Not supported**, not invented.

| PRD role | Real source | Note |
|---|---|---|
| Owner | none | Not supported. The last active admin cannot be removed or demoted |
| Admin | membership `admin` | Real. Performs every write operation, including the PRD's operator tasks |
| Operator | none | **Not a distinct role.** Operator tasks are admin-only in the backend, so they are shown as Admin capabilities |
| Approver | a reviewer grant (on a member or an admin) | Real. Decisions need the grant; the server enforces separation of duties |
| Viewer | membership `member` without a reviewer grant | Real, derived: a member can read but cannot write or decide |
| Suspended | membership `status: suspended` | Real; shown as no access |

`can()` returns `{ allowed, reason }` so a disabled control can show its inline reason. A `403 FORBIDDEN` or `SEPARATION_OF_DUTIES` from the server always wins and is displayed as the reason.

## 5. Lifecycle mapping (PRD 7.4 against reality)

The six stepper groups are driven only by real fields. A state that exists only in the application is labelled "Application record".

| Group | Real driver |
|---|---|
| Draft | `workflow: configuring`, provenance `local-draft` |
| Participation | active `sessionParticipants` count |
| Obligations | active obligation count; `workflow: ready` |
| Netting | a current `calculation` (stale if `inputHash` no longer matches) |
| Approval | `authorization.state` and the current decision |
| Settlement | settlement batch `status` and execution attempt `state`; chain `state` only when `chain` is present |

Cancelled is the application `closed` workflow only where the API reports it. **Failed** appears only from a failed execution attempt. The PRD's 12 states are not reproduced.

## 6. Data layer: the typed `TobinClient`

One interface, three adapters, chosen at startup and always visible.

| Adapter | When | Behaviour |
|---|---|---|
| `HttpAdapter` (default) | backend reachable through the BFF proxy | real calls; maps API errors to typed results; never invents fields |
| `UnsupportedAdapter` methods | the capability has no endpoint | returns `{ supported: false }`; the UI renders "Not supported" |
| `MockAdapter` | only if `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` | fictional sample data under a persistent "Sample data" banner, never mixed with real records; off by default |

Planned interface groups (each method's adapter status follows section 3): `auth` (me, challenge, verify, logout), `organizations` (list, get, update, members, invitations, reviewers, wallets), `sessions` (list, get, create, participants, readiness), `obligations` (list by session, aggregate list, create, correct, void), `netting` (calculate, get), `approvals` (get, decide), `settlement` (preview, prepare, batches, decide, execution, attempts), `activity` (by session, aggregate), `wallets`, `notifications` (unsupported), `search` (unsupported). Amounts stay decimal strings (`bigint` in memory), always paired with an asset code; assets are never netted together.

## 7. Stack and dependencies

| Choice | Decision |
|---|---|
| App | `apps/web`: Next.js 16.4.3 App Router, React 19.3, TypeScript strict, Tailwind v4 through the same `@tailwindcss/turbopack` rule as `apps/landing` |
| Tokens | a new `packages/ui-tokens` (the monorepo supports `packages/*`) holding CSS variables and a Tailwind theme. The design spec's values equal the landing page's tokens (`#1d1d1d`, `#626262`, `#b1b1b1`, `#f0f0f0`); `apps/landing` is **not** changed to consume it in this work |
| Logo | the existing broken-T path (as in `apps/docs/components/BrandMark.tsx`); no new logo |
| Fonts | Geist and JetBrains Mono through `next/font/google` (no npm dependency) |
| Data and forms | TanStack Query, TanStack Table, react-hook-form, zod, nuqs (all listed in your prompt) |
| Wallet | **`@stellar/freighter-api` 6.0.1, already pinned**, instead of adding Stellar Wallets Kit. The authentication flow in the repo is written and tested against it. Adding the Kit is possible; D4 asks |
| Tests | Vitest-style unit tests are not in the repo; the repo uses `node --test`. Unit tests for netting display and state mapping will use `node --test` with Node's TypeScript support, matching `apps/web-console`. Playwright is listed in your prompt and is added for the smoke tests |
| Each new npm dependency | regenerates `ci/dependency-baseline.csv` (`node scripts/ci/update-npm-baseline.mjs`) and is reported |

## 8. Decisions I need before Phase A

- **D1. Relationship to `apps/web-console`.** Options: (a) `apps/web` is a new UI over the console's API through a BFF proxy, the console keeps running as the backend (recommended: no backend change); (b) `apps/web` replaces the console's institutional pages over time; (c) something else. I will build (a) unless you say otherwise.
- **D2. Same-origin proxy or backend change.** The proxy in F2 needs no backend change. Allow-listing a second origin in `guards.ts` would be a security-relevant backend change that I will not make without your approval. I will use the proxy.
- **D3. PRD features with no backend support (F3, F4, F6, F7).** Confirm, per feature, one of: **Not supported** (default), or **Sample** behind the flag. My recommendation: Not supported for cross-organization sessions and joining, notifications, search, N-of-M approvals, signing, submission and confirmation. Sample data only where it clarifies a screen the real data cannot fill (for example a populated netting view), always bannered.
- **D4. Wallet library.** Use the pinned `@stellar/freighter-api` (recommended) or add Stellar Wallets Kit.
- **D5. Roles.** Confirm the mapping in section 4: Owner is Not supported; Operator is not a distinct role (admin-only operations); Viewer is a member without a reviewer grant; Approver is a reviewer grant. The alternative is adding roles to the backend, which I will not do without approval.
- **D6. Aggregation.** Confirm that global Obligations, Activity and Overview counts may be derived client-side from per-session requests (N+1), labelled "Derived".

## 9. Deviations from the design spec I expect to make, and why

- **Accessible grey text.** `#B1B1B1` on white is about 2:1; the landing page's own comment says it is not for body text. I propose using it for disabled controls only and writing "Not supported" in `#626262` with a dash icon, so the label stays readable.
- **Focus visibility.** "No borders" cannot remove keyboard focus indication. I will keep a 2px outline focus ring on interactive elements, as the landing page does.
- **The environment indicator.** Fixed to "Stellar Testnet"; no Mainnet variant is built because no Mainnet path exists.
- **Sign-in domain.** Disclosed in the UI help text per F8.

## 10. Phases and review stops

Each phase ends with typecheck, lint, tests, screenshots at 1440, 900 and 390 px in `docs/screenshots/phase-X/`, a real-versus-derived-versus-sample-versus-not-supported list, and a stop for your review. No dependency, backend change or unsupported feature is added without asking.

| Phase | Scope | Expected real / not supported |
|---|---|---|
| (pre) Foundations | `packages/ui-tokens`, `apps/web` scaffold, shell, the component library and `/dev/components` with all states | n/a |
| A | sign-in, wallet connection and failure states, onboarding, organization overview | all real except overview metrics (derived) and settled value (Not supported) |
| B | sessions list, create wizard (Basics, Review, Create only), invitation (Not supported), workspace shell, stepper, action panel | list and create real; participants and parameters steps Not supported |
| C | obligations (create, correction, void), netting tab | real; global list derived |
| D | approvals, settlement preparation, review, attempt states | real up to Prepared and reviewed; Signed, Submitted, Confirmed Not supported |
| E | activity, wallets, organization, settings | activity session-real and global-derived; notifications and search Not supported |

## 11. What I will not do without approval

Change any backend, API, guard, schema or contract; add a dependency beyond the list above; present sample data as real; show Confirmed; implement signing or submission for ordinary users; invent roles, counts, volumes or balances; commit, push or open a pull request.
