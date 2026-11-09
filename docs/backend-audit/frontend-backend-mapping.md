# Frontend to backend mapping: `apps/web` to `apps/web-console`

This document maps every meaningful action of the redesigned application (`apps/web`) to the backend operation that serves it, and classifies how complete that backend support is. The screens and components are described in [`frontend-functionality-inventory.md`](frontend-functionality-inventory.md); this document uses its route and component names.

Evidence labels: **Verified** (read in code), **Inference**, **Unknown**, **Recommendation**. No server was started, no test run, no network used; the database was not opened. A working UI interaction is not evidence of a working backend capability; each status below is about the backend path, and the "Derived" notes say where the UI compensates for a missing one.

## 1. Counts (Verified)

| Measure | Count | Rule |
|---|---|---|
| Distinct method + path operations in `apps/web-console/app/api` | **82** | `auth` 14 + `registry` 53 + `stellar` 3 + `bootstrap` 1 + `rpc` 1 + `health` 1 + `w0` 9. `stellar/run` is one path with five `action` values; `w0/session` has GET, POST, DELETE and counts three; `approve` and `reject` count separately. Unknown paths answer 404 and are not counted. |
| Reachable from `apps/web` through its proxy | **67** | `auth` 14 + `registry` 53 (`lib/proxy-policy.ts:7` allows `/api/auth` and `/api/registry`, GET and POST only, `:14`; every one of the 67 is GET or POST) |
| Not reachable from `apps/web` | **15** | `stellar` 3, `bootstrap`, `rpc`, `health`, `w0` 9 (proxy answers 404 `PROXY_REFUSED`) |
| Called by the app (a client method issues them) | **51** (18 GET, 33 POST) | section 3 |
| Reachable but never called | **16** | `auth` 3 (A09, A10, A14) + `registry` 13; section 9 |
| Called operations by status | Fully implemented 45, Partially implemented 6, Mocked 0, Frontend-only 0, Missing 0, Requires redesign 0 | section 3 (the HTTP adapter never returns mock data) |

Feature-level counts by classification are in section 7.

## 2. Operation catalogue and ids

Paths below are relative to `/api` on the console; through the app the same path is used on the app's own origin. `:org` = `/registry/orgs/:orgId`, `:s` = `/sessions/:sessionId`. Source: `apps/web-console/lib/auth/http.ts` (A), `lib/registry/http.ts` (R), `app/api/*` (O, W).

| Id | Method + path | Called by app | Client method |
|---|---|---|---|
| A01 | GET `/auth/me` | yes (also `proxy.ts`) | `auth.me` |
| A02 | GET `/auth/audit` | yes | `auth.audit` |
| A03 | POST `/auth/register` | yes | `auth.register` |
| A04 | POST `/auth/login` | yes | `auth.login` |
| A05 | POST `/auth/logout` | yes | `auth.logout` |
| A06 | POST `/auth/logout-all` | yes | `auth.logoutAll` |
| A07 | POST `/auth/wallet/challenge` | yes | `auth.walletChallenge` |
| A08 | POST `/auth/wallet/verify` | yes | `auth.walletVerify` |
| A09 | POST `/auth/wallet/link/challenge` | **no** | none |
| A10 | POST `/auth/wallet/link/verify` | **no** | none |
| A11 | POST `/auth/wallet/remove` | yes | `auth.removeWallet` |
| A12 | POST `/auth/profile` | yes | `auth.setProfile` |
| A13 | POST `/auth/workspace` | yes | `auth.setWorkspace` |
| A14 | POST `/auth/renew` | **no** | none |
| R01 | POST `/registry/invitations/accept` | yes | `organizations.acceptInvitation` |
| R02 | GET `/registry/assets` | **no** | none (the app reads assets from R35) |
| R03 | GET `/registry/orgs` | **no** | none (organizations come from A01) |
| R04 | POST `/registry/orgs` | yes | `organizations.create` |
| R05 | GET `:org` | yes | `organizations.get` |
| R06 | POST `:org/update` | yes | `organizations.update` |
| R07 | GET `:org/members` | yes | `organizations.members` |
| R08 | POST `:org/members/:u/role` | yes | `organizations.setRole` |
| R09 | POST `:org/members/:u/remove` | yes | `organizations.removeMember` |
| R10 | POST `:org/members/:u/status` | yes | `organizations.setStatus` |
| R11 | POST `:org/wallet-challenges` | **no** | none |
| R12 | POST `:org/wallet-challenges/:c/verify` | **no** | none |
| R13 | GET `:org/wallet-verifications` | yes | `organizations.verifications` |
| R14 | POST `:org/signer-sets` | **no** | none |
| R15 | GET `:org/signer-sets/:account` | **no** | none |
| R16 | GET `:org/reviewers` | **no** | none (the reviewer flag comes inside R07) |
| R17 | POST `:org/reviewers/:u/grant` | yes | `organizations.setReviewer(true)` |
| R18 | POST `:org/reviewers/:u/revoke` | yes | `organizations.setReviewer(false)` |
| R19 | GET `:org/invitations` | yes | `organizations.invitations` |
| R20 | POST `:org/invitations` | yes | `organizations.invite` |
| R21 | POST `:org/invitations/:i/revoke` | yes | `organizations.revokeInvitation` |
| R22 | GET `:org/wallets` | yes | `organizations.claims` |
| R23 | POST `:org/wallets` | **no** | none |
| R24 | GET `:org/sessions` | yes | `sessions.list` |
| R25 | POST `:org/sessions` | yes | `sessions.create` |
| R26 | GET `:org:s` | yes | `sessions.get` |
| R27 | GET `:org:s/participants` | yes | `participants.list` |
| R28 | POST `:org:s/participants` | yes | `participants.add` |
| R29 | POST `:org:s/participants/:u/remove` | yes | `participants.remove` |
| R30 | GET `:org:s/obligations` | yes | `obligations.listBySession` |
| R31 | POST `:org:s/obligations` | yes | `obligations.record` |
| R32 | GET `:org:s/obligations/:o` | **no** | none |
| R33 | POST `:org:s/obligations/:o/update` | **no** | none |
| R34 | POST `:org:s/obligations/:o/void` | yes | `obligations.void` |
| R35 | GET `:org:s/settlement` | yes | `settlement.list`, `assets.list` |
| R36 | POST `:org:s/settlement/prepare` | yes | `settlement.prepare` |
| R37 | GET `:org:s/settlement/batches/:b` | yes | `settlement.batch` |
| R38 | GET `.../batches/:b/validation` | **no** | none |
| R39 | POST `.../batches/:b/approve` | yes | `settlement.decide("approve")` |
| R40 | POST `.../batches/:b/reject` | yes | `settlement.decide("reject")` |
| R41 | GET `.../batches/:b/execution` | yes | `settlement.execution` |
| R42 | GET `.../batches/:b/execution/attempts` | yes | `settlement.attempts` |
| R43 | POST `.../batches/:b/execution/start` | **no** | none |
| R44 | POST `.../batches/:b/execution/attempts/begin` | **no** | none |
| R45 | GET `:org:s/authorization` | yes | `authorization.get` |
| R46 | POST `:org:s/authorization/approve` | yes | `authorization.decide("approve")` |
| R47 | POST `:org:s/authorization/reject` | yes | `authorization.decide("reject")` |
| R48 | POST `:org:s/calculate` | yes | `netting.run` |
| R49 | GET `:org:s/calculation` | yes | `sessions.calculation` |
| R50 | GET `:org:s/readiness` | yes | `sessions.readiness` |
| R51 | POST `:org:s/ready` | yes | `sessions.markReady` |
| R52 | POST `:org:s/reopen` | yes | `sessions.reopen` |
| R53 | POST `:org:s/close` | yes | `sessions.close` |
| O01 | POST `/stellar/cosign` | not reachable | n/a |
| O02 | POST `/stellar/run` (actions status, prepare, attach, submit, resolve) | not reachable | n/a |
| O03 | POST `/stellar/validation` | not reachable | n/a |
| O04 | GET `/bootstrap` | not reachable | n/a |
| O05 | POST `/rpc` | not reachable | n/a |
| O06 | GET `/health` | not reachable | n/a |
| W01 to W09 | `/w0/session` (GET, POST, DELETE), `/w0/readiness` (GET), `/w0/previews` (GET, POST), `/w0/approvals` (GET, POST), `/w0/audit` (GET) | not reachable | n/a (mock API) |

