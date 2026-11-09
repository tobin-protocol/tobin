# Authentication and authorization: the identity model as implemented

Status: read-only review of the current `main`. Stellar Testnet only. Nothing was run. Statements are labelled **Verified** (code read), **Recommendation**, **Inference**, **Unknown** or **Owner decision**. Paths are relative to the repository root; `console` is `apps/web-console`, `web` is `apps/web`.

This is a same-author desk review. No penetration test and no independent security review has been performed. Companion documents: `existing-backend-assessment.md`, `security-assessment.md`.

## 1. The seven concepts and where each lives

The repository's trust-boundary rule (AGENTS.md section 6) says a wallet connection is not Tobin authentication, which is not membership, which is not a role, which is not reviewer authority, which is not Stellar signing authority. This table shows where each is represented and what creates it.

| # | Concept | Representation | Created by | Checked at |
|---|---|---|---|---|
| 1 | **Connected wallet** | browser state only (`web/lib/wallet/freighter.ts`, Freighter extension). The server never learns of a "connection". | the user's browser | nowhere on the server |
| 2 | **Authenticated Tobin user** | `users` row + `auth_sessions` row (cookie `tobin_session`). Wallet proof of control is recorded in `user_wallets` (status `active`/`revoked`). | `AuthService.register`/`login`/`verifySignIn` | `AuthService.resolve` on every request (`console/lib/auth/service.ts:146-165`) |
| 3 | **Institutional membership** | `memberships (org_id, user_id, role, since, status)` | `createOrganization` (creator) or `acceptInvitation` | `Registry.#role` / `#need` (`console/lib/registry/service.ts:54-63`) |
| 4 | **Institutional role** | `memberships.role` in `{'admin','member'}`; status `active`/`suspended` | same as 3; changed by `setRole`, `setMemberStatus` | `#need(orgId, user, admin=true)` |
| 5 | **Reviewer authority** | `org_reviewers (org_id, user_id, granted_by, granted_at)`, a foreign key to `memberships` with `ON DELETE CASCADE` (`database.ts:180-187`) | `grantReviewer` (admin only) | `Registry.#isReviewer` (`service.ts:510`) inside `decide` and `decideSettlementBatch` |
| 6 | **Settlement initiator** | `settlement_attempts.initiator` (a `userId` key into the execution's verified-accounts map), `created_by` is the admin who began the attempt | `beginExecutionAttempt` (admin only, `service.ts:855-882`) | the initiator must be a participant with exactly one verified account (`service.ts:864`) |
| 7 | **Stellar signing authority** | on-chain: the signer set of the Stellar account / contract auth. The app stores read-only snapshots (`signer_set_snapshots`) and verified keys (`wallet_verifications`, `user_wallets`). The app holds no key. | Stellar network | by the network when a transaction is submitted; the server only **reads** and compares (`lib/stellar/signer-set.ts`, `compare.ts`) |

**Verified** for all rows. Notes:

- **Verified.** Row 5 is a separate table, not a role value. `Role` is only `'admin' | 'member'` (`console/lib/registry/http.ts:43`, `database.ts:48`). An administrator is not a reviewer unless explicitly granted, and the creator of an organization is granted nothing beyond `admin` (`service.ts:81`; AGENTS.md section 7 "an administrator is not a reviewer").
- **Verified.** Row 7: there is no code path that signs. The server verifies ed25519 signatures (`console/lib/registry/wallet-proof.ts:25-35`) and builds *unsigned* transactions (`lib/stellar/rpc.ts`). The owner-run tool submits a transaction that was signed in the browser (`lib/stellar/run.ts`); its server gate is `ownerToolsAllowed` (section 11).

## 2. Verification that wallet connection or verification grants no role or authority

**Verified**, by reading every write performed after a wallet proof:

| Wallet event | Rows written | Rows *not* touched |
|---|---|---|
| Sign-in with an unknown key (`verifySignIn`, `auth/service.ts:232-263`) | `users` (placeholder email, `auth_method='wallet'`), `user_wallets`, `onboarding`, `auth_challenges.consumed_at`, `auth_audit`, `auth_sessions` | `memberships`, `org_reviewers`, `organizations` |
| Linking another wallet (`verifyLink`, `service.ts:272-291`) | `user_wallets`, `auth_audit` | same |
| Organization ownership proof (`verifyWalletChallenge`, `registry/service.ts:771-789`) | `wallet_verifications`, `wallet_challenges.used_at`, `activity` | same |
| "Link wallet" claim (`linkWallet`, `service.ts:203-213`) | `org_wallets` with `proof='none'` | same |
| Signer-set recording (`recordSignerSet`, `service.ts:941-955`) | `signer_set_snapshots`, `activity` | same |

The messages the user signs state this in plain text ("... grants no role or permission", `auth/wallet-challenge.ts:30`; "This signs no transaction and authorizes no payment", `wallet-proof.ts:16`). Tests assert the first sign-in creates a user with no email, role or organization (`console/test/wallet-auth.test.ts:61`).

Places where a verified wallet **is consulted** for another decision (so they are the places to keep reviewing):

1. **Invitation binding.** An invitation whose `invitee` is a Stellar address can only be accepted by a user holding that wallet as `active` in `user_wallets` (`service.ts:191`). This gates *who may accept an offer an administrator made*; it does not choose the role (the role comes from the stored invitation, `service.ts:193`).
2. **Owner Stellar tools.** `ownerToolsAllowed(user)` requires an active verified wallet among the configured administrative-account keys or `TOBIN_SECOND_ACCOUNT` (`lib/stellar/owner-access.ts:12-14`). This is an access gate for tooling, not a role.
3. **Execution account mapping.** `startSettlementExecution` maps each payer/payee to exactly one organization-verified key (`service.ts:794-818`). This chooses which on-chain accounts a *plan* names; it does not make anyone a signer.

**Recommendation.** Keep these three as the only consumers of wallet data; add a test that fails if any new write to `memberships` or `org_reviewers` is reachable from the wallet functions.

## 3. Email and password flow

**Verified** (`console/lib/auth/service.ts`, `console/lib/auth/http.ts`).

| Aspect | Implementation |
|---|---|
| Endpoints | `POST /api/auth/register`, `POST /api/auth/login`; `register` creates the account then calls `login` (`auth/http.ts:90-95`) |
| Email | trimmed, lower-cased, 3 to 254 chars, regex `^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$`; `*.invalid` is reserved (`service.ts:46, 49, 378-383`). **No verification email is sent and no verification state exists.** |
| Password policy | 12 to 128 characters, must differ from the email; no composition rules, no breach list (`service.ts:97-98`) |
| Hash | **scrypt**, `N = 2^16` (cost 16), `r = 8`, `p = 1`, 16-byte random salt, 32-byte key, `maxmem` 256 MiB; stored as `scrypt$cost$8$1$salt$key` so the parameters travel with each hash (`service.ts:52-60`) |
| Verification | parameters bounded on read (cost 4 to 17, `r=8`, `p=1`), `timingSafeEqual` (`service.ts:62-70`) |
| Unknown email | a cached dummy hash is verified so timing does not reveal existence (`service.ts:117-118`) |
| Failure response | one `INVALID_CREDENTIALS` for unknown email, wrong password, disabled user (`service.ts:119-122`) |
| Rate limiting / lockout | key `login:<email>`; 5 failures within 15 minutes cause `429 RATE_LIMITED` regardless of whether the account exists; success clears the counter (`service.ts:47-48, 115, 123`). No IP key. |
| Enumeration | login: not possible. **register: possible.** An existing address returns `409 REGISTRATION_FAILED`, a new one `201`; the message is generic but the status differs (`service.ts:101-106`, `auth/http.ts:28`). Registration has no rate limit. |
| Session | created by `#newSession`, see section 5 |
| Password reset / change | **none**. There is no route. Only operator access to the database can change a hash. |
| MFA | none |
| Disabled users | `users.disabled = 1` blocks login and `resolve`; no API sets it (operator only) |

## 4. Wallet sign-in

**Verified** (`console/lib/auth/service.ts:191-263`, `console/lib/auth/wallet-challenge.ts`, `console/lib/registry/wallet-proof.ts`).

1. **Challenge issue** (`POST /api/auth/wallet/challenge`, public): validates the key is a Stellar *account* strkey (`isStellarAccount`), `network` absent or `testnet`, `domain` (from the `Host` header) non-empty, at most 100 characters, no whitespace or angle brackets; rate limits 10 per key and 300 globally per 10 minutes; deletes challenges expired more than a day ago; stores `id` (128-bit), `nonce` (128-bit), purpose, network, key, domain, `issued_at`, `expires_at` (5 minutes) in `auth_challenges`.
2. **Message**: `authChallengeMessage` builds a fixed-format text containing title, domain, purpose, network, public key (and user for link-wallet), nonce, issued, expires and a sentence saying it signs no transaction and grants no role. **It is rebuilt from the stored row at verification time** (`service.ts:224`); the client's copy is never trusted.
3. **Signature**: only scheme `sep-53` is accepted for sign-in (`service.ts:215`): ed25519 over `SHA-256("Stellar Signed Message:\n" + message)`; signature base64, exactly 64 bytes (`wallet-proof.ts:25-35`). The organization-level ownership proof additionally accepts scheme `raw` (signature over the message bytes) (`registry/service.ts:777`).
4. **Consumption and replay**: inside `BEGIN IMMEDIATE`, checks purpose, unconsumed, fewer than 5 failures, not expired, then the signature, then a single guarded `UPDATE ... SET consumed_at WHERE id = ? AND consumed_at IS NULL AND expires_at > ?` requiring exactly one changed row (`service.ts:226-227`). A concurrent second answer fails. Wrong answers increment both a per-key counter (10 in 15 minutes) and a per-challenge failure count; that bookkeeping is committed even though the call then fails (`service.ts:221, 237`).
5. **Failure shape**: every failure is `401 AUTH_FAILED` "sign-in could not be completed" (rate limit is `429`).
6. **Network**: sign-in accepts only `testnet`; `user_wallets.network` and `auth_challenges.network` have `CHECK (network IN ('testnet'))` (`database.ts:562, 581`).
7. **User resolution**: an *active* `(network, key)` in `user_wallets` resolves to its user; otherwise a new user, wallet and onboarding row are created in the same transaction, with an audit entry. A disabled user cannot sign in (`service.ts:244`).
8. **Result**: a new session is created and the presented session token, if any, is revoked (fixation protection) (`service.ts:255, 136`).

**Verified limitation.** The `domain` in the message is the `Host` header the *console* sees (`auth/http.ts:55`). Through the `web` proxy that is the proxy's backend host (`127.0.0.1:8787` by default), not the site the user is on. See `security-assessment.md` SEC-07.

## 5. Session management

**Verified** (`console/lib/auth/service.ts:37-40, 129-165, 308-323`, `console/lib/auth/http.ts:20-21`).

| Aspect | Implementation |
|---|---|
| Token | 32 random bytes, base64url (`randomBytes(32)`), 43 characters; resolved only if length is 20 to 100 (`service.ts:130, 147`) |
| At rest | `auth_sessions.token_hash` = SHA-256 hex of the token; the token itself is never stored or logged |
| Cookie | `tobin_session=<token>; Path=/; HttpOnly; SameSite=Strict; Max-Age=<seconds>; Secure` (Secure only when `NODE_ENV=production`, `backend.ts:20-27`). No `Domain` (host-only). Not `__Host-` prefixed. |
| Lifetime | 8 hours (`SESSION_TTL_MS`); wallet sessions also expire after 2 hours without activity (`last_seen_at` updated at most once a minute) and are capped at 24 hours from first creation; password sessions have **no idle timeout**, an 8-hour life, and a 24-hour cap only through `renew` (`service.ts:37-40, 134, 155-161, 312`) |
| Rotation | `POST /api/auth/renew` issues a new token and revokes the old one; the new session keeps the original `created_at`, so the 24-hour cap holds. Every sign-in (password or wallet) also revokes the presented token. |
| Revocation | `logout` (current), `logout-all` (every session of the user, audited), removal of a wallet revokes the sessions created with it (`service.ts:301`). Disabling a user or revoking the session's wallet makes `resolve` fail. |
| Multiple sessions | allowed, no cap; no session list endpoint (the user can see audit events and sign out everywhere) |
| Expired rows | never purged (**Verified**: no delete of `auth_sessions`) |
| Server-side validity | `resolve` checks hash match, not revoked, not expired, user not disabled, and for wallet sessions that the session's wallet is still `active` |

## 6. Wallet linking

**Verified** (`service.ts:265-304`).

- Issue: `POST wallet/link/challenge`, session required; at most 5 active wallets; refused if the key is already active on **any** user (`WALLET_UNAVAILABLE`, which discloses existence to an authenticated caller; acknowledged as residual 3 in the wallet-first-auth review).
- Verify: purpose `link-wallet`; the challenge row names the user and `row.user_id !== userId` fails (`service.ts:223`); re-checks uniqueness and count; the partial unique index `user_wallets_active_key` is the last line of defence.
- Remove: revokes (never deletes; triggers forbid delete and make revoked rows final, `database.ts:573-575`); refuses removing the only wallet of a wallet-only account (`LAST_METHOD`); revokes sessions bound to that wallet.
- A key revoked from one user can later be verified by another; nothing is merged and the old account is not reattached (documented).

## 7. Onboarding

**Verified.** `onboarding (user_id, profile_done, last_org_id)`. `accountView` derives the step `profile` → `organization` → `done` from profile state and active memberships (`service.ts:341-356`). A password account counts as `profile_done` at registration. `setWorkspace` stores a preference only after confirming active membership; on read it is dropped if membership is gone (`service.ts:358-363, 354`). The step is advisory for the UI; **authorization never depends on it**. The `web/proxy.ts` page gate uses it to redirect (`web/lib/access/decide.ts:145-146`), which is convenience, not security.

## 8. Invitations

**Verified** (`registry/service.ts:151-201`, `registry/http.ts:55-63, 132-142`).

| Aspect | Implementation |
|---|---|
| Who creates | an active administrator of the organization (`#need(orgId, u, true)`) |
| Code generation | `randomBytes(24)` base64url (192 bits); shown once in the create response (`token`); only SHA-256 stored (`token_hash`) |
| Delivery | none; "No email was sent" (`http.ts:139`). The administrator passes the code out of band. |
| Lifetime | 7 days (`INVITE_TTL_MS`) |
| One-time | status `pending` → `accepted` in the same transaction as the membership; `revoked` by an administrator; accepted/expired/revoked all give the same generic `INVALID_INVITATION` |
| Role | fixed by the stored offer (`admin` or `member`); the acceptor cannot choose |
| Already a member | acceptance fails (`#role` active) |
| Suspended member | `#role` returns `null` for a suspended membership, so acceptance proceeds and `putMembership` upserts `status='active'` (`sqlite-store.ts:38`): **a suspended member holding a valid invitation addressed to them is reinstated.** An administrator has to have issued it. |
| Email binding | if `invitee` contains `@`, the acceptor's `email` must equal it case-insensitively; a wallet-only user has no email and fails (`service.ts:190`). **Because registration does not verify email ownership, anyone can register with any unregistered address and satisfy this check.** The binding is therefore only as strong as the secrecy of the 192-bit code. |
| Wallet binding | if `invitee` is a valid Stellar address, the acceptor must hold it as an active verified wallet (`service.ts:191`) |
| Unbound invitations | an invitee string with neither form is open to any holder of the code (by design, documented) |
| Brute force | per acceptor: 10 invalid attempts per 15 minutes (`registry/http.ts:55-63`) |

## 9. Organization membership, roles and last-administrator protection

**Verified.**

- Statuses: `active`, `suspended` (CHECK constraint, `database.ts:617`). A suspended member resolves to "no such organization" on every call (`#role` requires `active`), is excluded from `myOrganizations`, and is not an eligible participant.
- Roles: `admin`, `member`. There is no platform-wide administrator, no superuser and no support role in the code.
- Creating an organization makes the creator `admin` with no reviewer grant (`service.ts:80-82`). Any authenticated user can create organizations; there is no limit.
- `setRole`, `removeMember`, `setMemberStatus` require `admin`. **Last-administrator protection**: `setRole` (demotion), `removeMember` and `setMemberStatus('suspended')` refuse when the target is the only *active* administrator (`service.ts:112, 123, 144`; error `LAST_ADMIN`). An administrator cannot change their own status (`service.ts:141`) but can demote themselves if another active administrator exists. The check reads then writes inside one `BEGIN IMMEDIATE` transaction, so it is safe for one process (**Inference** for multi-writer PostgreSQL: needs row locking).
- Removing a member is refused while they have active obligations in any session, or if the session is no longer `configuring` (`service.ts:124-130`); the reviewer grant is deleted by the foreign-key cascade.
- A user belonging to an organization whose name differs only by case or whitespace from another of their own organizations cannot create a duplicate (`service.ts:73-74`).

## 10. Reviewer grants and separation of duties

**Verified** (`service.ts:510-588, 719-753`, `registry/authorization.ts:32-47`).

- Grant/revoke: administrators only; the target must be an active member; grants are idempotent; revocation says earlier decisions stay on record.
- To decide on a **calculation** (`decide`): active member, reviewer grant, session not closed, the named calculation is the latest and still current, no decision exists yet, and the user is not in the conflict set.
- **Calculation conflict set** (`conflictedActors`): the user who ran the calculation; every `createdBy`/`updatedBy` of an obligation that is part of the calculation input; and, from the append-only activity log, every actor whose `obligation.*` activity for this session names an obligation in the input (so an earlier editor or voider is still found).
- **Not in the calculation conflict set** (**Verified** by reading the function): who created the session, added or removed participants, marked ready, or prepared a batch; and whether the reviewer is a debtor or creditor in the obligations. **Inference:** this matches the stated rule "nobody decides on a result they recorded, changed or calculated" (AGENTS.md section 7); it does not claim party-independence.
- To decide on a **batch** (`decideSettlementBatch`): active member, reviewer grant, session not closed, `instructionsHash` supplied equals the stored one, batch status `awaiting-review` and validation passing, and `batch.preparedBy !== user` (`SEPARATION_OF_DUTIES`). **The batch rule does not consult the calculation conflict set and does not forbid the reviewer who approved the calculation from approving the batch.** The same reviewer can therefore approve both the calculation and the batch if they did not prepare the batch. Whether that is intended is an **Owner decision**.
- An administrator who is also a reviewer: allowed; they are barred only by the conflict rules above (for example they cannot approve a calculation they ran).
- The `web` UI re-derives these rules for display (`web/lib/approvals/rules.ts`); the server is authoritative.

## 11. Administrative privileges and the owner Stellar tools

**Verified.**

- Organization administrators can: update the profile, change roles/status, remove members, invite, revoke invitations, grant/revoke reviewers, record organization wallet claims, create sessions, edit participants and obligations while `configuring`, calculate, mark ready/reopen/close, prepare batches, start executions and begin attempts, read the live signer set and record snapshots. They cannot decide on calculations or batches unless separately granted reviewer status (and then subject to separation of duties). They cannot set a user's password, disable a user, merge accounts, impersonate, or advance execution/attempt states (no HTTP route).
- Operator privileges exist only outside HTTP: `scripts/db.ts` (migrate, asset configuration, demo seed refused in production) and direct database access.
- `POST /api/stellar/cosign` and `/api/stellar/run`: header `x-tobin-request: 1`, valid session, **and** `ownerToolsAllowed` (an active verified wallet equal to the administrative account, one of its Founder/Security signers, or `TOBIN_SECOND_ACCOUNT`) (`app/api/stellar/{cosign,run}/route.ts`, `lib/stellar/owner-access.ts`). `POST /api/stellar/validation` requires only header and session (no owner gate) (`app/api/stellar/validation/route.ts`).

## 12. Permission enforcement points

| Point | Where | Mechanism |
|---|---|---|
| Transport guards | `console/proxy.ts` | Host allow-list, foreign-Origin refusal on `/api/`, JSON-only POST |
| CSRF header | `registry/http.ts:48`, `auth/http.ts:47`, each Stellar route | `x-tobin-request: 1` on non-GET |
| Authentication | `authenticateRequest` → `AuthService.resolve` | cookie only; no header or body field is an identity (`auth/http.ts:24-26`) |
| Membership/role | `Registry.#need` | first line of every organization-scoped service method |
| Object scoping | `session()` (`s.orgId === orgId`), `#own` (obligation in session), `#batchOf` (batch in session), invitation `i.orgId`, challenge `c.orgId && c.userId`, membership lookups by `orgId` | service layer |
| Reviewer | `#isReviewer` | `decide`, `decideSettlementBatch` |
| Separation of duties | `conflictedActors`, `batch.preparedBy` | same |
| State guards | `#editable` (admin + `configuring`), `#opSession` (not fixture) | write methods |
| Page access | `web/proxy.ts` + `decideAccess` and client `AppGate` | convenience; not authorization |

## 13. Per-endpoint authorization table (registry)

Paths are relative to `/api/registry`. Every route first requires: for non-GET the header `x-tobin-request: 1` (`http.ts:48`) and a valid session cookie (`http.ts:49-50`). "Member" means an **active** member of `:o`; non-members, suspended members and unknown organizations all get `404 NOT_FOUND` (`service.ts:58-63`). "Admin" is `role='admin'`, otherwise `403 FORBIDDEN`. "Reviewer" is a grant in `org_reviewers`. **Verified** by reading `lib/registry/http.ts` (line numbers) and `service.ts`.

| Endpoint | Min. requirement | Object-level scoping | Line |
|---|---|---|---|
| `GET assets` | session | global operator-configured list (not tenant data) | 65 |
| `POST invitations/accept` | session; rate limit 10 bad tokens/15 min per user | token hash lookup; binding to email/wallet; membership created for the **acting** user | 55 |
| `GET orgs` | session | own active memberships only | 70 |
| `POST orgs` | session | creator becomes admin; no limit | 71 |
| `GET orgs/:o` | member | `#need` | 75 |
| `POST orgs/:o/update` | admin | `#need(admin)` | 80 |
| `GET orgs/:o/members` | member; emails and wallet keys shown to admins only | members of `:o` | 85 |
| `POST orgs/:o/members/:u/role` | admin | target must be in `membershipsOfOrg(:o)`; last-admin rule | 92 |
| `POST orgs/:o/members/:u/remove` | admin | same; blocked by active obligations; last-admin rule | 93 |
| `POST orgs/:o/members/:u/status` | admin | same; not self; last-admin rule | 94 |
| `POST orgs/:o/wallet-challenges` | member | challenge stored with `(orgId, userId)`; testnet only | 97 |
| `POST orgs/:o/wallet-challenges/:c/verify` | member | `c.orgId === :o && c.userId === user`; unused; unexpired; signature | 102 |
| `GET orgs/:o/wallet-verifications` | member | verifications of `:o`; **all members can see every member's verified key** | 108 |
| `POST orgs/:o/signer-sets` | admin (checked **before** the network read) | snapshot stored under `:o` | 113 |
| `GET orgs/:o/signer-sets/:account` | member | `signerSetsOfAccount(:o, ...)` | 125 |
| `GET orgs/:o/reviewers` | member | grants of `:o` | 128 |
| `POST orgs/:o/reviewers/:u/grant|revoke` | admin | target must be an active member / existing grant | 129-130 |
| `GET orgs/:o/invitations` | admin | invitations of `:o` (token hash omitted) | 133 |
| `POST orgs/:o/invitations` | admin | role from body `admin|member` (default member) | 134 |
| `POST orgs/:o/invitations/:i/revoke` | admin | `invitation.orgId === :o` | 141 |
| `GET orgs/:o/wallets` | member | claims of `:o` | 144 |
| `POST orgs/:o/wallets` | admin | claim only, `proof='none'` | 145 |
| `GET orgs/:o/sessions` | member | sessions of `:o`; whole activity log loaded | 148 |
| `POST orgs/:o/sessions` | admin | server-generated 256-bit id; provenance `local-draft`; global id uniqueness | 149 |
| `GET orgs/:o/sessions/:s` | member | `session.orgId === :o` | 155 |
| `GET|POST .../:s/participants` | GET member; POST admin + `configuring` | participant must be an active member of `:o` | 183-189 |
| `POST .../:s/participants/:u/remove` | admin + `configuring` | active participant; no active obligations | 190 |
| `GET .../:s/obligations`, `GET .../:s/obligations/:id` | member; not a fixture | `obligation.sessionId === :s` | 193, 199 |
| `POST .../:s/obligations`, `.../:id/update`, `.../:id/void` | admin + `configuring` | debtor/creditor must be active participants; same asset | 194, 200, 205 |
| `POST .../:s/calculate` | admin + `configuring` | input is read from stored rows; client supplies none | 289 |
| `GET .../:s/calculation`, `GET .../:s/readiness` | member | session of `:o` | 290-291 |
| `POST .../:s/ready|reopen|close` | admin | transition table; `close` needs an approved eligible batch | 292 |
| `GET .../:s/authorization` | member | eligibility reasons computed for the caller | 282 |
| `POST .../:s/authorization/approve|reject` | member + **reviewer** + separation of duties | named calculation must be latest and current | 283 |
| `GET .../:s/settlement` | member | preview + batches of `:s` | 231 |
| `POST .../:s/settlement/prepare` | admin | named calculation must be latest; approval must be active | 232 |
| `GET .../settlement/batches/:b` and `/validation` | member | `batchesOfSession(:s)` | 263-264 |
| `POST .../settlement/batches/:b/approve|reject` | member + **reviewer** + `preparedBy !== user` + hash match | batch in `:s` | 265 |
| `GET .../batches/:b/execution` and `/execution/attempts` | member | execution of batch in `:s`; verified accounts of all participants shown | 239, 253 |
| `POST .../batches/:b/execution/start` | admin | batch must be approved and valid; every party needs exactly one verified key | 262 |
| `POST .../batches/:b/execution/attempts/begin` | admin | initiator must be a participant with a verified key; plan rebuilt server-side; retry policy | 257 |

**Verified:** there is no registry route for `advanceSettlementExecution`, `advanceExecutionAttempt`, `noteExecutionAttempt`, `attachChainRead` or `confirmSession`, so no HTTP caller can set `chain-read`/`chain-confirmed` provenance or an execution state.

**Verified:** `/api/auth/*` endpoints: `GET me`, `GET audit` (own events), `POST register|login|logout|wallet/challenge|wallet/verify` need no session; `POST wallet/link/*`, `wallet/remove`, `profile`, `workspace`, `renew`, `logout-all` need a session; all POST need the header.

## 14. Cross-organization access protection

**Verified.** The organization id is taken from the URL path and is never trusted: every service method that takes it begins with `#need`, `#opSession` or `session()`, all of which call `#role(orgId, user)` (an active membership row for **this user in this organization**). Resources addressed below the organization (session, obligation, batch, attempt, invitation, challenge) are then checked against the organization or session in the URL (table in section 13). Both "not a member" and "no such organization" return the same `404`.

Paths where the organization id is **not** checked against membership (**Verified**, complete list):
- `invitations/accept`: there is no organization in the URL; the token determines the organization, and acceptance creates a membership only for the acting user.
- `assets`: global configuration list.
- `GET orgs` and `POST orgs`: operate on the acting user's own memberships.
- `POST /api/auth/workspace`: the supplied `orgId` is checked against the user's active organizations (`auth/service.ts:359`).

**Inference.** A residual cross-tenant surface is user identifiers: `userId`s are visible to all members of an organization, and the global `usr_<18 hex>` pattern is used to substitute display names in activity text (`registry/http.ts:13, 160`). Names of users in other organizations are not reachable because the substitution map is built only from ids appearing in that organization's data.

## 15. Account recovery and its unresolved limitations

**Verified, and deferred by owner decision** (`wallet-first-auth/RELEASE-SCAN-EXCEPTIONS.md`, residual 5 in the security review).

- Wallet-only account: if every verified wallet is lost, the account cannot be recovered; signing in again with a new key creates a **new** user without the old memberships. Removing the only wallet is refused.
- Email account: there is no password reset, no change-password endpoint, no email delivery and no recovery token. **Unknown** whether the owner considers this acceptable for pilot; it is a gap for any institutional user who forgets a password.
- No administrator override or support-assisted recovery exists, deliberately (AGENTS.md section 12 forbids adding one without approval).
- Consequence: an organization whose sole administrator loses access cannot administer itself. The last-administrator rule prevents *removing* the last admin but cannot help when that admin cannot sign in. **Owner decision:** a recovery design (second factor, time-locked admin-assisted process, or institution-level co-approval) needs its own decision and review.

## 16. Self-review prohibition, exactly

**Verified.**

| Decision | Who is barred | Evidence |
|---|---|---|
| Approve/reject a calculation | the user who ran that calculation; any user who created or last updated an obligation in its input; any actor recorded in activity as changing/voiding such an obligation in this session | `authorization.ts:32-47`, `service.ts:580-581, 558-561` |
| Approve/reject a settlement batch | the user who prepared that batch (`preparedBy`) | `service.ts:746` |
| Not barred | creator of the session; participant editors; the person who marked the session ready; a party to the obligations; the reviewer who approved the calculation (for the batch); the admin who starts the execution or begins the attempt | absence of checks in `decideSettlementBatch`, `startSettlementExecution`, `beginExecutionAttempt` |

Self-approval of a calculation or batch the same user prepared is rejected on the server with `403 SEPARATION_OF_DUTIES` (HTTP status table `registry/http.ts:29`). Tests: `authorization-ops.test.ts`, `settlement-ops.test.ts`.

## 17. CSRF posture

**Verified.**

- Cookie `SameSite=Strict` (primary defence).
- State-changing requests need the custom header `x-tobin-request: 1`, which a cross-origin page cannot add without a CORS preflight; the console never sends CORS headers.
- The console refuses a foreign `Origin` on `/api/` and any POST that is not `application/json` (so a simple form POST with `text/plain` is refused), but only with its loopback allow-list (`guards.ts:34-38`).
- No per-session CSRF token exists on the institutional path (documented, residual 7). W0 uses a per-session CSRF token (`lib/w0/http.ts`).
- **Verified weakening.** When the request arrives through the `web` proxy, the proxy supplies the header and the content type itself and drops the browser's `Origin` (`web/app/api/[...path]/route.ts:25-27`). A cross-site form post to the `web` origin is then forwarded to the console as a valid JSON POST with the header, so the only remaining defence for institutional state changes is `SameSite=Strict` on the cookie (**Inference**: this holds only if the browser honours SameSite and the attacker is not same-site). See `security-assessment.md` SEC-03.

## 18. Findings and justified recommendations

Each recommendation is **Recommendation** status and is tied to evidence above.

| ID | Observation | Evidence | Recommendation |
|---|---|---|---|
| A1 | Email addresses are never verified, yet accounts are labelled `kind: 'verified'` and email-addressed invitations rely on the address | `service.ts:107`; section 8 | Either send a verification email before an email can satisfy an invitation binding, or remove the claim that the email binding is meaningful and prefer wallet-bound invitations. **Owner decision** on delivery provider. |
| A2 | Registration is unauthenticated, unrated, enumerates by status, and costs 64 MiB of scrypt memory per call | `service.ts:91-108` | Rate-limit registration (global and, behind a trusted proxy, per IP); return the same status for existing and new addresses (for example always `202`). |
| A3 | Lockout counts per email only; no per-IP limit; global challenge budget can be exhausted by anyone | `service.ts:41-43, 115, 196` | Add IP-aware limits once the trusted client IP is available behind Railway (needs the proxy to forward it and the app to trust only that hop). |
| A4 | Suspended member reinstated by accepting an invitation | section 8 | In `#acceptInvitation`, look up the membership regardless of status and refuse (or require an administrator to restore). |
| A5 | Calculation conflict set differs from batch rule; the same reviewer can approve both | section 10 | **Owner decision**: whether a second, different reviewer is required for the batch. |
| A6 | Execution accounts come from keys each member verified for themselves; no reviewer sees them before the batch is approved | `service.ts:794-818`; batch view sets accounts to `null` (`registry/http.ts:216`) | Show the payer/payee keys to the batch reviewer, or require administrator confirmation of each participant key; **Owner decision**. |
| A7 | Sign-in challenge `domain` is the internal Host | section 4 | Build the domain from configured public origin (a server setting), not from the request header. |
| A8 | Password sessions have no idle timeout | `service.ts:155` | Apply the 2-hour idle rule to password sessions as well, or document the difference. |
| A9 | No password reset or recovery | section 15 | **Owner decision** (see above). |
| A10 | Cookie name lacks the `__Host-` prefix | `auth/http.ts:20` | Rename once the cookie is always `Secure; Path=/` without a Domain; low value, low cost. |

## 19. What was checked and found sound

- Opaque server-side sessions with hash at rest; rotation on sign-in; revocation on wallet removal; absolute cap (`service.ts:129-165, 308-323`).
- Challenge handling: server-rebuilt message, five-minute life, single guarded consumption, burn after repeated failures, same generic error (`service.ts:191-229`).
- Identity is never taken from a header or body field; the development identity provider cannot be constructed in production (`identity.ts:25`).
- Uniform `404` for non-members and suspended members; object checks below the organization; no route exists for chain-provenance or execution-state changes.
- Last-administrator and self-suspension rules; reviewer grant removed with membership by foreign-key cascade; immutable decisions, batches, attempts and audit (triggers).
- Decisions and batches are bound to the exact calculation/instruction hash and are invalidated by changes (`service.ts:496-509`).

## 20. What could not be verified

- Behaviour with the real Freighter extension for this sign-in flow (documented by the authors as run only with a stand-in extension).
- Any behaviour behind a TLS-terminating proxy or on Railway.
- Multi-process behaviour of the transactional guarantees.
