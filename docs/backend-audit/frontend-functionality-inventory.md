# Frontend functionality inventory: `apps/web`

Scope: the redesigned institutional application `apps/web` (Next.js, port 3000, no database of its own). This document inventories what the user interface contains and does. The companion document [`frontend-backend-mapping.md`](frontend-backend-mapping.md) maps each action to its backend operation and classifies how much backend exists. Operation ids (`A01`, `R24`, `O03`, ...) used below are defined in section 2 of that document.

Evidence labels used throughout: **Verified** (read in code), **Inference** (follows from code but not executed), **Unknown**, **Recommendation**. Nothing in this document was run; no server was started and no test was executed. Source of truth is the code; where a document disagrees, the disagreement is listed in section 12.

## 1. Headline counts (Verified by reading; definitions below)

| Item | Count | How counted |
|---|---|---|
| `page.tsx` files (routes) | 16 | `find apps/web/app -name page.tsx`: 12 under `(app)`, 2 under `(auth)`, 1 under `(public)`, 1 under `dev` |
| Routes that render a page | 14 | 16 minus the two redirect-only routes `/approvals` and `/wallets` |
| Redirect-only routes | 2 | `app/(app)/approvals/page.tsx`, `app/(app)/wallets/page.tsx` |
| Query-string views (tabs and steps) | 6 session tabs, 5 close-out steps, 4 organization tabs, 3 Discover tabs | sections 4.4 to 4.7 |
| Legacy aliases accepted | 1 session tab (`approvals`), 2 organization tabs (`profile`, `invitations`) | `Workspace.tsx` (`KNOWN`), `Organization.tsx` (`ALIAS`) |
| Modal dialogs | 23 | section 8.1 (each distinct title and purpose is one; the three session-workflow confirmations share one component but are counted as three) |
| Side panels, sheets, drawers | 8 | section 8.2 |
| Menus and popovers | 4 | section 8.3 |
| Standalone forms | 13 | section 9.1 (plus 4 inputs that live inside dialogs) |
| Filter and search bars | 5 groups | section 9.3 |
| Tables (shared `Table` component instances) | 12 | section 9.2 |
| **Distinct interactive components** | **53** | 23 dialogs + 8 panels + 4 menus + 13 forms + 5 filter bars (tables excluded) |
| Mutating interactions (a click that changes backend state) | 32 | section 10.1; they use 33 POST requests because wallet sign-in is one interaction made of two POSTs |
| Backend read operations the UI issues | 18 distinct GET operations | section 10.2 |
| Client-only interactions (no backend call) | 47 | section 10.3 |
| **Meaningful interactions** | **97** | 32 mutating + 18 read operations + 47 client-only. A "meaningful interaction" is a user action that either changes backend state, loads distinct backend data, or changes what the page shows. Pure styling, focus and hover effects are not counted, except the netting hover highlight, which is counted once because it carries information |
| Distinct backend operations (method + path) the app calls | 51 (33 POST, 18 GET) | `mapping` section 3 |

Totals depend on the counting rules above; a different grouping (for example counting the Reject dialogs as one) gives different totals. The rules are stated so the numbers can be reproduced.

## 2. Architecture facts that shape every screen

1. **No database, one HTTP client.** All data goes through `lib/tobin/client.ts` (`HttpAdapter`, lines 103 to 179), which calls `lib/api/http.ts` (`api`, same-origin `fetch`, GET or POST only). Verified.
2. **Server-side proxy.** `app/api/[...path]/route.ts` forwards to `TOBIN_API_URL` (default `http://127.0.0.1:8787`), only `/api/auth/*` and `/api/registry/*` (`lib/proxy-policy.ts:7`), GET and POST only (`:14`), body limit 8 KiB (`:8`), adds the console's required `x-tobin-request: 1` header on POST, forwards only the cookie, copies `Set-Cookie` back. A console outage becomes HTTP 503 `BACKEND_UNAVAILABLE`. Verified.
3. **Access control before render.** `proxy.ts` (lines 10 to 32) calls the console `GET /api/auth/me` with the `tobin_session` cookie for every page request (matcher excludes `/api/`, `/_next/` and files with an extension, line 38), then `lib/access/decide.ts` (`decideAccess`, lines 26 to 46) decides. The result is also written to the request header `x-tobin-auth` (`in` or `out`) which the public layout reads. Verified.
4. **Access rules** (`decide.ts`): `/discover` and `/dev` are always reachable; `/sign-in` is reachable only when signed out (a signed-in user is redirected to `/onboarding` or the sanitized `?next=`); every other path redirects a signed-out user to `/sign-in?next=...` (`/` goes to `/discover`; `expired=1` is added when a cookie was rejected); a signed-in user without a profile and an organization is redirected to `/onboarding`; a completed account on `/onboarding` is redirected to `/`. `safeNext` (lines 18 to 24) only follows same-origin absolute paths. Verified.
5. **Sample-data mode.** With `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1`, `lib/tobin/index.ts:7` selects `MockAdapter` and `proxy.ts:25` disables all access control. Off by default. Verified.
6. **Client gate.** `AppGate` (`components/shell/session.tsx`) re-checks `me` in the browser (401 goes to `/sign-in?expired=1`; incomplete onboarding goes to `/onboarding`) and loads the member list of the active organization to learn the user's reviewer grant (`actorKnown`). Verified.
7. **Role model in the UI.** `lib/permissions/can.ts` is presentation only. `ADMIN_ONLY` (lines 22 to 25) and `REVIEWER_ONLY` (line 26). Admin: org edit, member and invitation and reviewer management, create session, manage session, participants, record and void obligations, run netting, prepare settlement. Reviewer grant (separate from admin): approve or reject a calculation, approve or reject a settlement batch. Everything else (all reads) needs only active membership. The server is the authority (section 11 of the mapping). Verified.
8. **Suspended members.** `can()` has a `suspended` branch, but the flag is derived from the members list (`session.tsx`, `mine?.status === "suspended"`). The server returns `NOT_FOUND` for every organization read of a non-active member (`service.ts:54-63`, `#role` requires `status === 'active'`), and `accountView` lists only active memberships (`auth/service.ts:337-340`). So a suspended member never receives the members list; if suspension removes their only organization, `onboarding.step` becomes `organization` and `proxy.ts` sends them to `/onboarding`. Inference: the `suspended` branch of `can()` is unreachable in practice.