Line anchors (Verified): A01 `auth/http.ts:35`, A02 `:42`, A05 `:48`, A07 `:53`, A08 `:58`, A09 `:67`, A10 `:71`, A11 `:75`, A12 `:79`, A13 `:80`, A14 `:81`, A06 `:85`, A03/A04 `:90`. R01 `registry/http.ts:55`, R02 `:65`, R03 `:70`, R04 `:71`, R05 `:75`, R06 `:80`, R07 `:85`, R08 to R10 `:92-94`, R11/R12 `:97/:102`, R13 `:108`, R14/R15 `:113/:125`, R16 `:128`, R17/R18 `:129/:130`, R19 to R21 `:133/:134/:141`, R22/R23 `:144/:145`, R24 to R26 `:148/:149/:155`, R27 to R29 `:184/:185/:190`, R30 to R34 `:193/:194/:199/:200/:205`, R35/R36 `:231/:232`, R37 `:263`, R38 `:264`, R39/R40 `:265`, R41 `:239`, R42 `:253`, R43 `:262`, R44 `:257`, R45 to R47 `:282/:283`, R48 `:289`, R49 `:290`, R50 `:291`, R51 to R53 `:292`.

## 3. Common behaviour (applies to every operation unless a row says otherwise)

1. **Authentication.** The cookie `tobin_session` (opaque 32-byte token, SHA-256 stored in `auth_sessions`; `HttpOnly; SameSite=Strict; Path=/; Secure` in production; `auth/http.ts:8,20-21`). `AuthService.resolve` accepts it only when the row is unrevoked, unexpired, the user is enabled, and for wallet sessions also within the idle limit (2 h), with an active wallet (`auth/service.ts:146-165`). Absolute lifetimes: password sessions 8 h; wallet sessions capped at 24 h from first creation (`:37-39,129-137`). Registry routes call `deps.authenticate` and return 401 `UNAUTHENTICATED` without a session (`registry/http.ts:49-50`). Public: A03, A04, A05, A07, A08 (and A01, A02 return 401 without a session).
2. **Request header.** Every non-GET request must carry `x-tobin-request: 1`, else 403 `FORBIDDEN` (`registry/http.ts:48`; `auth/http.ts:47`). The app's proxy adds it for POST (`app/api/[...path]/route.ts`). The console's own `proxy.ts` additionally enforces a loopback Host allow-list, refuses a foreign Origin on `/api/`, and requires `application/json` on POST (`lib/server/guards.ts:64-68`).
3. **Body limits.** App proxy 8 KiB (`proxy-policy.ts:8`); console `readBody` rejects more than 4096 characters or a non-object (`registry/http.ts:36-41`).
4. **Authorization pattern** (`service.ts:54-63`): `#role` finds an **active** membership; no membership, suspended membership, or unknown organization all give 404 `NOT_FOUND` "organization not found" (existence is not leaked). `admin` operations then give 403 `FORBIDDEN` "administrator role required". Reviewer decisions require a row in `org_reviewers` (`#isReviewer`, `:510`), not the admin role. Authorization reads therefore touch `memberships` and `organizations` on every call.
5. **Session scoping.** Session-level reads call `session()` (`sessions` row must belong to the organization, else 404) and most then `#opSession` (rejects `fixture` provenance with 409 `FIXTURE`). Session edits call `#editable`: admin, and workflow must be `configuring` (409 `INVALID_STATE`: "the session is marked ready: reopen it to make changes" or "the session is closed and cannot change") (`service.ts:265-277`).
6. **Transactions.** Writes run inside `store.transaction`; the `activity` row is appended in the same transaction (`#log`, `:50-53`). `activity`, `calculations`, `authorization_decisions`, `authorization_invalidations`, settlement batch/instruction/review/invalidation, execution and attempt tables are immutable by trigger (`database.ts` triggers), so "writes" below are inserts.
7. **Error envelope.** `{ "error": CODE, "message": text }` (`json`, `registry/http.ts:33`). Registry status map (`:29`): NOT_FOUND 404, INVALID 400, FORBIDDEN 403, EXISTS 409, LAST_ADMIN 409, INVALID_STATE 409, NOT_VERIFIED 409, FIXTURE 409, INVALID_INVITATION 400, RATE_LIMITED 429, STALE 409, SEPARATION_OF_DUTIES 403, INVALID_CHALLENGE 400; unknown codes become 400. Auth map (`auth/http.ts:28`): INVALID 400, INVALID_CREDENTIALS 401, AUTH_FAILED 401, UNAUTHENTICATED 401, RATE_LIMITED 429, REGISTRATION_FAILED 409, WALLET_UNAVAILABLE 409, LAST_METHOD 409, INVALID_STATE 409, NOT_FOUND 404. 503 `BACKEND_UNAVAILABLE` and 500 `INTERNAL` otherwise. The app turns any non-OK response into `ApiError(status, code, message)` and shows `message` (`lib/api/http.ts`).
8. **No pagination, filtering or sorting anywhere.** Neither handler reads `searchParams` (grep: none in `registry/http.ts` or `auth/http.ts`). Every list returns all rows.
9. **Activity log scope.** The `activity` table is organization-scoped. The only way to read it is inside R26 (`registry/http.ts:158-162`), which loads the **entire organization log** for each call and returns only the rows whose `subject` equals the session id; rows about members, invitations, reviewers, organization edits and wallet verification have another subject and are never returned by any route (Verified).

