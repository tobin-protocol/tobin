# Tobin web app (`apps/web`): build plan

Status: **plan, with the owner's decisions D1 to D6 recorded on 2026-11-08 (section 8). Phase A is the only phase approved, and it is built (see `apps/web/README.md`, section Build status). Phases B to E are not started.** Written 2026-11-08 after reading `docs/web-app-prd.md`, `docs/web-app-design-spec.md`, the root and app READMEs, `AGENTS.md`, every `package.json`, and the source of the existing application's HTTP surface (`apps/web-console/lib/registry/http.ts`, `lib/auth/http.ts`, `lib/server/guards.ts`, `lib/registry/types.ts`, the `app/api/stellar/*` routes).

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
| Session invitation and joining (7.3, Journey 4) | **Not supported** | F3. Rendered as Not supported (D3) |
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

## 3a. Every PRD section marked

**Supported**: implemented against real endpoints. **Derived**: computed from per-session requests, labelled. **Not supported**: no backend; rendered as "Not supported".

| PRD section | Mark | Notes |
|---|---|---|
| 1 Product overview | Supported | shell, positioning, maturity notice |
| 2 Personas, permission matrix | Derived | real roles Admin, Member, Reviewer (D5); PRD roles Owner, Operator, Viewer and External participant are Not supported; mapping appears in help text only |
| 3 Information architecture, header | Supported | seven tabs, organization selector, wallet cell, fixed Testnet indicator. Notifications and global search are **Not supported** |
| 4 Authentication | Supported | wallet challenge and email sign-in, session expiry, sign-out |
| 5 Organization onboarding and management | Supported | create, join with a token, profile, members, invitations. Website, logo, contact, ownership transfer: Not supported |
| 6 Organization overview | Derived | counts from session data; settled value Not supported |
| 7 Clearing sessions | Supported | list (client-side filter and sort) and create by label. Cross-organization participants, parameters, invitations and joining: Not supported. The 12-state lifecycle is Not supported; six derived stepper groups replace it |
| 8 Session workspace | Supported | participants are users of the same organization |
| 9 Obligations | Supported | record and void with reason (correction exists in the backend; the owner asked for void only). Global list Derived. Due date and supporting information: Not supported |
| 10 Netting | Supported | per asset; excluded-with-reasons limited to voided and legacy assets |
| 11 Approvals | Supported | single reviewer decision. N-of-M, approval requests, Stellar authorization: Not supported |
| 12 Settlement | Supported to Prepared and review; execution attempt states read-only | signing, submission, verification, confirmation: **Not supported** |
| 13 Activity | Supported (session), Derived (global) | |
| 14 Wallets | Supported | connected (browser) and verified (backend) are separate columns; no provider (not returned); disconnect built; linking a wallet is not built (needs the Freighter flow) |
| 15 Notifications | Not supported | |
| 16 Settings | Supported (display name, default organization, sign out everywhere, account audit) | notification preferences and a session list Not supported |
| 17 Global search | Not supported | |
| 18 Journeys | 1, 2, 5, 6, 7, 10 Supported; 3 limited; 8 to Prepared only; 4 Not supported; 9 partial | |
| 19 States | Supported | loading, empty, error, permission, confirmation |
| 20 Financial data | Supported | amount always with asset; assets never netted together |
| 21 Responsive | Supported | |
| 22 Design deliverables, 24 Objective | n/a | design process, not product behaviour |
| 23 Constraints | Supported | enforced; including the Confirmed rule in section 9 |

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

## 5a. Phase B: what the backend accepts and how states map (read from source 2026-11-08)

**Create session** (`POST /api/registry/orgs/{org}/sessions`, `Registry.recordSession`, admin only). Accepted fields, complete list:

| Field | Rule |
|---|---|
| `label` | text, trimmed, 1 to 80 characters, no control characters, no `<` or `>` |

Nothing else is accepted. The session id (64 hex characters) is generated by the server; a client-supplied id or provenance is ignored. The record is a **local draft** (provenance `local-draft`, workflow `configuring`): no contract call, no chain session. So the create wizard has Details (label), Participants, Review and Created steps, and no invitation, asset, deadline or parameter fields: those render "Not supported".