## 3. Route inventory (summary)

| # | Route | File | Type | Access (server-enforced by proxy.ts) | Backend |
|---|---|---|---|---|---|
| 1 | `/` | `app/(app)/page.tsx` -> `components/overview/Overview.tsx` | page | signed in + onboarded | derived |
| 2 | `/sessions` | `app/(app)/sessions/page.tsx` -> `SessionsList.tsx` | page | signed in + onboarded | A01, R07, R24, R26 |
| 3 | `/sessions/new` | `sessions/new/page.tsx` -> `CreateSession.tsx` | page | signed in; admin to use | R07, R25, R28 |
| 4 | `/sessions/[sessionId]` | `sessions/[sessionId]/page.tsx` -> `Workspace.tsx` | page with 6 tabs | signed in | many |
| 5 | `/obligations` | `obligations/page.tsx` -> `GlobalObligations.tsx` | page | signed in | derived |
| 6 | `/reviews` | `reviews/page.tsx` -> `Reviews.tsx` | page | signed in | derived |
| 7 | `/activity` | `activity/page.tsx` -> `GlobalActivity.tsx` | page | signed in | derived |
| 8 | `/organization` | `organization/page.tsx` -> `Organization.tsx` | page with 4 tabs | signed in | R05..R22 |
| 9 | `/settings` | `settings/page.tsx` -> `Settings.tsx` | page | signed in | A02, A06, A12, A13 |
| 10 | `/notifications` | `notifications/page.tsx` | page (static explanation) | signed in | none |
| 11 | `/approvals` | `approvals/page.tsx` | redirect to `/reviews` | signed in | none |
| 12 | `/wallets` | `wallets/page.tsx` | redirect to `/organization?tab=wallets` | signed in | none |
| 13 | `/discover` | `(public)/discover/page.tsx` | page | public | none |
| 14 | `/sign-in` | `(auth)/sign-in/page.tsx` | page | signed-out only | A03, A04, A07, A08 |
| 15 | `/onboarding` | `(auth)/onboarding/page.tsx` | page | signed in, not onboarded | A12, R04, R01, A13 |
| 16 | `/dev/components` | `dev/components/page.tsx` | page | development or `TOBIN_DEV_GALLERY=1` | none |
| - | any other path | `app/not-found.tsx`; `(app)/not-found.tsx`; `(app)/error.tsx`; `(app)/loading.tsx` | boundaries | - | none |
| - | `/api/*` | `app/api/[...path]/route.ts` | proxy (GET, POST) | cookie forwarded | see mapping |

Route boundaries (Verified): `app/not-found.tsx` (unknown address, drawn without the frame so it works signed out), `(app)/not-found.tsx` ("This page or record does not exist, or it belongs to another organization"), `(app)/error.tsx` (render error with Try again and Go to Overview), `(app)/loading.tsx` (skeleton). The `(app)` layout wraps pages in `AppGate` then `Shell`; the `(public)` layout uses the full `Shell` when `x-tobin-auth` is `in`, otherwise `PublicShell` with a locked sidebar.

## 4. Per-route detail

Abbreviations: "member" = active membership; "admin" = membership role admin; "reviewer" = reviewer grant. Every signed-in page is under the organization selected in the sidebar (`useWorkspace().org`).

### 4.1 `/` Overview (`Overview.tsx`)

| Field | Content |
|---|---|
| Purpose | Landing page: attention items, organization figures, recent activity. |
| Roles | Any member. Admin additionally sees pending invitations and stale-calculation items; reviewer additionally sees review items and a settlement read per session (`parts` chosen at `Overview.tsx:29`). |
| Data displayed | Banner "SESSIONS: n" (the length of the session list, a real count); Members count; Pending invitations (admin); Being configured / Marked ready / Closed counts ("Derived"); Awaiting your review (reviewer, "calculations only" per the hint, although the same function also counts settlement batches); up to 5 recent activity events; a coverage sentence "Based on N of M sessions". |
| Created or modified | Nothing. |
| Actions | Create session (admin; otherwise disabled with the reason), open an attention item, "Load next 10 sessions", link to All activity. |
| States | Loading skeletons; empty text "Nothing needs your attention in the sessions read"; list error state with Try again (full page reload); a session whose reads fail is counted as "unreadable" and left out; permission: disabled Create with reason. |
| Backend operations | `client.organizations.members` (R07), `client.organizations.invitations` (R19, admin), via `useCrossSession`: `client.sessions.list` (R24), then per session up to three of `client.sessions.get` (R26), `client.authorization.get` (R45), `client.settlement.list` (R35). |
| Existing API dependencies | R07, R19, R24, R26, R45, R35. |
| Missing backend | Aggregate dashboard endpoint; organization-wide activity; review queue endpoint; cross-session obligation counts (see mapping section 6). |
| Related pages | `/sessions/new`, `/reviews`, `/activity`, `/organization?tab=members`, `/sessions/:id?tab=netting`. |
| Client-side derived behaviour | Everything except the session total, member count and pending-invitation count is computed in the browser from at most the newest 10 sessions (then 20, 30, ... on request). Verified (`lib/cross-session/overview.ts`, `useCrossSession.tsx`). |

Request cost (Inference from the code): a reviewer opening Overview issues 1 (`me`) + 1 (members) + 1 (list) + 3 x 10 per-session reads = about 33 requests, before "Load next 10 sessions". `GET /sessions/:id` also loads the whole organization's activity log on every call (`registry/http.ts:158`).

### 4.2 `/sessions` Sessions list (`SessionsList.tsx`)