### 3.1 Audit events written

`activity.kind` (organization scoped, immutable): `organization.created/updated`, `member.role/removed/suspended/restored`, `invitation.created/revoked/accepted`, `reviewer.granted/revoked`, `wallet.linked`, `wallet.verified`, `session.recorded`, `session.participant-added/removed`, `session.readiness-evaluated`, `session.state-changed`, `obligation.created/updated/voided`, `netting.calculated/failed`, `authorization.approved/rejected/invalidated`, `settlement.batch-prepared/approved/rejected/invalidated`, `settlement.execution-started`, `settlement.attempt-started`, `signer-set.recorded` (also `session.chain-read`, `session.confirmed`, `settlement.execution-state`, `settlement.attempt-state` from server-side code with no HTTP route). `auth_audit.kind` (user scoped, immutable): `user.created`, `session.created` (wallet sign-in only), `wallet.linked`, `wallet.revoked`, `session.revoked-all`, `profile.updated`. **Not audited**: password register, login, logout, workspace switch, failed logins (rate-limit rows in `rate_events` only). Verified (`auth/service.ts` calls to `#audit`: lines 253, 256, 283, 302, 321, 333).

## 4. Detailed mapping of the 51 called operations

Columns: **UI** = user action and component. **Request -> response** = shape. **Authz and validation** = server rules. **DB** = tables read (R) and written (W), beyond the authorization reads (`memberships`, `organizations`) that every registry operation performs. **Audit and effects**. **Errors and idempotency**. **Status** (section 6 definitions).

### 4.1 Authentication and account (A)

| Id | UI | Request -> response | Authn / authz / validation | DB | Audit and effects | Errors and idempotency | Status |
|---|---|---|---|---|---|---|---|
| A01 | Every page load (`proxy.ts`), `AppGate`, wallet and account menus | none -> `{user:{id,email?,displayName,authMethod}, wallets:[{id,publicKey,network,verifiedAt}], onboarding:{profileDone,step}, organizations:[{id,name,role}], lastOrgId}` (`auth/http.ts:35-41`) | cookie; 401 otherwise; `email` only for password accounts | R `auth_sessions`, `users`, `user_wallets`, `onboarding`, `memberships`, `organizations`; W `auth_sessions.last_seen_at` for wallet sessions (throttled 60 s, `auth/service.ts:160`) | none | 401 `UNAUTHENTICATED`; idempotent. Note: lists only **active** memberships | Fully implemented |
| A02 | Settings > Account activity | none -> `{events:[{at,kind,subject,detail}]}` | cookie; own events only | R `auth_audit` | none | 401; idempotent. No pagination (the app shows the newest 15 of all). Misses password login and registration events (section 3.1) | Partially implemented |
| A03 | Sign-in > Create account | `{email,password,displayName}` -> 201 `{user:{id,email,displayName}}` + cookie | public. Email 3 to 254 and regex, not `.invalid`; name 1 to 80 printable, no `<>`; **password 12 to 128**, not equal to the email (`service.ts:91-99` of `auth/service.ts`) | W `users` (scrypt hash), then login writes `auth_sessions` | none | 400 `INVALID`; 409 `REGISTRATION_FAILED` (duplicate email; generic); not idempotent. No email verification | Fully implemented |
| A04 | Sign-in > Log in | `{email,password}` -> 200 `{user:{id,email,displayName}}` + cookie | public. 5 failures per email per 15 min then 429 (`LOGIN_MAX_FAILURES`); constant-time dummy hash | R `users`, `rate_events`; W `auth_sessions`, `rate_events` (failures; cleared on success) | none; the previous cookie is not revoked (`newSession(...undefined)`, `auth/service.ts:124`) | 401 `INVALID_CREDENTIALS`, 429 `RATE_LIMITED`; creates a new session each call | Fully implemented |
| A05 | Account menu > Sign out | none -> `{ok:true}`, clears cookie | needs the header; no session check | W `auth_sessions.revoked_at` | none | idempotent | Fully implemented |
| A06 | Settings > Sign out everywhere | none -> `{ok,revoked:n}`, clears cookie | cookie | W `auth_sessions` (all of the user), `auth_audit` | `session.revoked-all` | idempotent | Fully implemented |
| A07 | Connect wallet dialog, step 2 | `{publicKey,network:"testnet"}` -> 201 `{challenge:{id,message,expiresAt,network,publicKey}, note}` | public. Valid Stellar G-address; network `testnet`; domain = request Host (the console host, since the proxy forwards); limits 10 per key and 300 global per 10 min (`service.ts:41-42`); TTL 5 min | W `auth_challenges`, `rate_events`; deletes challenges expired more than 1 day ago | none | 400, 429; each call is a new challenge | Fully implemented |
| A08 | Connect wallet dialog, step 3 | `{challengeId,signature,scheme:"sep-53"}` -> `{user:{id,displayName,authMethod:"wallet"}, isNew, onboarding, organizations, lastOrgId}` + cookie | public. One guarded consume; failures counted; challenge burned after 5; SEP-53 signature verified; **creates a new user and wallet if the key is unknown**; the current cookie (if any) is revoked and replaced | R `auth_challenges`, `user_wallets`, `users`; W `auth_challenges`, `users`, `user_wallets`, `onboarding`, `auth_sessions`, `auth_audit` | `user.created` (new), `session.created` | 401 `AUTH_FAILED` (generic), 429; single-use | Fully implemented (see F12 for the signed-in misuse) |
| A11 | Disconnect wallet dialog | `{walletId}` -> `{ok:true}` | cookie; own active wallet only; a wallet-only user cannot remove the last wallet (409 `LAST_METHOD`) | R/W `user_wallets` (status `revoked`, never deleted), `auth_sessions` (sessions created with that wallet revoked) | `wallet.revoked` | 404 `NOT_FOUND` if repeated | Fully implemented |
| A12 | Onboarding name; Settings display name | `{displayName}` -> `{displayName}` | cookie; 1 to 80 printable | W `users`, `onboarding` (profile_done=1) | `profile.updated` | idempotent in effect (writes an audit row each time) | Fully implemented |
| A13 | Org selector; Settings default org; end of onboarding | `{orgId}` -> `{ok:true}` | cookie; user must have an **active** membership in it (else 404) | R `memberships`; W `onboarding.last_org_id` | none | idempotent | Fully implemented |