**Participants** (`POST .../sessions/{id}/participants`, admin, session must be `configuring`): `userId` must be an active member of **this** organization; an optional `walletAddress` must be one of the organization's wallet claims (not used in Phase B). Adding or removing a participant invalidates the current calculation. A participant with active obligations cannot be removed. Cross-organization participants do not exist: "Not supported".

**List** (`GET .../sessions`) returns `sessionId, shortId, label, status, participants, createdAt, provenance, activityCount, lastActivity`. It has **no** server-side search, filter, sort or pagination, and it does not carry the workflow state. Phase B therefore searches, filters, sorts and paginates **in the browser over the full list returned** (labelled as such), and the filters offered are the ones the list fields support: search over label and id, provenance, "has activity", sort by created, label or last activity. Quick filters that need the workflow, calculation or approval state ("Awaiting my review", "Stale", "Ready") would need one request per session; they render "Not supported" in the list (the Overview's capped, derived Attention list covers them).

**Scale limit (owner decision, Phase B review).** List search, filtering and sorting stay client-side over the whole list the server returns; no server endpoint is added. This is fine for tens to low hundreds of sessions. The list response grows linearly (every row, every time), so past a few hundred sessions the first load, the browser-side work and the Overview's per-session reads become noticeably slow. The fix then is a paginated, filterable list endpoint in the console, which needs a separate owner decision. The workflow state shown in the list is **Derived** from one cached `GET` per VISIBLE row (at most 10), never for off-screen rows.

**Responsive pass (owner, Phase C review).** The mobile action panel stays stacked above the tab content until the Phase E responsive pass, which decides whether it becomes a sticky bottom sheet. The global Obligations list shows stacked cards under 900 px so Status is always visible.

**Visual audit deviations (Phase B).** (Recorded and accepted by the owner: the session header has no initiator or updated time because the session detail does not return them.) The session header omits the initiator and an updated timestamp because the session detail does not return them. Under 768 px the action panel stays stacked above the tab content instead of becoming a sticky bottom sheet, because the bottom navigation already occupies the bottom edge and a second fixed element would crowd a 390 px screen; revisit with the owner. The create wizard has three steps, not five, because the backend has no parameter or invitation fields.

**Workflow states** (`WorkflowState`, `clearing.ts`): `configuring`, `ready`, `closed`. Transitions: `configuring -> ready` (only when all readiness checks pass), `ready -> configuring` (reopen), `ready -> closed`. There is no `cancelled`, `failed` or `settled` session state; the PRD's 12 states are not reproduced.

**Stepper mapping.** Every stage is an **Application record**: provenance is `local-draft`, so nothing is on-chain. The six groups are computed by `lib/sessions/lifecycle.ts` from facts, not from the workflow alone:

| Group | Current while | Done when | Source |
|---|---|---|---|
| Draft | never current for a loaded session | the record exists | session detail (`workflow`, `provenance`) |
| Participation | fewer than 2 active participants | 2 or more | `GET .../participants` |
| Obligations | no active obligation | 1 or more | `GET .../obligations` |
| Netting | no current calculation (none, or `stale`) | `currency: current` | `GET .../readiness` |
| Approval | authorization state is not `approved` (`no-calculation`, `stale`, `awaiting-review`, `rejected`) | `approved` | `GET .../authorization` |
| Settlement | approved and workflow `configuring` or `ready` | workflow `closed` | workflow; batch and execution detail are Phase D |

The sub-label states the exact reason (for example "Calculation is stale"). A group is never marked done on a reading that failed: the Stepper shows the unread group as "Not read". The session workflow (`configuring`, `ready`, `closed`) is shown separately as a status badge, because "ready" is an application consistency mark, not approval or settlement.

**Next action** (`lib/sessions/next-action.ts`) is a pure function of the same facts plus `can()`. It returns who must act, whether that is the current user, and either a primary action (enabled only for actions that exist in Phase B) or the reason the user cannot act. Actions that belong to later phases (recording obligations, calculating, deciding, preparing settlement) are listed with their phase and are disabled, never faked.

**Session workspace tabs in Phase B.** Overview (real), Participants (real; add and remove, admin, while configuring), Obligations (read-only list, real; recording is Phase C), Netting (read-only latest calculation, real; running it is Phase C), Approvals (read-only authorization state and decisions, real; deciding is Phase D), Settlement ("Not built yet", Phase D; signing, submission and confirmation "Not supported"), Activity (real, from the session detail).

## 5b. Phase C: obligation, netting and review operations the backend supports (read from source 2026-11-08)

All writes are **admin only** and only while the session workflow is `configuring` (`#editable`). Every change to participants or obligations invalidates the current calculation and any review of it. Reads need membership.

| Operation | Route | Supported | Notes |
|---|---|---|---|
| Record an obligation | `POST .../obligations` | yes | Fields, complete list: `debtor` and `creditor` (each an **active participant of the session**, different from each other), `amount`, `asset` and/or `assetRef`, optional `reference` (text, 0 to 200). The id is generated by the server. |
| Amount rule | same | yes | A positive **whole number of base units**, digits only, no decimals, signs or spaces, 1 to 39 digits, at most the engine's i128 maximum. There is no precision or scale field: "precision" errors are this rule. |
| Asset rule | same | yes | If the operator has configured any **supported asset** (listed by `GET .../settlement` as `assets`), `assetRef` (the asset id) is required and an asset code alone is refused. If none is configured, a code of 1 to 12 upper-case letters or digits is accepted and recorded as `legacy-unresolved` (a code, not an asset identity). One session nets one asset: a different asset, or a different identity with the same code, is refused. |
| Duplicate detection | none | **no** | The backend has no duplicate check on obligations. The UI does not invent one; the same debtor, creditor, amount and asset can be recorded twice. |
| Edit an obligation | `POST .../update` | exists, **not built** | The owner asked for no edit. |
| Void an obligation | `POST .../void` | yes | Optional `reason` (0 to 200). Status becomes `voided`, revision increases, a `obligation.voided` event is logged. A voided obligation cannot change again. There is no delete. |
| Read obligations | `GET .../obligations`, `.../obligations/{id}` | yes | Includes `reference`, `assetRef`, `assetIdentity`, created and updated by and at, revision. |
| Obligation history | activity events | derived from real events | `obligation.created` and `obligation.voided` are logged with the obligation's first 8 id characters in the detail; the UI filters the session activity by that. There is no per-obligation history endpoint. |
| Run netting | `POST .../calculate` | yes | Admin, `configuring`. Nets the **active** obligations of the **active** participants with the real engine. Refuses when there are no active obligations, more than one asset, or the engine rejects the input; a refusal is logged as `netting.failed`. Positions must sum to zero or the result is discarded. |
| Read the calculation | `GET .../calculation` | yes | `id`, `asset`, `createdAt`, `createdBy`, `gross`, `inputHash`, `obligationCount`, `positions` (name, net, role), and `currency` (`current` or `stale` against the present inputs). **No version field and no excluded-items list.** |
| Excluded items | derived | derived | The calculation uses active obligations only, so the excluded items are the **voided** obligations, with the reason "Voided". The backend returns no other exclusions; the readiness checks report problems such as an obligation naming a removed participant instead of excluding it. |
| Validation result | `GET .../readiness` | yes | The check list (`valid`, `asset`, `references`, `conservation`, ...). Failed runs also appear as `netting.failed` activity. |
| Net settlement instructions | settlement batch | **Phase D** | Payer-to-payee instructions exist only in a prepared settlement batch. The original-versus-net view therefore links obligations to **net positions** by participant, not to instructions. |
| Review (approve or reject) | `POST .../authorization/approve` and `reject` | yes | Reviewer capability, separation of duties; **Phase D** builds the decision. Phase C only reads the state. |

Not built in Phase C, and why: the graph view (it needs a layout library or hand-written graph layout, which is more than a day with the accessibility the rest of the app has; the original-versus-net two-pane covers the same data); editing obligations (owner decision); duplicate detection (no backend support).

## 5c. Phase D: review, settlement and execution operations that exist (read from source 2026-11-08)

Everything below is under `/api/registry/orgs/{org}/sessions/{id}/`. **Nothing outside this table is built in Phase D.** There is no signing, submission, confirmation or verification route: the execution state machine's advance functions (`advanceSettlementExecution`, `advanceExecutionAttempt`) are server-side only and have **no HTTP route** (their own comment: "a browser cannot" call them).

| Operation | Route | Who | Returns / rules |
|---|---|---|---|
| Read the review state of the calculation | `GET authorization` | member | `state` (`no-calculation`, `stale`, `awaiting-review`, `approved`, `rejected`), `currency`, `calculationId`, `eligibility {canDecide, isReviewer, reasons[]}`, `decisions[] {id, calculationId, decision, reason, decidedBy (name), decidedAt, status: active/superseded/invalidated, invalidatedAt?, invalidationCause?}` |
| Approve or reject the calculation | `POST authorization/approve`, `POST authorization/reject` with `{calculationId, reason}` | reviewer grant | **One decision per calculation, by one reviewer**: not N of M. Refused when: no reviewer grant (`FORBIDDEN`); session closed; not the latest or not current calculation (`STALE`); a decision already exists (`EXISTS`); separation of duties (the actor recorded, changed or calculated it: `SEPARATION_OF_DUTIES`). A **reject requires a reason**, 1 to 500 characters. Approve needs no reason. |
| Read settlement preparation | `GET settlement` | member | `preview {checks[], ready, calculationId}` (what preparing now would require), `assets[]`, `batches[] {id, attempt, calculationId, status, asset, instructionCount, totalAmount, preparedBy, preparedAt, decision?, invalidation?}` |
| Prepare a settlement batch | `POST settlement/prepare` with `{calculationId, attempt?}` | admin | Builds payer-to-payee instructions from the **approved, current** calculation, bound to one supported asset identity. Needs: calculation current and latest, active approval, every participant and obligation still valid, positions recompute exactly, a **canonical supported asset** (code-only obligations cannot be prepared), no live batch for the calculation, engine accepts the plan, instructions reconcile exactly to the net positions. A rejected batch may be prepared again as attempt 2, 3, ... (the next attempt number must be named). |
| Read one batch | `GET settlement/batches/{b}` | member | `batch {id, attempt, calculationId, asset {id, network, kind, code, issuer?}, instructionCount, totalAmount, instructionsHash, algorithm, preparedBy, preparedAt}`, `status` (`awaiting-review`, `approved`, `rejected`, `invalidated`, `superseded`; **derived**, never stored), `validation[] {key, label, ok, detail}`, `eligibility {canDecide, reasons[]}`, `instructions[] {seq, payer(name), payee(name), amount, assetId, fingerprint, ...}`, `review? {decision, reason, decidedBy, decidedAt}`, `invalidation? {cause, at}` |
| Validate a batch | `GET settlement/batches/{b}/validation` | member | the live check list; a failing check is a mismatch between the approved result and the prepared settlement |
| Approve or reject the batch | `POST .../batches/{b}/approve`, `.../reject` with `{instructionsHash, reason}` | reviewer grant | The `instructionsHash` must equal the batch's (the reviewer approves **exactly what was shown**: otherwise `STALE`). Refused when: not awaiting review, validation fails, or the reviewer prepared the batch (separation of duties). A **reject requires a reason** (1 to 500). Application-level decision: not a signature. |
| Read the execution record | `GET .../batches/{b}/execution` | member | `network`, `batchStatus`, `participants[] {verifiedAccount, verifiedCount}`, `execution {id, state, accounts, createdAt, events[] {from, to, at, actor, detail}} or null`, and `unavailable[]`: the backend's own list of what does not exist ("Wallet connection", "Transaction construction", "Wallet signing", "Transaction submission", "Independent on-chain verification", "Reconciliation against the chain") |
| Read execution attempts | `GET .../execution/attempts` | member | per attempt: `attemptNo`, `state`, `network`, `planFingerprint`, `createdAt`, `steps`, `requiredSigners`, `transactions[]`, `events[]` |
| Record execution preconditions | `POST .../execution/start` | admin | **Exists, not built in Phase D.** Needs exactly one **verified** Stellar account for every payer and payee; wallet verification belongs to Phase E. Result state is `awaiting-signer`; nothing is signed. |
| Begin an attempt | `POST .../execution/attempts/begin` with `{initiator, reviewedFailure?}` | admin | **Exists, not built in Phase D.** Needs the execution record, a configured clearing contract on the server, and a retry policy that allows it (a failure must be reviewed first; an unknown outcome blocks everything until the network is read). Result state `awaiting-signer`; "no transaction has been constructed, signed or submitted". |
| Sign, submit, verify, confirm | none | | **Not supported.** No route. Rendered "Not supported". |

**Stage rail honesty.** The backend records, at most, `awaiting-signer` (Prepared). The later states exist in the state machine but nothing can reach them over HTTP, so Signed, Submitted and Confirmed render "Not supported" and Confirmed stays unreachable (`lib/stages.ts`, its test and the source check).

**Failed states.** If an execution or attempt ever reports `failed`, `expired` or `unknown-outcome`, the UI shows the last event's detail and time, and the plain line "No automatic retry." A retry (a new attempt after a reviewed failure) is the `begin` route above, which Phase D does not build.

**Settlement page.** The seven-tab navigation has no separate Settlement destination; the **Settlement tab** of the session workspace is the settlement page. A global **Approvals** page (derived, capped) lists items awaiting review across sessions.

## 5d. Phase E: activity, wallets, organization, members, invitations and settings (read from source 2026-11-08)

Registry routes are under `/api/registry/orgs/{org}/`, account routes under `/api/auth/`. Writes need the header `x-tobin-request: 1`.

| Area | Operation | Route | Who | What it does and returns |
|---|---|---|---|---|
| Activity | Org-wide activity | **none** | | The registry keeps one activity log per organization (`id, at, orgId, actor, kind, subject, detail`) but exposes it **only through a session's detail**, filtered to that session. Events with no session subject (member, invitation, reviewer, organization events) cannot be read over HTTP. The Activity page is therefore **derived from per-session reads** (capped, "Showing N of M sessions"). Fields: `at, kind, actor, detail`. There is **no result field**; "outcome" is derived from the event kind. There is no per-event reference. |
| Wallets | Own verified wallets | `GET /api/auth/me` (`wallets[]`) | self | `id, publicKey, network, verifiedAt`. **No provider field and no connection state**: connection is a browser-side Freighter fact, shown only for the current browser and labelled as such. |
| Wallets | Disconnect (remove) a wallet | `POST /api/auth/wallet/remove {walletId}` | self | Marks the wallet revoked, **revokes every session signed in with it**. Refused with `LAST_METHOD` when it is the only way a wallet-account can sign in. It does not touch the Stellar account. |
| Wallets | Link a wallet | `POST /api/auth/wallet/link/challenge`, `.../link/verify` | self | Exists; needs a Freighter signature. **Not built**: it would add a new signing flow while the real-extension flow is being tested by the owner. |
| Wallets | Verified accounts of the organization | `GET wallet-verifications` | member | `userId, name, network, publicKey, verifiedAt`: proof of control of a key, **no role and no signing authority**. |
| Wallets | Organization wallet claims | `GET wallets`, `POST wallets` | member / admin | `address, proof` (`none` or `signature-verified`): unproven claims. Reading is built; adding a claim is **not built** (not needed by any screen). |
| Organization | Profile | `GET orgs/{id}`; `POST orgs/{id}/update {name, description, visibility}` | member / admin | Institution type and jurisdiction are returned but **cannot be changed**. |
| Members | List | `GET members` | member | `userId, role, reviewer, since, status (active/suspended), name, you`; `email` and `wallet` only for admins. |
| Members | Change role | `POST members/{u}/role {role: admin or member}` | admin | `LAST_ADMIN`: the last active administrator cannot be demoted. |
| Members | Suspend or restore | `POST members/{u}/status {status}` | admin | Not your own status; not the last active administrator. A suspended member keeps the record but has no access or authority. |
| Members | Remove | `POST members/{u}/remove` | admin | Refused for the last active administrator, for a participant with active obligations, and for a participant of a session no longer being configured. Otherwise the member is removed from every configuring session they are in (which invalidates that session's calculation and review) and the membership ends. |
| Members | Reviewer grant and revoke | `POST reviewers/{u}/grant`, `.../revoke` | admin | A separate capability from the role. Revoking keeps earlier decisions on record. |
| Invitations | List, create, revoke | `GET/POST invitations`, `POST invitations/{id}/revoke` | admin | `invitee` (3 to 120 characters; an email or a Stellar address), `role`; statuses `pending`, `accepted`, `revoked`; `expiresAt`. **No email is sent**: the one-time token is returned once and must be handed over. Only a pending invitation can be revoked. |
| Settings | Display name | `POST /api/auth/profile {displayName}` | self | |
| Settings | Default organization | `POST /api/auth/workspace {orgId}` | self | |
| Settings | Sign out everywhere | `POST /api/auth/logout-all` | self | Revokes **all** of the account's sessions, including this one. There is **no list of active sessions**, so no per-session revoke. |
| Settings | Account audit | `GET /api/auth/audit` | self | `at, kind, subject, detail` of the account's own security events (read-only). |
| Notifications | any | **none** | | Not supported: no route, no model. |
| Global search | any | **none** | | Not supported. The command panel offers navigation and the sessions already loaded in this browser, and says so. |
| Roles | Owner, Operator, Approver, Viewer | **none** | | Not roles in the backend (Admin and Member, plus the separate Reviewer grant). |

**Settings groups.** Account: display name, sign out everywhere, account audit. Organization: default organization (the profile itself lives on the Organization page).

**Responsive pass (decision, Phase D review).** Under 768 px the action panel becomes a sticky bottom sheet above the bottom bar, collapsed to its title and expandable.

## 6. Data layer: the typed `TobinClient`

One interface, three adapters, chosen at startup and always visible.

| Adapter | When | Behaviour |
|---|---|---|
| `HttpAdapter` (default) | backend reachable through the BFF proxy | real calls; maps API errors to typed results; never invents fields |
| `UnsupportedAdapter` methods | the capability has no endpoint | returns `{ supported: false }`; the UI renders "Not supported" |
| `MockAdapter` | only if `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` | off by default. Per D3, every PRD feature with no backend renders "Not supported" and is **not** mocked; the adapter and its persistent "Sample data" banner exist only so the flag has a defined, visible behaviour, and nothing in Phase A uses it |

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

## 8. Decisions recorded (owner, 2026-11-08)

- **D1. Relationship to `apps/web-console`.** `apps/web` is a new UI over the console's API. **Canonical UI:** until `apps/web` reaches parity, `apps/web-console` remains the canonical institutional UI. **Once `apps/web` reaches parity it becomes the canonical institutional UI**, and the console's institutional pages (`app/(institution)`) are retired; the console stays as the backend, the owner-run tools and the local sandbox. Parity means: every row marked Supported in section 3 and every PRD section marked Supported in section 3a is implemented in `apps/web`, with tests, and the owner has reviewed it. Derived and Not supported items do not block parity.
- **D2. Same-origin proxy.** A server-side proxy in `apps/web`. The guards are **not** changed and no CORS is added. The README states that hosting is local-only until a reachable backend exists.
- **D3. No backend, no feature.** Cross-organization sessions and joining, notifications, global search, N-of-M approval, signing, submission and confirmation render "Not supported". Sample data stays off by default behind `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` and always shows a "Sample data" banner.
- **D4. Wallet.** The pinned `@stellar/freighter-api`. Stellar Wallets Kit is not added.
- **D5. Real role names.** The UI shows **Admin**, **Member** and **Reviewer**. It never labels an admin "Operator" or a reviewer "Approver". Owner does not exist. The PRD role mapping appears in help text only. A single `can(role, capability)` helper mirrors the backend rules (section 4) and is presentation only.
- **D6. Derived data.** Global Obligations, Activity and Overview counts may be derived from per-session requests, labelled "Derived from session data". The number of per-session requests is capped, and "Showing N sessions" is displayed whenever the cap applies, so a total is never read as complete.

### Dependencies approved for Phase A

TanStack Query, TanStack Table, react-hook-form, zod, nuqs, Playwright. Anything else needs a question first. Phase A installs only what it uses (nuqs is deferred until a screen needs URL state beyond `searchParams`). `@hookform/resolvers` is **not** on the list, so zod validation is wired to react-hook-form with a small local resolver.

## 9. Deviations from the design spec (accepted)

- **Accessible grey text.** "Not supported" text is `#626262`. `#B1B1B1` is for disabled controls only.
- **Focus visibility.** A 2px focus ring stays on every interactive element. Keyboard accessibility overrides "no borders".
- **The environment indicator.** Fixed to "Stellar Testnet"; there is no Mainnet state.
- **Sign-in domain.** Disclosed in the UI help text per F8.
- **No Confirmed without read-back.** A test and a source check enforce that no screen can render a Confirmed state unless the backend reports a verified read-back. Today the backend never does, so Confirmed is never rendered.
- **Bottom navigation.** Under 768 px the bottom bar has Overview, Sessions, Activity and More. The spec's "Approvals" item is omitted until Phase D, because no approvals page exists before then.

## 10. Phases and review stops

Each phase ends with typecheck, lint, tests, screenshots at 1440, 900 and 390 px in `docs/screenshots/stage-X/` (only the 1440 px images are committed; the others are regenerated by the scripts), a real-versus-derived-versus-sample-versus-not-supported list, and a stop for your review. No dependency, backend change or unsupported feature is added without asking.

| Phase | Scope | Expected real / not supported |
|---|---|---|
| (pre) Foundations | `packages/ui-tokens`, `apps/web` scaffold, shell, the component library and `/dev/components` with all states | n/a |
| A | sign-in, wallet connection and failure states, onboarding, organization overview | all real except overview metrics (derived) and settled value (Not supported) |
| B (built; see section 5a) | sessions list, create wizard (Details, Participants, Review, Created), workspace shell, stepper, action panel, read-only tabs | list, create, participants real; list filters by workflow state, cross-organization participants, invitations Not supported |
| C | obligations (create, correction, void), netting tab | real; global list derived |
| D (built; see section 5c) | approvals, settlement preparation, batch review, execution record (read-only) | real up to Prepared and reviewed; Sign, Submit, Verify and Confirmed Not supported; starting an execution and attempts exist in the backend but are not built (they need verified wallets, Phase E) |
| E (built; see sections 5d and 12) | activity, wallets, organization, members, invitations, settings, notifications page, command panel, bottom sheet, accessibility pass | activity session-real and global-derived; notifications and search Not supported |

## 11. What I will not do without approval

Change any backend, API, guard, schema or contract; add a dependency beyond the list above; present sample data as real; show Confirmed; implement signing or submission for ordinary users; invent roles, counts, volumes or balances; commit, push or open a pull request.

## 12. Final status (Phase E complete, 2026-11-08)

All five phases are built. **Supported** and **Derived** are implemented against the real console API; everything below is rendered "Not supported" or "Not built yet" and nothing about it is mocked.

### 12.1 What is real, derived and sample

- **Real:** sign-in (wallet challenge and email), onboarding, organization profile, members (role, reviewer, suspend, remove), invitations, wallets (own, verified accounts, claims; disconnect), sessions (list, create, participants), obligations (record, void, history), netting (run, results), calculation review (approve, reject), settlement (prepare, batch review, execution record read-only), account settings.
- **Derived (labelled, capped at 10 sessions, "Showing N of M sessions"):** Overview counts and attention items, the global Obligations, Activity and Approvals pages, the pending-approvals badge, the list's workflow state for visible rows, the excluded-items table, invitation Expired, activity outcome.
- **Sample:** none shown. The fictional adapter exists only behind `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1`; no screen mocks a missing feature (D3). The failed execution states exist only as labelled fixtures in `/dev/components`.

### 12.2 Built but deliberately not wired

| Thing | Why |
|---|---|
| Start an execution, begin an attempt | The routes exist; the owner said not to start executions yet. They also need a verified account for every payer and payee and a configured clearing contract. |
| Link a wallet from the app | The route exists; it needs a Freighter signing flow, and the owner is testing the real extension. |
| Edit an obligation | The route exists; the owner asked for void only. |
| Add an organization wallet claim | The route exists; no screen needs it. |

### 12.3 Everything in the PRD that remains Not supported, and the backend work it needs

| PRD item | What is missing | Backend work needed |
|---|---|---|
| Cross-organization sessions, participants and joining | Participants are users of one organization | A session model with participants from several organizations, a join and consent protocol between organizations, and authorization that is not scoped to one organization |
| Notifications and unread counts | No notification model or route | A notification store with read state, triggers from the existing events, delivery rules and an API |
| Global search (records, organizations, transactions) | No search route | A search endpoint that respects organization scoping and roles |
| N-of-M approval, approval requests | One reviewer decision per calculation | A policy model (threshold, eligible approvers), per-approver records, quorum and invalidation rules |
| Sign, Submit, Verify and Confirmed | No route can sign, submit, read a transaction back or advance an execution (the advance functions are server-side only) | Transaction construction and submission services, a network read-back that checks Horizon and the RPC agree, reconciliation, routes or workers that advance the state machine, evidence storage, and a backend-reported verified read-back flag. Confirmed stays unreachable in the UI until the backend reports that flag |
| Stellar authorization and signer collection in the app | Signing is done by owner-run tools | Intent endpoints bound to the approved batch and a wallet signing flow with server-side verification |
| Failed, expired and unknown-outcome states on real screens | The backend cannot reach them over HTTP | The same work as sign, submit and verify |
| Settled value metrics | Nothing is confirmed on-chain | Confirmed settlement records |
| Owner, Operator, Approver, Viewer and External participant roles | Roles are Admin and Member plus the Reviewer grant | A role and permission model beyond admin and member |
| Active sessions list and revoking one session | Only "sign out everywhere" exists | A session listing endpoint and per-session revoke |
| Wallet provider, and server-side connection state | Not stored; connection is a browser fact | A provider field recorded at verification (if wanted) |
| Organization-wide activity, including member, invitation and reviewer events | Activity is readable only through a session | An organization activity endpoint with filters, pagination, a result field and a reference or evidence per event |
| Server-side list search, filter, sort and pagination; workflow state in list rows | The session list returns everything | Query parameters and an indexed, paginated list endpoint (see the scale limit in section 5a) |
| Obligation due date, supporting information, duplicate detection | The backend accepts debtor, creditor, amount, asset and reference only | Additional fields and a duplicate rule |
| Calculation version and an excluded-items list | Not returned | A version on calculation records and recorded exclusions |
| Settlement instructions before preparation; per-instruction stage and explorer link | Instructions exist only in a prepared batch; there are no transaction hashes | Available once submission exists |
| Session initiator and updated time in the session header | Not returned by the session detail | Add the fields to the detail response |
| Organization website, logo, contact, ownership transfer; changing institution type or jurisdiction | Not accepted | Profile fields and a transfer rule |
| Hosting beyond one machine | The console binds to loopback and refuses foreign origins; the UI reaches it through a server-side proxy | A reachable backend with an agreed origin and guard policy (a decision, not code in this app) |

### 12.3b Deviations from the design spec (all accepted or recorded)

Grey "Not supported" text is #626262; focus ring is 2px on everything; Testnet indicator is fixed; Approvals is outside the seven top tabs (bottom bar, command panel, Overview attention, and a count on the Clearing Sessions tab); the wallet-signature block is the same white card as the approval block, told apart by title, key icon and "Not supported"; the create wizard has three steps; the sheet's collapsed bar shows the panel's purpose and the primary action appears when it is opened; the session header has no initiator or updated time; Confirmed is never rendered.

### 12.4 Verification record

Typecheck, lint, unit tests and local Playwright smoke tests; real-backend runs of the Phase A to E scripts (`apps/web/scripts/review-screenshots*.mjs`) with admin, member and reviewer; an axe scan of every key screen at 1440 and 390 px; a tap-target audit at 390 px; a horizontal-overflow check at 1440, 900 and 390 px; and a keyboard-only walkthrough. Same-author evidence, one browser (Chrome), no real Freighter test, no hosted CI run of this app.