| Field | Content |
|---|---|
| Purpose | List, search, filter and open sessions. |
| Roles | Any member; Create session button is admin only. |
| Data displayed | Name, short id, derived state, last activity and event count, created date; "Showing x to y of z". |
| Created or modified | None. |
| Actions | Search (name or id), status filter (derived), sort (6 choices), previous/next page (page size 10, `lib/sessions/list.ts:5`), open session, Create session. URL query: `q`, `status`, `sort`, `dir`, `activity`, `page` (also `provenance`, parsed but forced to `all` in the page), and `notice=org-changed` (banner after switching organization). |
| States | Skeleton rows; error with Try again; empty "No sessions yet" (with Create action for admins); "No sessions match" with Clear filters; mobile list tiles under 900 px. |
| Backend operations | `client.sessions.list` (R24); `client.sessions.get` (R26) once per row on the visible page to learn the workflow state, because the list response has no state field (`SessionsList.tsx:50`). |
| Missing backend | Server-side search, sort, filter, pagination; workflow state, participant and obligation counts in the list. |
| Related pages | `/sessions/new`, `/sessions/:id`. |
| Client-side behaviour | Search, sort, filter and paging run in the browser over the full list (`applyQuery`). The status filter applies only to the rows already on the current page (stated on screen). |

### 4.3 `/sessions/new` Create session (`CreateSession.tsx`)

| Field | Content |
|---|---|
| Purpose | Three-step wizard: name, participants, review; creates a local draft. |
| Roles | Admin only. A non-admin sees `AccessDenied` with the reason; the member list is not requested for them (`enabled: allowed.allowed`). |
| Data displayed | Session label field (max 80), member checklist (active members, role and reviewer badge), review summary, created session id with Copy. |
| Created or modified | A `sessions` row (provenance `local-draft`, workflow `configuring`) and one `session_participants` row per selected member. |
| Actions | Continue, Back, Review, Create session, retry only the failed participants, open the workspace. |
| States | Skeleton while members load; error state for members; inline error on create failure; partial-success recovery panel when some participant adds fail (session exists, failed members listed, Retry). |
| Backend operations | `client.organizations.members` (R07), `client.sessions.create` (R25), then `client.participants.add` (R28) once per selected member, sequentially. |
| Missing backend | An atomic "create session with participants" operation (the wizard compensates on the client, `lib/sessions/wizard.ts`); fields for assets, deadlines or invitations (the page says none exist). |
| Related pages | `/sessions`, `/sessions/:id`. |

### 4.4 `/sessions/[sessionId]` Session workspace (`Workspace.tsx`)

Header area: status mark, full session id with Copy, created time, avatar stack of active participants (`SessionHeader`); a summary card (`SummaryCard`) with the six-group lifecycle ("Step n of 6"), the four-square stage rail (only "Prepared" can ever fill) and the next action; a tab bar; a main panel; and the action panel (`ActionSheet`) beside the content (xl screens) or as a bottom sheet (under 768 px).

On entry the workspace issues up to 11 reads: `get` (R26), `participants` (R27), `obligations` (R30), `readiness` (R50), `authorization` (R45), `settlement` list (R35), then for the latest batch `batch` (R37), `execution` (R41), `attempts` (R42), plus `calculation` (R49) and, in the record form, the supported-asset list (R35 again, filtered client-side). Verified (`Workspace.tsx:58-63`, `useSettlement.ts`, `RecordObligation.tsx:31`).

Error and not-found: a 404 on the detail read renders "This session does not exist in this organization" with a hint about the organization selector; other errors render an error state with Try again. A `fixture` provenance session is refused by the server on most reads (`FIXTURE`) but the app cannot create one.

Tabs (query `?tab=`, default `overview`; `Workspace.tsx:34-43`):

| Tab | Component | Content | Actions |
|---|---|---|---|
| `overview` | `OverviewTab.tsx` | Details grid (record, created, active participants, active obligations, events), readiness checks list (pass count, fix text for failing ones), five most recent events | links to Activity tab |
| `participants` | `ParticipantsTab` (`tabs.tsx`) | Active participants table, add-participant select (admin, `configuring` only), remove with confirmation | Add (R28), Remove (R29) |
| `obligations` | `ObligationsTab.tsx` + `RecordObligationPanel` | Table with search and status filter, active totals per asset, detail sheet (`?ob=<id>` opens it), record form in the action panel | Record (R31), Void (R34) |
| `netting` | `NettingTab.tsx` + `RunNettingPanel` | Step strip, eligible/excluded inputs, validation checks, gross vs net cards, positions by direction, original-vs-net highlight, calculation details sheet | Run netting (R48) |
| `settlement` | `CloseOut.tsx` | Five-step close-out (query `?step=review|prepare|batch|execution|sign`), see 4.4.1 | Approve/Reject calculation (R46, R47), Prepare (R36), Approve/Reject batch (R39, R40) |
| `activity` | `ActivityTab` (`tabs.tsx`) -> `ActivityView.tsx` | Filterable event list (filters in 9.3), activity record panel | none |

Legacy: `?tab=approvals` is redirected by an effect to `?tab=settlement&step=review` (`Workspace.tsx:55`).

Session workflow actions (action panel, admin only, `SessionActions.tsx`): Mark ready (R51), Close session (R53), Reopen session (R52, shown only in `ready`), each behind a confirmation dialog; unavailable actions show the reason. The page states the server's rules: ready is not approval or settlement; closed cannot be reopened (matches `TRANSITIONS`, `clearing.ts:107`).

| Field | Content |
|---|---|
| Roles | Any member reads; writes follow `can()` (admin for participants, obligations, netting, ready/close/reopen, prepare; reviewer for decisions). |
| Data displayed | All of the above. |
| Created or modified | participants, obligations, calculations (immutable snapshots), decisions, batches, batch reviews, workflow state, activity rows. |
| States | per-section skeleton, error with retry, empty text, disabled controls with written reasons; `ErrorState` for 404. |
| Missing backend | Pagination of obligations and activity; per-obligation history; obligation edit is not exposed in the UI although the backend has it (R33); sign/submit/verify (section 4.4.1). |
| Related pages | `/sessions`, `/reviews` (deep links `?tab=settlement&step=review|batch`), `/obligations` (`?tab=obligations&ob=`), `/organization` (grant reviewer). |