### 4.2 Organization (R01, R04 to R10, R13, R17 to R22)

All organization-level reads need an active membership; writes noted below. `U` = authz reads only.

| Id | UI | Request -> response | Authz and validation | DB (beyond authz) | Audit and effects | Errors and idempotency | Status |
|---|---|---|---|---|---|---|---|
| R01 | Onboarding > Join; | `{token}` -> `{membership:{orgId,role}}` | any signed-in user; token 16 to 128 chars; SHA-256 lookup; pending and unexpired (7-day TTL); not already an active member; bound invitations: email must equal the account's verified email, a Stellar address must be one of the user's verified wallets, otherwise open to the holder; 10 failures per 15 min per user | R/W `invitations` (status `accepted`), W `memberships`, R `rate_events` | `invitation.accepted` | 400 `INVALID_INVITATION` (identical for every failure), 429; single-use | Fully implemented |
| R04 | Onboarding > Create organization | `{name,description,visibility,institutionType,jurisdiction?}` -> 201 `{organization}` | any signed-in user; name 2 to 80; description <= 500; type in the fixed list; jurisdiction `^[A-Z]{2}$`; duplicate name among the caller's own organizations refused | W `organizations`, `memberships` (caller becomes admin) | `organization.created` | 400, 409 `EXISTS`; not idempotent | Fully implemented |
| R05 | Organization > Overview, org selector label, Institutions | -> `{organization, role}` | member | R `organizations`, `memberships` | none | 404 for non-members | Fully implemented |
| R06 | Organization > Edit profile | `{name,description,visibility}` -> `{organization}` | admin; same text rules; any visibility value other than `public` becomes `private` | W `organizations` | `organization.updated` | 403, 404; repeat writes another activity row | Fully implemented |
| R07 | `AppGate`, members tab, create-session, add participant | -> `{members:[{userId,role,reviewer,since,status,name,email?,wallet?,you}]}` | member; `email` and `wallet` returned to admins only | R `memberships`, `org_reviewers`, `users`, `user_wallets` | none | no pagination | Fully implemented |
| R08 | Members > Change role | `{role: admin\|member}` -> `{ok}` | admin; target must be a member; demoting the only active admin gives 409 `LAST_ADMIN`; no no-op check | W `memberships` | `member.role` | 400, 403, 404, 409 | Fully implemented |
| R09 | Members > Remove member | -> `{ok}` | admin; refused if the member is the last admin, or a participant with active obligations, or a participant of a session no longer configuring; otherwise marks participant rows removed and invalidates approvals and batches | W `memberships` (hard delete), `session_participants`, `authorization_invalidations`, `settlement_batch_invalidations` | `session.participant-removed`, `authorization.invalidated`, `settlement.batch-invalidated`, `member.removed` | 404, 409 `LAST_ADMIN`/`INVALID_STATE`. `org_reviewers` is not deleted (Verified `service.ts:119-134`): a re-added member would still hold the reviewer grant (Inference) | Fully implemented |
| R10 | Members > Suspend / Restore | `{status: active\|suspended}` -> `{ok}` | admin; not yourself; not the last active admin; same status is a silent no-op | W `memberships.status` | `member.suspended` / `member.restored` | 409 `INVALID_STATE`/`LAST_ADMIN`; idempotent | Fully implemented |
| R13 | Wallets tab, verified accounts | -> `{verifications:[{userId,name,network,publicKey,verifiedAt}], note}` | member | R `wallet_verifications`, `users` | none | no pagination | Fully implemented |
| R17 | Members > Grant reviewer | -> `{ok}` | admin; target must be a member | W `org_reviewers` | `reviewer.granted` | idempotent: existing grant returns without a new row or activity | Fully implemented |
| R18 | Members > Revoke reviewer | -> `{ok}` | admin | W `org_reviewers` (delete) | `reviewer.revoked` | 404 if not a reviewer | Fully implemented |
| R19 | Overview (admin), invitations table | -> `{invitations:[{id,orgId,invitee,role,status,expiresAt,createdBy}]}` | **admin only** (`service.ts:198-201`) | R `invitations` | none | `tokenHash` removed; no pagination | Fully implemented |
| R20 | Invite someone | `{invitee,role}` -> 201 `{invitation, token, delivery:{sent:false}}` | admin; invitee 3 to 120 printable; a string shaped like a Stellar address must be valid; role admin or member; token 24 random bytes shown once, hash stored; 7-day expiry; no duplicate check | W `invitations` | `invitation.created`. **No email is sent**: no delivery provider exists | 400, 403; not idempotent | Fully implemented (delivery Missing, F20) |
| R21 | Invitations > Revoke | -> `{ok}` | admin; pending only | W `invitations.status` | `invitation.revoked` | 404, 409 `INVALID_STATE` | Fully implemented |
| R22 | Wallets tab, claims | -> `{wallets:[{orgId,address,proof}], note}` | member | R `org_wallets` | none | claims are unproven (`proof: none`) | Fully implemented |

### 4.3 Sessions, participants, obligations, calculation (R24 to R31, R34, R48 to R53)

| Id | UI | Request -> response | Authz and validation | DB | Audit and effects | Errors and idempotency | Status |
|---|---|---|---|---|---|---|---|
| R24 | Sessions list; cross-session hook; command palette cache | -> `{rows:[{sessionId,shortId,label,status,participants,createdAt,provenance,provenanceLabel,tone,activityCount,lastActivity}]}` newest first | member | R `sessions`, `activity` (whole organization log) | none | `status` is the provenance text ("Draft (not on-chain)") and `participants` is `"not read"`: **no workflow state, no counts, no filters, no paging** (`session-view.ts:44-57`) | Partially implemented |
| R25 | Create session wizard | `{label}` -> 201 `{session:{sessionId,orgId,label,provenance:"local-draft",createdAt,workflow}, notice}` | admin; label 1 to 80; id generated server side (64 hex, 32 random bytes); client-supplied id or provenance ignored | W `sessions` | `session.recorded` | 400, 403; **not idempotent** (a retry creates another session) | Fully implemented |
| R26 | Workspace load, sessions list state, cross-session hook | -> `{workspace:{banner,overview,participants,obligations,netPositions,activity:{items,empty}}, workflow}` | member; id must belong to the organization | R `sessions`, `session_participants`, `activity`, `users` | none | The app uses only `workflow`, `overview` and `activity`. For a non-fixture session the `participants`, `obligations` and `netPositions` sections are fixed "not available yet" placeholders (`session-view.ts:107-128`). The whole organization log is loaded per call; activity is unpaginated. 404 | Partially implemented |
| R27 | Participants tab, workspace | -> `{participants:[{userId,name,organization,orgId,status,addedAt,removedAt?,walletClaim?,walletProof?}], note}` | member | R `session_participants`, `users` | none | includes removed rows | Fully implemented |
| R28 | Add participant; wizard | `{userId, walletAddress?}` (app sends `userId` only) -> 201 `{participants, note}` | admin; session `configuring`; target must be an active member; not already active (409 `EXISTS`); a wallet must be an organization claim | W `session_participants`, `authorization_invalidations`, `settlement_batch_invalidations` | `session.participant-added`; `authorization.invalidated` / `settlement.batch-invalidated` for live decisions | 400, 403, 404, 409; second call `EXISTS` | Fully implemented |
| R29 | Participants > Remove | -> 200 `{participants}` | admin; configuring; refused while active obligations name the participant | W `session_participants` (status `removed`), invalidations | `session.participant-removed` + invalidations | 404 `NOT_FOUND` if not active; 409 | Fully implemented |
| R30 | Obligations tab, workspace, cross-session hook | -> `{obligations:[{id,debtor,debtorName,creditor,creditorName,amount,asset,assetRef,assetIdentity,reference,status,revision,createdAt,createdBy,updatedAt,updatedBy}]}` | member; not for fixtures | R `obligations`, `users` | none | includes voided; no pagination | Fully implemented |
| R31 | Record obligation form | `{debtor,creditor,amount,asset\|assetRef,reference?}` -> 201 `{obligationId, obligations}` | admin; configuring; debtor and creditor active participants and different; amount `^[1-9][0-9]{0,38}$` and <= 2^127-1; if any supported asset is configured an `assetRef` is required, else an upper-case code `^[A-Z0-9]{1,12}$` is stored as `legacy-unresolved`; one asset (and one identity) per session; reference <= 200 printable | W `obligations`, invalidations | `obligation.created` + invalidations | 400 with field-specific messages (the app maps them to fields by text), 403, 409; not idempotent | Fully implemented |
| R34 | Obligation sheet > Void | `{reason?}` (<= 200) -> `{obligations}` | admin; configuring; must be active | W `obligations` (status `voided`, revision+1), invalidations | `obligation.voided` + invalidations | 409 if already voided | Fully implemented |
| R48 | Run netting | none -> 201 `{currency,asset,calculation:{id,asset,createdAt,createdBy,gross,inputHash,obligationCount,positions[]}, note}` | admin; configuring; at least one active obligation; one asset; net positions must sum to zero; separation-of-duties input (the caller becomes the calculator) | W `calculations` (immutable snapshot with input hash), invalidations | `netting.calculated`; `netting.failed` (separate transaction) on refusal; supersedes earlier decisions | 400/409; **every call creates a new calculation** (not idempotent) | Fully implemented |
| R49 | Netting tab, review, settlement | -> same shape as R48 (`currency` = current, stale or none) | member | R `calculations`, `session_participants`, `obligations` | none | the app does not display `inputHash` | Fully implemented |
| R50 | Overview tab, lifecycle, workflow actions | -> `{state,ready,checks:[{key,label,ok,fix}],currency,note}` | member | R `session_participants`, `obligations`, `calculations` | none | nine checks (`clearing.ts:92-101`) | Fully implemented |
| R51 | Mark ready | none -> readiness | admin; `configuring` -> `ready` only when every check except `state` passes. Approval is not required | W `sessions.workflow` | `session.readiness-evaluated` (pass or fail), `session.state-changed` | 409 `INVALID_STATE` listing failed checks | Fully implemented |
| R52 | Reopen | none -> readiness | admin; `ready` -> `configuring` only (`closed` is terminal, `clearing.ts:107`) | W `sessions.workflow` | `session.state-changed` | 409; approvals are invalidated by the first later edit, not by reopening | Fully implemented |
| R53 | Close | none -> readiness | admin; session must be `ready` **and** the current calculation must have an approved, still-eligible settlement batch | R `calculations`, batches; W `sessions.workflow` | `session.state-changed` | 409. Operational closure only; "does not mean settlement happened" | Fully implemented |

### 4.4 Review and settlement preparation (R35 to R37, R39 to R42, R45 to R47)

| Id | UI | Request -> response | Authz and validation | DB | Audit and effects | Errors and idempotency | Status |
|---|---|---|---|---|---|---|---|
| R45 | Session state, review step, cross-session hook | -> `{state,sessionState,currency,calculationId,eligibility:{canDecide,isReviewer,reasons[]},decisions[],note}` | member | R `calculations`, `authorization_decisions`, `authorization_invalidations`, `org_reviewers`, `obligations`, `activity` | none | `eligibility.reasons` carries separation-of-duties text computed for the caller | Fully implemented |
| R46 | Approve calculation | `{calculationId}` -> 201 view | **reviewer grant** (member required; admin alone is not enough); session not closed; the named calculation must be the latest and current; one decision per calculation (UNIQUE); the caller must not have run the calculation or created, edited or voided any obligation in it (`authorization.ts conflictedActors`) | W `authorization_decisions` (immutable) | `authorization.approved` | 403 `FORBIDDEN`/`SEPARATION_OF_DUTIES`, 404, 409 `STALE`/`EXISTS`/`INVALID_STATE`; second call `EXISTS` | Fully implemented |
| R47 | Reject calculation | `{calculationId, reason}` | as R46; reason 1 to 500 printable | same | `authorization.rejected` | same | Fully implemented |
| R35 | Settlement step, Overview/Reviews cross-session reads, record form (supported assets) | -> `{preview:{checks[],ready,calculationId}, note, assets:[{id,code,status}], batches[]}` | member | R `supported_assets`, `settlement_batches`, `settlement_batch_reviews`, `settlement_batch_invalidations`, `calculations`, `authorization_decisions`, `obligations` | none | The assets list is operator configured and not changeable through the API; the app filters to `supported`. Used as a read for three different purposes; the whole preview is recomputed per call | Partially implemented |
| R36 | Prepare settlement | `{calculationId, attempt?}` -> 201 `{batchId, ...list}` | admin; named calculation must be the latest; preconditions (not closed, approved and current, participants valid, obligations unchanged, exact recomputation, canonical supported asset, no live batch); `attempt` must equal the next attempt number when earlier batches exist | W `settlement_batches`, `settlement_instructions` (immutable, one transaction) | `settlement.batch-prepared` | 400, 403, 404, 409 `STALE`/`EXISTS`/`INVALID_STATE` | Fully implemented |
| R37 | Settlement steps, review panel | -> `{batch, status, validation[], eligibility:{canDecide,reasons[]}, instructions[], review?, invalidation?, note}` | member | R batches, instructions, reviews, invalidations, calculations | none | `sourceAccount` and `destinationAccount` are always null | Fully implemented |
| R39 | Approve settlement | `{instructionsHash}` -> 201 batch view | reviewer grant; hash must equal the batch's; status `awaiting-review`; live validation must pass; the preparer cannot decide | W `settlement_batch_reviews` (immutable) | `settlement.batch-approved` | 403 `SEPARATION_OF_DUTIES`/`FORBIDDEN`, 409 `STALE`/`EXISTS`/`INVALID_STATE` | Fully implemented |
| R40 | Reject settlement | `{instructionsHash, reason}` | as R39; reason 1 to 500 | same | `settlement.batch-rejected` | same | Fully implemented |
| R41 | Execution step | -> `{network,batchStatus,participants:[{userId,name,verifiedAccount,verifiedCount}],execution:{id,state,accounts,createdAt,events[]}\|null,unavailable[],note}` | member | R executions, execution events, `wallet_verifications` | none | Can only ever show the state `awaiting-signer` (no HTTP route advances it) and `unavailable` lists six missing capabilities | Partially implemented |
| R42 | Execution step | -> `{attempts:[{attemptNo,state,network,planFingerprint,createdAt,onChainSessionId,expectedDigest,requiredSigners,steps[],transactions[],events[]}]}` | member | R attempts, events, transactions | none | Always empty unless R44 was called (the app never calls it) | Partially implemented |