#### 4.4.1 Settlement close-out steps (`CloseOut.tsx`, `Steps.tsx`, `SettlementPanel.tsx`, `ReviewPanel.tsx`)

| Step key | Label | Who | Content | Backend |
|---|---|---|---|---|
| `review` | Review calculation | reviewer | decision state, what is being reviewed, decisions history; Approve and Reject are in the action panel (`ReviewPanel`) | R45, R49, R46, R47 |
| `prepare` | Prepare settlement | admin | preparation checks (before) or prepared-batch summary and instruction hash (after) | R35, R36, R37 |
| `batch` | Review settlement | reviewer who did not prepare it | instructions table, red mismatch diff, batch review record | R37, R39, R40 |
| `execution` | Execution record | read-only | execution state and events, attempts list, the backend's own "unavailable" list | R41, R42 |
| `sign` | Sign, submit, verify | none | three "Not supported" cards and an empty signature block | none |

Verified facts: the browser re-checks that the instructions reconcile to the approved net positions (`lib/settlement/diff.ts`) and blocks Approve on any mismatch; Reject stays possible. The Execution step text says "no route can start, sign, submit or verify one" (`Steps.tsx:131`), but `POST .../execution/start` (R43) and `.../execution/attempts/begin` (R44) exist and are reachable through the proxy; only advancing, signing, submitting and confirming have no HTTP route (see 12).

### 4.5 `/obligations` Obligations across sessions (`GlobalObligations.tsx`)

| Field | Content |
|---|---|
| Purpose | Read-only list of obligations of the newest sessions. |
| Roles | Any member. |
| Data | Session, obligation id, debtor, creditor, amount, status, recorded date; active totals per asset; coverage sentence. |
| Actions | Search, asset filter, session filter, status tabs, pagination (page 15), open detail sheet, "Load next 10 sessions". No recording or voiding here. |
| States | Skeleton table; list error with reload; "No obligations yet" / "No obligations match". |
| Backend | `useCrossSession({parts: ["obligations","detail"]})`: R24, then R30 and R26 per session. |
| Missing backend | Cross-session obligation query with filters and pagination. |
| Derived | All figures and filters are computed in the browser from at most 10, 20, ... sessions. Detail history needs the session's activity (R26). |
| Related | `/sessions/:id?tab=obligations`. |

### 4.6 `/reviews` Review queue (`Reviews.tsx`)

| Field | Content |
|---|---|
| Purpose | Calculations and settlement batches awaiting review across sessions. |
| Roles | Any member sees "All"; "My reviews" needs the reviewer grant (otherwise an `AccessDenied` card). Each row opens the session's Settlement step; nothing is decided here. |
| Data | Session, kind (calculation or settlement), asset, "Prepared by" (settlement only), who may review (server reasons for calculations; computed rule for batches), coverage sentence. |
| Actions | Toggle My reviews / All, open the Settlement step, "Load next 10 sessions". |
| States | Skeletons; empty "Nothing here"; error with reload. |
| Backend | `useCrossSession({parts: ["authorization","settlement"]})`: R24, then R45 and R35 per session. |
| Derived | `lib/cross-session/reviews.ts`. For batches the "mine" test compares the batch's `preparedBy` display name with the viewer's display name (`reviews.ts:49`), whereas the server compares user ids; two users with the same display name would be misjudged (Inference). Batch status uses only the latest batch per session. |
| Related | Sidebar badge (`useReviewsBadge`), Overview attention items. |

### 4.7 `/activity` Organization activity (`GlobalActivity.tsx`)

| Field | Content |
|---|---|
| Purpose | Newest recorded events of the newest sessions. |
| Roles | Any member. |
| Data | Time, event type, actor, detail, session, derived result (Recorded, Refused, Rejected, No longer applies; derived from the event kind only, `lib/activity/derive.ts:outcomeOf`). |
| Actions | Filter by event type, session, from/to date (UTC), result; paginate (page 20); open record panel; "Load next 10 sessions". |
| Backend | `useCrossSession({parts:["detail"]})`: R24, R26 per session. |
| Missing backend | An organization activity endpoint. Events with no session subject (member, invitation, reviewer, organization and wallet events) are written to the `activity` table but are not served anywhere (`session-view.ts` filters `a.subject === s.sessionId`), so they never appear. Verified. |
| Related | Session Activity tab. |

### 4.8 `/organization` Organization (`Organization.tsx`)

Tabs (query `?tab=`; aliases `profile` -> `overview`, `invitations` -> `members`): `overview`, `members`, `institutions`, `wallets`.

| Tab | Roles | Content | Actions and operations |
|---|---|---|---|
| Overview | member reads; admin edits | type, jurisdiction, created, your access, network; profile form | `organizations.get` R05; Save changes `organizations.update` R06 (name 2 to 120 in the form, 80 on the server; description 500; visibility) |
| Members and roles | member reads list; admin manages; invitations are admin only (members see an AccessDenied card for the invitation section) | members table (name, email for admins, role, reviewer, status, since), member side panel with Change role, Grant/Revoke reviewer, Suspend/Restore, Remove; invite form; invitations table; one-time code dialog | R07, R08, R17/R18, R10, R09, R19, R20, R21 |
| Institutions | member | own organization profile only, plus a "Not supported" card for a directory and counterparties | R05 |
| Wallets | member | your wallets (from `me`), wallet in this browser (Freighter state), organization verified accounts (R13), organization wallet claims (R22), wallet details panel, Disconnect | A01 (`me`), R13, R22, A11, A07/A08 (see below) |

Notes (Verified): the "Connect a wallet" button on the Wallets tab (`Wallets.tsx:87`) opens the shared Connect wallet dialog, whose flow (`WalletSignInFlow.tsx:46-47`) calls the sign-in operations `walletChallenge` and `walletVerify` (A07, A08), not the link operations A09 and A10. It does not link a wallet to the signed-in account. `WALLET_NOTE` says "this button does not change it" (`lib/org/rules.ts:44`). See 12 for the consequence.

The role dialog lists "They will gain / They will lose" from `roleDifferences`, disables confirm for a no-op or for removing the last active admin; the server enforces the same (`LAST_ADMIN`).

States: skeletons, error with retry, empty "No members" / "No invitations", AccessDenied for invitations when not admin, disabled admin actions with reasons.

Missing backend: member-only "leave organization" (removal is admin only), organization deletion, change of type or jurisdiction (UI states they are fixed), invitation delivery, a user directory.

### 4.9 `/settings` (`Settings.tsx`)

Account: display name form (A12), Password card (Not supported: no route), Sessions card (Sign out everywhere A06; "List of active sessions" Not supported), Account activity (A02, newest 15 events). Organization: default organization select (A13), About access (role help text). Any signed-in user. Sign out everywhere opens a destructive dialog and then redirects to `/sign-in`.

### 4.10 `/notifications` (static)

Renders `NotSupported` ("The backend has no notifications: no route, no model and no unread count") with links to Overview and Reviews. The top-bar bell is a muted link to this page. No data, no backend. Verified.

### 4.11 `/approvals` and `/wallets` (redirects)

`/approvals` -> `/reviews`; `/wallets` -> `/organization?tab=wallets` (server redirects in the page files). `activeNav` and `titleOf` (`nav.ts:25-39`) still map these paths. No backend.

### 4.12 `/discover` (public, `(public)/discover/page.tsx`, `Explorer.tsx`)

| Field | Content |
|---|---|
| Purpose | Public explorer: protocol statistics and lists of settlements, institutions, assets. |
| Roles | Anyone (signed-in users get the full frame and a "Go to Overview" button). |
| Data | A static "What Tobin is" paragraph with a maturity banner; four statistics all reading "No data"; three tabs (`?tab=settlements|institutions|assets`) with sort select (`?sort=`) whose list is one "No data" tile; a collapsed worked example "How clearing works" (`ClearingExample.tsx`, illustrative arithmetic, labelled). |
| Backend | None. `lib/discover/client.ts` exports `unavailableClient`, every method resolves `{kind:"unavailable"}` without any request. Every registry route answers 401 without a session (`registry/http.ts:49-50`), so no public read endpoint exists. Verified. |
| Missing backend | The whole public API (statistics, settlements with read-back verification flag, opted-in institutions, assets). |
| Related | `/sign-in`. |

### 4.13 `/sign-in` (`(auth)/sign-in/page.tsx`)

Two-step email flow (email, then password) with a login/register toggle, plus "Continue with wallet" which opens the Connect wallet dialog. Query: `next` (sanitized), `expired=1` (notice), `wallet-disconnected=1` (notice). On success: `qc.invalidateQueries(["me"])` and `router.replace(next)`. Backend: A04 login, A03 register (register performs registration then login in one request, `auth/http.ts:90-94`), A07 + A08 for wallet.

Validation mismatch: the form requires a password of at least 8 characters and the hint says "At least 8 characters" (`schemas.ts:25`, `sign-in/page.tsx:46`), but the server requires 12 to 128 (`auth/service.ts:97`). An 8 to 11 character password passes the form and is refused by the server with the message "password must be 12 to 128 characters", shown inline. Verified.

### 4.14 `/onboarding` (`(auth)/onboarding/page.tsx`)

Steps by `me.onboarding.step`: `profile` (display name, A12), then choose Create organization (two-step form with review, R04) or Join with invitation (one-time code, R01); both end with A13 `setWorkspace` and a full navigation to `/`. Errors map `INVALID_INVITATION` to a friendly message. Organization form: name 2 to 120 (server 80, `service.ts:69`), type from a fixed list, jurisdiction two letters, description 500, visibility.

### 4.15 `/dev/components`

Component gallery with fictional values and fixtures (`lib/fixtures/failed-states.ts`), no backend call. `app/dev/layout.tsx` calls `notFound()` in production unless `TOBIN_DEV_GALLERY=1`; `decide.ts` lets the path through regardless. Verified.

## 5. Shell and navigation

| Element | Where | Content | Behaviour |
|---|---|---|---|
| Sidebar | `shell/Sidebar.tsx`, `nav.ts` | Organization selector; NAVIGATION: Discover, Overview, Sessions, Obligations, Reviews (with count badge), Activity, Organization, Settings; EXTERNAL: Documentation, Repository, Share feedback (new-tab links to `docs.tobinprotocol.xyz` and `github.com/tobin-protocol/tobin`) | Signed out: all items except Discover are locked and link to `/sign-in?next=...`. Under 1024 px it moves into a drawer. |
| Top bar | `shell/TopBar.tsx`, `topbar/controls.tsx` | Page label, Help link, Search (Ctrl/Cmd+K), Environment popover, Wallet popover, Notifications link, Account menu | Signed out: Environment (hidden under 768 px) plus Connect wallet and Sign up / Log in. |
| Reviews badge | `useReviewsBadge.ts` | count of "My reviews" | Makes no request (`passive`); stays empty until a page has loaded authorizations and settlement lists of the whole window (`reviewsBadge`, `reviews.ts`). |
| Help tile | `HelpTile.tsx` | fixed link to documentation | static |
| Grain banner | `GrainBanner.tsx` | "SESSIONS: n" or "NO DATA" | on Overview and Sessions |
| Sample-data banner | `ui/Surfaces.tsx` | shown only in sample mode | |
| Testnet strip | `TestnetStrip` | shown on pages with `sensitive` set (session workspace, create session, reviews) | |

Stale comment (Verified): `nav.ts:6` says Reviews opens `/approvals` until a later phase; the item's `href` is `/reviews`.

## 6. Authentication and wallet UI