## 5. Operations that exist but the app never calls (16, reachable through the proxy)

| Id | What it does | Authz | Why it matters for the UI | Status |
|---|---|---|---|---|
| A09 | issue a wallet-link challenge for the signed-in user | cookie | needed for "Link a wallet" (F12); 5 wallets per user max | Fully implemented (unused) |
| A10 | verify the link and insert `user_wallets` | cookie | same | Fully implemented (unused) |
| A14 | rotate the session cookie, keeping the original creation time | cookie | the app never renews; wallet sessions end at the 2 h idle limit or 24 h cap; password sessions at 8 h; the app then redirects to `/sign-in?expired=1` | Fully implemented (unused) |
| R02 | operator-configured supported assets | member of any organization (no org in the path; any signed-in user) | duplicate of the list inside R35 | Fully implemented (unused) |
| R03 | organizations of the caller | any signed-in user | duplicate of A01 | Fully implemented (unused) |
| R11 | issue an **organization-scoped** wallet ownership challenge | member | the verification record that settlement execution requires (`#accountsFor`) | Fully implemented (unused) |
| R12 | verify it (SEP-53 or raw) | member | same | Fully implemented (unused) |
| R14 | read the signer set of a Stellar account from Horizon and the RPC and record a snapshot | admin; network read happens after the authorization check | testnet network call (503 `CHAIN_UNAVAILABLE`) | Fully implemented (unused) |
| R15 | signer-set history | member | read-only | Fully implemented (unused) |
| R16 | reviewers list | member | duplicate of the flag in R07 | Fully implemented (unused) |
| R23 | record an unproven organization wallet claim | admin | needed to give participants a `walletAddress` (R28) | Fully implemented (unused) |
| R32 | one obligation | member | duplicate of R30 | Fully implemented (unused) |
| R33 | edit an obligation (revision+1, invalidates approvals) | admin, configuring | the UI states "no edit"; the correction path is void and re-record | Fully implemented (unused) |
| R38 | live validation of a batch | member | the same data is inside R37 | Fully implemented (unused) |
| R43 | start a settlement execution: records preconditions (every payer and payee has exactly one VERIFIED organization wallet on the batch network) | admin; batch approved; not already started | the first step toward signing; the app never calls it, and cannot satisfy its precondition because it never calls R11/R12 | Fully implemented (unused) |
| R44 | begin an execution attempt, rebuilding the plan on the server from the approved data | admin; needs `TOBIN_STELLAR_CLEARING_CONTRACT`; retry policy | requires an execution (R43) | Fully implemented (unused) |

Not reachable at all from the app (15): O01 (co-sign preparation and verification), O02 (owner-run settlement tool), O03 (Freighter validation material) are restricted to signers of the configured administrative account (`stellar/owner-access.ts:13-15`); O04/O05 drive the local sandbox console with the Rust bridge; O06 reports migration status; W01 to W09 are the mock `w0` API. There is **no HTTP route** for advancing an execution or attempt state, noting an attempt, recording a signature, a submission or a confirmation: `advanceSettlementExecution`, `advanceExecutionAttempt` and `noteExecutionAttempt` are called only from server code (`service.ts:827,889`; owner tools).

## 6. Status definitions

- **Fully implemented**: the backend operation exists, enforces the rules the UI relies on, and no client-side workaround is needed.
- **Partially implemented**: the operation works but lacks something the UI needs (paging, a field, an audit record) or returns placeholders; the UI works around it or omits the feature.
- **Mocked or simulated**: the UI shows data that is not produced by the backend (sample mode, fixtures).
- **Frontend-only**: computed or held in the browser; no backend operation is involved or the backend contribution is only raw reads.
- **Missing**: no backend capability reachable by the app (a capability may exist but be unreachable or unused; the note says which).
- **Requires redesign**: the current approach is structurally wrong or fragile for production use, independent of whether it appears to work.

## 7. Feature-level classification (every UI feature, with its operations)

Evidence is in the operation rows above and the inventory. "Derived" means computed in the browser from other reads.

| Id | Feature | Operations | Status | Notes |
|---|---|---|---|---|
| F01 | Email registration and sign-in | A03, A04 | Fully implemented | password rule mismatch is a UI defect (inventory 12) |
| F02 | Wallet sign-in with Freighter | A07, A08 | Fully implemented | server path tested in the console; the app's Freighter calls are not exercised against the real extension in this repository (`lib/wallet/freighter.ts` header) |
| F03 | Onboarding: name | A12 | Fully implemented | |
| F04 | Onboarding: create organization | R04, A13 | Fully implemented | |
| F05 | Onboarding: join by code | R01, A13 | Fully implemented | |
| F06 | Switch or default organization | A13, A01 | Fully implemented | |
| F07 | Sign out | A05 | Fully implemented | |
| F08 | Sign out everywhere | A06 | Fully implemented | |
| F09 | Account activity | A02 | Partially implemented | logins, registrations, logouts not recorded; unpaginated |
| F10 | Change password | none | Missing | no route in `auth/http.ts` |
| F11 | List and revoke individual sessions | none | Missing | `auth_sessions` rows exist; no route lists them |
| F12 | Link another wallet to the signed-in account | A09, A10 (unused) | Requires redesign | the Wallets tab button runs sign-in (A07/A08), which can create a new account and swap the session |
| F13 | Disconnect (revoke) a wallet | A11 | Fully implemented | |
| F14 | Organization wallet ownership verification | R11, R12, R23 (unused) | Missing | backend exists; no client method or screen; execution preconditions need it |
| F15 | Organization verified accounts and claims (read) | R13, R22 | Fully implemented | |
| F16 | Edit organization profile | R06 | Fully implemented | |
| F17 | Members: role, suspend, remove | R07 to R10 | Fully implemented | |
| F18 | Reviewer grant and revoke | R17, R18 | Fully implemented | |
| F19 | Invitations: create, list, revoke | R19 to R21 | Fully implemented | |
| F20 | Invitation delivery by email | none | Missing | no provider (`registry/http.ts:139`) |
| F21 | Create session wizard | R25, R28 | Partially implemented | two-step, non-atomic; compensation lives in `wizard.ts` |
| F22 | Sessions list search, sort, filter, paging | R24 | Frontend-only | all in the browser (`lib/sessions/list.ts`) |
| F23 | Sessions list workflow state column and status filter | R26 per row | Frontend-only | N+1 reads of the visible page; filter applies to that page only |
| F24 | Session workspace load | R26, R27, R30, R50, R45, R35, R37, R41, R42, R49 | Partially implemented | up to 11 separate requests; no single session view |
| F25 | Participants add and remove | R28, R29 | Fully implemented | |
| F26 | Record obligation | R31, R35 | Fully implemented | |
| F27 | Void obligation | R34 | Fully implemented | |
| F28 | Edit obligation | R33 (unused) | Missing | backend exists, the UI deliberately omits it |
| F29 | Obligation history | R26 (activity text) | Requires redesign | matched on the first 8 id characters inside free text; unavailable on a prefix clash |
| F30 | Readiness checks | R50 | Fully implemented | |
| F31 | Run netting and view results | R48, R49 | Fully implemented | |
| F32 | Approve or reject a calculation | R45, R46, R47 | Fully implemented | |
| F33 | Mark ready, reopen, close | R51, R52, R53 | Fully implemented | |
| F34 | Prepare settlement | R35, R36 | Fully implemented | |
| F35 | Review a settlement batch | R37, R39, R40 | Fully implemented | |
| F36 | Browser-side reconciliation diff | none | Frontend-only | re-checks the server's invariants from the data shown (`lib/settlement/diff.ts`) |
| F37 | Execution record (read-only) | R41, R42 | Partially implemented | can show only `awaiting-signer`; no route advances states |
| F38 | Start execution or begin an attempt from the UI | R43, R44 (unused) | Missing | backend exists; UI says none exists |
| F39 | Sign, submit, verify, reconcile | none via the app | Missing | only owner tools O01 to O03, unreachable |
| F40 | Overview | R24, R26, R45, R35, R07, R19 | Frontend-only | derived from the newest 10 sessions (then more on request) |
| F41 | Reviews queue and sidebar count | R24, R45, R35 | Frontend-only | derived; batch "mine" test uses display names |
| F42 | Obligations across sessions | R24, R30, R26 | Frontend-only | derived and capped |
| F43 | Activity across sessions | R24, R26 | Frontend-only | derived; excludes member, invitation, reviewer, org events |
| F44 | Session activity tab | R26 | Partially implemented | unpaginated; loads the whole org log server side |
| F45 | Command palette | none | Frontend-only | searches the browser cache of the sessions list (cap 300) |
| F46 | Notifications | none | Missing | no model, no route |
| F47 | Global search | none | Missing | `NOT_SUPPORTED.search` |
| F48 | Discover explorer | none | Missing | stub client; every registry route needs a session |
| F49 | Institution directory and counterparties | none | Missing | |
| F50 | Sample-data mode | none (MockAdapter) | Mocked or simulated | opt-in flag, labelled, disables access control |
| F51 | Environment popover, help and external links, role help text | none | Frontend-only | hard-coded text and URLs |
| F52 | Wallet popover (connected vs verified) | A01 + browser Freighter | Frontend-only | "connected" is a browser fact |
| F53 | Dev component gallery | none | Mocked or simulated | fictional values and fixtures; production-disabled |
| F54 | Server-side pagination, filtering, sorting for any list | none | Missing | no endpoint reads query parameters |
| F55 | Leave an organization (self-service) | none | Missing | removal (R09) is admin only |

**Counts by classification (55 features, tallied from the Status column of this table):** Fully implemented 23, Partially implemented 5, Mocked or simulated 2, Frontend-only 10, Missing 13, Requires redesign 2 (sum 55).


## 8. Features that depend on derived data, fixtures, local state, hard-coded values or incomplete backend support

| Feature | Dependency kind | Detail |
|---|---|---|
| Overview, Reviews, Obligations, Activity, sidebar badge (F40 to F43) | Derived | Built by `useCrossSession` from per-session reads of the newest 10 (then 20, ...) sessions; a coverage sentence is shown; sessions that fail are excluded |
| Sessions list state and status filter (F23) | Derived, N+1 | One R26 per visible row; filter limited to the page |
| Sessions list search, sort, pagination (F22) | Local state | Over the full list returned by R24 |
| Reviews "mine" test for batches (F41) | Derived with a weak key | display-name comparison instead of user ids |
| Obligation history (F29) | Derived from free text | 8-character prefix match; unavailable on clash |
| Result column in Activity (F43) | Derived | from the event kind string |
| Invitation "Expired" | Derived | from `expiresAt` |
| Next action and lifecycle stepper | Derived | `lib/sessions/lifecycle.ts`, `next-action.ts` |
| Browser reconciliation diff (F36) | Derived | duplicates a server check |
| Sample mode (F50) | Fixture | `mock-adapter.ts` |
| Discover (F48) | Stub, empty | `lib/discover/client.ts` |
| Dev gallery (F53) | Fixture | `lib/fixtures/failed-states.ts` |
| Wallet picker "last used" | `localStorage` | key `tobin.lastWallet` |
| Mobile action sheet state | `sessionStorage` | key `tobin-sheet` |
| Testnet-only network, passphrase, scheme, institution types, page sizes, limits, external URLs | Hard-coded | inventory section 11 |
| Execution record (F37), Sign/Submit/Verify (F39), Start execution (F38) | Incomplete backend support | R43/R44 exist; no state-advancing route; owner tools unreachable |
| Create session wizard (F21) | Incomplete backend support | no atomic create-with-participants operation |
| Wallets tab Connect button (F12) | Incorrect backend call | sign-in instead of link |

## 9. Missing backend operations the redesigned UI needs or would need

Each was checked against `registry/http.ts`, `auth/http.ts` and the `app/api` tree. "Evidence" cites why it is absent. Shapes are **Recommendation** only and not designs.