| Component | Purpose | Calls |
|---|---|---|
| `WalletProvider` | detects Freighter (`@stellar/freighter-api` 6.0.1) on load and on window focus; exposes `wallet`, `connect`, `refresh` | browser extension only |
| `ConnectWalletProvider` / `ConnectWallet.tsx` | the Connect wallet dialog: wallet list (only Freighter is registered, `lib/wallet/registry.ts`), install link, per-wallet sign-in flow | A07, A08 via `WalletSignInFlow` |
| `WalletSignInFlow.tsx`, `lib/wallet/signin.ts` | 15 named states (idle ... account-changed); requests a challenge, asks Freighter to `signMessage`, verifies | A07, A08 |
| `WalletCell` (top bar) | popover with connected / verified status, Connect Freighter, Disconnect, Check again, Manage wallets | `me` for the verified list; A11 via the disconnect dialog |
| `DisconnectWalletDialog` | revokes a verified wallet; if the current session used that wallet the user is signed out and sent to `/sign-in?wallet-disconnected=1` | A11, then A01 |
| `WalletsPanel` / `OrgWallets` | tables of own and organization wallets | A01, R13, R22 |

No client method exists for A09, A10, A14, R11, R12, R23. Verified by the client interface (`client.ts:13-27`).

## 7. Notable shared components

`components/kit/*` (shadcn-style primitives: dialog, sheet, dropdown-menu, popover, command, select, table, tabs, tooltip...) and `components/ui/*` (legacy primitives: `Overlays.tsx` Dialog, SidePanel, Popover, CommandPanel; `Data.tsx` Table, PageTabs, SegmentTabs, Amount, Identifier, AvatarStack; `Flow.tsx` Stepper, NextAction, StageRail, ApprovalBlock, SignatureBlock; `Form.tsx`; `Feedback.tsx` EmptyState, ErrorState, AccessDenied, NotSupported, StatusMark; `Surfaces.tsx`). `components/tobin/Overlays.tsx` supplies `Confirm` and `DetailSheet` used by the session screens. Two overlay systems coexist (kit and ui/tobin). `CommandPanel`, `ui/Popover` and `Stepper` are used only by `/dev/components`. `components/approvals/usePending.ts` is not imported by any screen (dead code; Verified by grep). `lib/derived/overview.ts` is imported only by `usePending.ts` and `lib/activity/derive.ts` (for the constant `SESSION_REQUEST_CAP`, which is 10).

## 8. Overlays catalogue

### 8.1 Modal dialogs (23)

| # | Dialog | Component | Does | Calls |
|---|---|---|---|---|
| D01 | Sign out of Tobin? | `topbar/controls.tsx:141` | confirms sign-out | A05 |
| D02 | Command palette "Go to" | `SearchCommand` (`controls.tsx:158`) | jump to a page or to a session already in the browser cache (`["sessions", org]`, cap 300, `lib/shell/command.ts`) | none |
| D03 | Connect wallet | `ConnectWallet.tsx` | wallet list, then sign-in flow | A07, A08 |
| D04 | Disconnect wallet | `DisconnectWalletDialog.tsx` | revoke a verified wallet | A11, A01 |
| D05 | Mark this session ready? | `SessionActions.tsx` | | R51 |
| D06 | Close this session? | `SessionActions.tsx` | | R53 |
| D07 | Reopen this session? | `SessionActions.tsx` | lists what changes, what is kept, what becomes stale | R52 |
| D08 | Remove participant? | `tabs.tsx` | | R29 |
| D09 | Run netting? | `NettingTab.tsx` | summary of inputs | R48 |
| D10 | Record this obligation? | `RecordObligation.tsx` | review before create | R31 |
| D11 | Void this obligation? | `ObligationsTab.tsx` | optional reason (200) | R34 |
| D12 | Approve this calculation? | `ReviewPanel.tsx` | summary of the calculation | R46 |
| D13 | Reject this calculation? | `ReviewPanel.tsx` | required reason (1 to 500) | R47 |
| D14 | Prepare settlement? | `SettlementPanel.tsx` | shows preparation checks | R36 |
| D15 | Approve this settlement? | `SettlementPanel.tsx` | instructions and hash | R39 |
| D16 | Reject this settlement? | `SettlementPanel.tsx` | required reason | R40 |
| D17 | Change role | `Organization.tsx` | role select with gains/losses | R08 |
| D18 | Grant / Revoke reviewer capability | `Organization.tsx` | | R17 or R18 |
| D19 | Suspend / Restore member | `Organization.tsx` | | R10 |
| D20 | Remove member | `Organization.tsx` | consequence list | R09 |
| D21 | Invitation created | `Organization.tsx` | shows the one-time code once, Copy | none (data from R20) |
| D22 | Revoke this invitation? | `Organization.tsx` | | R21 |
| D23 | Sign out everywhere? | `Settings.tsx` | | A06 |

### 8.2 Side panels, sheets, drawers (8)

| # | Panel | Component | Content |
|---|---|---|---|
| S01 | Mobile navigation drawer | `TopBar.tsx` (`Sheet`) | the sidebar under 1024 px |
| S02 | Wallet details | `Wallets.tsx` | address, network, connection, verification, Copy, Disconnect |
| S03 | Member details | `Organization.tsx` | name, role, reviewer, status, since, email, wallet; admin actions |
| S04 | Obligation detail (session) | `ObligationsTab.tsx` | amount, revision, asset identity, recorded by, history parsed from activity, Void |
| S05 | Obligation detail (global) | `GlobalObligations.tsx` | same body without Void |
| S06 | Calculation details | `NettingTab.tsx` | calculation id, asset, who/when, obligation count, validation |
| S07 | Activity record | `ActivityView.tsx` | when, who, operation, result, detail, link to the session |
| S08 | Session action panel | `ActionSheet.tsx` | the per-tab action card; bottom sheet under 768 px, open state kept in `sessionStorage` key `tobin-sheet` |

### 8.3 Menus and popovers (4)

| # | Control | Component | Content |
|---|---|---|---|
| P01 | Organization selector | `OrgSelector.tsx` | user's organizations; selecting calls A13 and clears cached data |
| P02 | Account menu | `controls.tsx:112` | name, sign-in method, role label, Settings, Sign out |
| P03 | Environment | `controls.tsx:29` | static text: "Stellar Testnet", no Mainnet |
| P04 | Wallet | `controls.tsx:47` | provider, connected, verified, address, actions |

## 9. Forms, tables, filters

### 9.1 Standalone forms (13)

| # | Form | Component | Validation (client) | Operation |
|---|---|---|---|---|
| FM01 | Email entry | `sign-in/page.tsx` | basic email regex | none (client step) |
| FM02 | Log in | `sign-in/page.tsx` | non-empty | A04 |
| FM03 | Register | `sign-in/page.tsx` | name 1 to 80, password >= 8 (server: 12 to 128) | A03 |
| FM04 | Profile name | `onboarding/page.tsx` | 1 to 80 | A12 |
| FM05 | Create organization (2 steps) | `onboarding/page.tsx` | name 2 to 120 (server 80), type enum, jurisdiction 2 letters, description 500 | R04 |
| FM06 | Join with invitation | `onboarding/page.tsx` | token >= 8 characters | R01 |
| FM07 | Create session wizard (3 steps) | `CreateSession.tsx` | label 1 to 80 | R25, R28 |
| FM08 | Add participant | `tabs.tsx` | choose from candidates | R28 |
| FM09 | Record obligation | `RecordObligation.tsx` | amount `^[1-9][0-9]{0,38}$`, debtor != creditor, asset code `^[A-Z0-9]{1,12}$` or supported-asset id, reference 200 | R31 |
| FM10 | Display name | `Settings.tsx` | 1 to 80 | A12 |
| FM11 | Default organization select | `Settings.tsx` | member organization | A13 |
| FM12 | Organization profile | `Organization.tsx` | name, description, visibility | R06 |
| FM13 | Invite | `Organization.tsx` | invitee 3 to 120, role | R20 |

In-dialog inputs (4): void reason (D11), reject calculation reason (D13), reject settlement reason (D16), role select (D17).

### 9.2 Tables and lists (12 `Table` instances plus 3 list views)

Tables: sessions list; participants; session obligations; global obligations; netting eligible inputs; netting excluded inputs; netting positions (one render per direction group); settlement instructions; members; invitations; organization verified accounts; own wallets. List views (not `Table`): activity list, review queue, organization wallet claims.

### 9.3 Filters, search, sort (5 groups)

| Group | Controls | Where it runs |
|---|---|---|
| Sessions list | text search (name or id), status (derived), sort (created, name, last activity; asc and desc), page | browser, over the full list; URL-held |
| Session obligations tab | text search (reference, debtor, creditor), status all/active/voided | browser |
| Global obligations | text search, asset, session, status, page | browser, over the sessions read |
| Activity (global and session) | event type, session (global only), from, to, result, page | browser, over the sessions read |
| Discover | tab, sort | URL; the lists are empty |

Plus the command palette (page and loaded-session names) and, when more than six wallets are registered, a wallet search (not shown today: one wallet).

## 10. Interaction catalogue

### 10.1 Mutating interactions (32; each is a distinct client method or flow)

| # | Interaction | Client method | Op |
|---|---|---|---|
| 1 | Register and sign in | `auth.register` | A03 |
| 2 | Log in | `auth.login` | A04 |
| 3 | Wallet sign-in (challenge then verify) | `auth.walletChallenge` + `auth.walletVerify` | A07 + A08 |
| 4 | Set display name (onboarding, settings) | `auth.setProfile` | A12 |
| 5 | Choose workspace / default organization | `auth.setWorkspace` | A13 |
| 6 | Sign out | `auth.logout` | A05 |
| 7 | Sign out everywhere | `auth.logoutAll` | A06 |
| 8 | Disconnect (revoke) wallet | `auth.removeWallet` | A11 |
| 9 | Create organization | `organizations.create` | R04 |
| 10 | Accept invitation | `organizations.acceptInvitation` | R01 |
| 11 | Update organization profile | `organizations.update` | R06 |
| 12 | Change member role | `organizations.setRole` | R08 |
| 13 | Suspend or restore member | `organizations.setStatus` | R10 |
| 14 | Remove member | `organizations.removeMember` | R09 |
| 15 | Grant reviewer | `organizations.setReviewer(true)` | R17 |
| 16 | Revoke reviewer | `organizations.setReviewer(false)` | R18 |
| 17 | Create invitation | `organizations.invite` | R20 |
| 18 | Revoke invitation | `organizations.revokeInvitation` | R21 |
| 19 | Create session | `sessions.create` | R25 |
| 20 | Add participant | `participants.add` | R28 |
| 21 | Remove participant | `participants.remove` | R29 |
| 22 | Record obligation | `obligations.record` | R31 |
| 23 | Void obligation | `obligations.void` | R34 |
| 24 | Run netting | `netting.run` | R48 |
| 25 | Approve calculation | `authorization.decide("approve")` | R46 |
| 26 | Reject calculation | `authorization.decide("reject")` | R47 |
| 27 | Prepare settlement | `settlement.prepare` | R36 |
| 28 | Approve settlement batch | `settlement.decide("approve")` | R39 |
| 29 | Reject settlement batch | `settlement.decide("reject")` | R40 |
| 30 | Mark session ready | `sessions.markReady` | R51 |
| 31 | Close session | `sessions.close` | R53 |
| 32 | Reopen session | `sessions.reopen` | R52 |

### 10.2 Read operations (18)

A01 `me`; A02 `audit`; R05 organization; R07 members; R13 wallet verifications; R19 invitations; R22 wallet claims; R24 sessions; R26 session detail; R27 participants; R30 obligations; R35 settlement list (also the supported-asset list); R37 batch; R41 execution; R42 attempts; R45 authorization; R49 calculation; R50 readiness.

### 10.3 Client-only interactions (47)