| # | Missing operation | Why the UI needs it | Evidence of absence | Recommendation |
|---|---|---|---|---|
| M01 | Organization summary (counts of sessions by workflow, awaiting-review items, stale items, pending invitations) | Overview currently issues about 3 reads per session | no such route; the UI says so (`useCrossSession.tsx:1-5`) | `GET :org/summary` computed in SQL |
| M02 | Review queue across sessions (calculations and batches awaiting a reviewer, with the caller's eligibility) | Reviews page and sidebar badge | none | `GET :org/reviews?mine=1` |
| M03 | Organization-wide obligation list with filters and paging | global Obligations | none | `GET :org/obligations?asset=&status=&session=&cursor=` |
| M04 | Organization-wide activity feed including member, invitation, reviewer, wallet and organization events, with filters (kind, date, session, actor) and paging | Activity page; today those events are written but never served | `activity` is read only inside R26 (`http.ts:158`) | `GET :org/activity?cursor=&kind=&from=&to=` |
| M05 | Session list with workflow state, participant count, active obligation count, last activity, plus search, status filter, sort and paging | Sessions list does N+1 reads and filters in the browser | `session-view.ts:44-57` returns no state; no query parameters read | extend R24 |
| M06 | Single session summary read (replacing about 11 requests and the whole-log scan in R26) | workspace load | R26 loads all organization activity per call | `GET :org:s/summary` |
| M07 | Pagination for members, invitations, obligations, session activity, audit events | scale | no `searchParams` use anywhere | cursor parameters |
| M08 | Per-entity event history (obligation, decision, batch) with full ids | Obligation history uses an 8-character prefix of free text | `service.ts` logs `this.#short(o.id)` only | `GET :org:s/obligations/:o/events` |
| M09 | Link a wallet from the signed-in app | Wallets tab | backend has A09/A10; the app client has no method (`client.ts:13-27`) | add client methods and a link flow; this is an app change plus a UI decision |
| M10 | Organization wallet ownership verification in the app | execution preconditions | R11/R12/R23 exist, unused | add client methods and screens |
| M11 | Execution and attempt flow in the app: start (R43), begin attempt (R44), and routes that advance state, record a signature, submit and read back a transaction | the Execution and Sign steps | no route calls `advanceSettlementExecution` / `advanceExecutionAttempt` / `noteExecutionAttempt`; owner tools O01 to O03 are restricted and unreachable | new owner decision needed (AGENTS.md: signing authority and Testnet actions are restricted) |
| M12 | Notifications (model, unread count, mark read) | bell and page | no table or route | new tables and routes |
| M13 | Institution directory, counterparty records, public opt-in profile | Institutions tab, Discover | no table; Discover needs unauthenticated reads but every registry route needs a session (`http.ts:49-50`) | new public read API |
| M14 | Public explorer API (statistics, settlements, institutions, assets, `verifiedReadBack`) | Discover | none; a contract is described in `docs/web-redesign/discover-contract.md` (not read for this audit) | new |
| M15 | Change password / reset / email verification / recovery | Settings > Password | no route; recovery is documented as deferred (AGENTS.md section 13) | new |
| M16 | List and revoke individual sessions (devices) | Settings > Sessions | `auth_sessions` has the data; no route | `GET /auth/sessions`, `POST /auth/sessions/:id/revoke` |
| M17 | Email (or other) invitation delivery | Invitations | `registry/http.ts:139`: "No delivery provider is configured" | provider integration |
| M18 | Atomic create-session-with-participants | wizard partial failures | R25 + N x R28 | extend R25 with `participants[]` |
| M19 | Idempotency keys on creates (session, obligation, invitation, calculation) | retries after a network error create duplicates | none of these check a client key | `Idempotency-Key` header |
| M20 | Leave organization (self) | members cannot leave | `removeMember` requires admin (`service.ts:120`) | new |
| M21 | Account/organization deletion or type and jurisdiction change | UI states they cannot change | `updateProfile` accepts name, description, visibility only (`service.ts:94-103`) | owner decision |
| M22 | Invitation preview or accept-by-link | join flow requires pasting a code | only `POST invitations/accept` | optional |
| M23 | Search (global) | command panel searches loaded sessions only | none | optional |
| M24 | Audit of password login, registration, logout, workspace switch | Account activity is incomplete | `#audit` call sites (section 3.1) | add events |

Also noted (not UI needs): `removeMember` leaves the `org_reviewers` row (Inference of a stale grant on re-add); invitations are not de-duplicated per invitee; login does not revoke an earlier session cookie.

## 10. Backend endpoints that exist but the redesigned app never calls

Reachable through the proxy but unused (16): A09, A10, A14, R02, R03, R11, R12, R14, R15, R16, R23, R32, R33, R38, R43, R44 (rows in section 5).

Unreachable from the app (15): O01, O02, O03, O04, O05, O06, W01 to W09.

## 11. Summary tables

### 11.1 Operations the app calls (51) by status

| Status | Count | Ids |
|---|---|---|
| Fully implemented | 45 | A01, A03 to A08, A11 to A13, R01, R04 to R10, R13, R17 to R22, R25, R27 to R31, R34, R36, R37, R39, R40, R45 to R53 |
| Partially implemented | 6 | A02, R24, R26, R35, R41, R42 |
| Mocked or simulated | 0 | none (sample mode replaces the whole client, not single operations) |
| Frontend-only | 0 | not applicable to backend operations |
| Missing | 0 | not applicable |
| Requires redesign | 0 | the structural issues are at feature level (F12, F29) and in the read model (M05, M06) |

### 11.2 All 82 operations by usage

| Group | Count |
|---|---|
| Called by the app | 51 |
| Reachable, not called | 16 |
| Not reachable (proxy refuses) | 15 |
| **Total** | **82** |

### 11.3 Features (55) by status

Tallied from section 7.

| Status | Count | Feature ids |
|---|---|---|
| Fully implemented | 23 | F01 to F08, F13, F15 to F19, F25 to F27, F30 to F35 |
| Partially implemented | 5 | F09, F21, F24, F37, F44 |
| Mocked or simulated | 2 | F50, F53 |
| Frontend-only | 10 | F22, F23, F36, F40 to F43, F45, F51, F52 |
| Missing | 13 | F10, F11, F14, F20, F28, F38, F39, F46 to F49, F54, F55 |
| Requires redesign | 2 | F12, F29 |

## 12. Limitations of this audit

- Read-only: no server was started, no database opened, no test run. Behavioural statements are from reading code; items marked Inference were not executed.
- Table names are those of `lib/db/database.ts` and the SQLite store; the exact columns written by each store method were not each re-read (`sqlite-store.ts`).
- The redesign documents under `docs/web-redesign/` (including `discover-contract.md`) were not read or used as evidence; all statements come from code.
- Line numbers refer to the working tree at the time of reading.