C01 open command palette and jump; C02 open mobile drawer; C03 Environment popover; C04 Wallet popover and Freighter connect or re-check (browser extension only); C05 open organization menu; C06 switch session tab (6 tabs); C07 switch close-out step (5 steps); C08 expand or collapse mobile action sheet; C09 sessions search; C10 sessions status filter; C11 sessions sort; C12 sessions paging; C13 obligations-tab search; C14 obligations-tab status; C15 open obligation detail (session); C16 global obligations search; C17 asset filter; C18 session filter; C19 status filter; C20 paging; C21 open obligation detail (global); C22 to C26 activity filters (type, session, from, to, result); C27 clear activity filters; C28 activity paging; C29 open activity record; C30 Load next 10 sessions; C31 netting hover or focus highlight; C32 open calculation details; C33 copy id, address or code; C34 open wallet details; C35 open member panel; C36 choose wallet in the picker; C37 Discover tab; C38 Discover sort; C39 expand "How clearing works"; C40 create-session wizard step and member selection; C41 create-organization review step; C42 sign-in email to credentials step and login/register toggle; C43 role-change dialog role choice; C44 obligation form review step; C45 choose participant to add; C46 Reviews "My reviews / All"; C47 external links.

## 11. Client-side only, derived and hard-coded behaviour

1. **Cross-session hook.** `components/data/useCrossSession.tsx` is the only place that fans out (decision D6 in the code comments). It reads the session list, takes the newest `cap` sessions (`INITIAL_CAP = 10`, `LOAD_STEP = 10`, `lib/cross-session/window.ts:6-7`) and issues one query per requested part per session (`detail` = R26, `authorization` = R45, `settlement` = R35, `obligations` = R30), each cached under `["xs", org, session, part]` for 30 s with no retry. It feeds Overview, Reviews, global Obligations, global Activity and the sidebar badge. A session whose reads fail is excluded and counted "unreadable". Verified.
2. **Derived values shown to the user**: workflow counts, awaiting-review counts, stale count, recent events, review queue, global obligation list and totals, global activity, event "result", session state column, obligation history (matched on the first 8 characters of the id inside activity text, `lib/obligations/rules.ts:obligationHistory`; marked unavailable if two obligations share the prefix), gross-vs-net reduction (`lib/netting/group.ts`), settlement mismatch diff (`lib/settlement/diff.ts`), next action and lifecycle (`lib/sessions/lifecycle.ts`, `next-action.ts`), invitation "Expired" (derived from `expiresAt`).
3. **Sample data.** `MockAdapter` (`lib/tobin/mock-adapter.ts`) returns fictional fixed data for a subset of methods when `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1`; it disables access control (`proxy.ts:25`); it throws for wallet sign-in, invite and batch reads. Fixtures: `lib/fixtures/failed-states.ts` (dev gallery only); `ClearingExample.tsx` (labelled illustrative arithmetic).
4. **Browser storage.** `localStorage` key `tobin.lastWallet` (remembers the wallet chosen in the picker, `lib/wallet/registry.ts:40-41`); `sessionStorage` key `tobin-sheet` (mobile action sheet open state, `ActionSheet.tsx`). TanStack Query holds all server data in memory (`Providers.tsx`: `staleTime` 15 s, no retry, no focus refetch). No other persistence.
5. **Hard-coded values**: network label "Stellar Testnet" and `TESTNET_PASSPHRASE` (`lib/wallet/freighter.ts`); wallet sign-in always sends `network: "testnet"` and `scheme: "sep-53"` (`client.ts:112-114`); external URLs in `nav.ts`; institution type list and labels (`types.ts:19`); page sizes 10 (sessions), 15 (global obligations), 20 (activity); reason limits 500/200; asset code pattern; the PRD role help text (`can.ts:PRD_ROLE_HELP`).
6. **Discover** is an empty explorer: the client is a stub that never calls the network.
7. **Notifications** and **global search** are declared `NotSupported` constants (`client.ts:96-99`) with no call.

## 12. Discrepancies found between UI text, documents and code

| # | Finding | Evidence | Label |
|---|---|---|---|
| 1 | Password minimum is 8 in the form and hint but 12 on the server. | `schemas.ts:25`, `sign-in/page.tsx:46`, `auth/service.ts:97` | Verified |
| 2 | Organization name maximum is 120 in the forms but 80 on the server. | `schemas.ts:33,53`, `service.ts:69,97` | Verified |
| 3 | Execution step says no route can start an execution; `execution/start` and `attempts/begin` exist (neither is called by the app). | `Steps.tsx:131`, `registry/http.ts:257,262` | Verified |
| 4 | "Connect a wallet" on a signed-in account runs the sign-in flow. Approving a signature for a wallet unknown to Tobin creates a new wallet-only user and replaces the session cookie (the verify call passes the current cookie as `replaceToken`); a known wallet signs in as its owner. It cannot link a wallet to the current account. | `ConnectWallet.tsx:47-52`, `WalletSignInFlow.tsx:46-47`, `auth/http.ts:58-63`, `auth/service.ts:232-258` | Verified code path (behaviour not executed) |
| 5 | The `suspended` actor branch is unreachable (see section 2 item 8). | `service.ts:54-63`, `session.tsx` | Inference |
| 6 | Reviews "mine" test for batches compares display names. | `reviews.ts:49` | Verified |
| 7 | `nav.ts:6` comment says Reviews opens `/approvals`. | `nav.ts:6-8` | Verified (stale comment) |
| 8 | Overview "Awaiting your review" hint says "calculations only", but `overviewOf` counts `mineOf(reviewQueue(...))`, which includes settlement batches when the settlement part is loaded (reviewer role loads it). | `Overview.tsx:70`, `overview.ts:49` | Verified |
| 9 | `usePending.ts` is unused. | grep | Verified |
| 10 | `apps/web/README.md` says the app cannot "link or verify a wallet"; consistent with the code (no client method), but the Wallets tab button label could suggest otherwise. | README line 9, `Wallets.tsx:87` | Verified |
