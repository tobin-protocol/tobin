# Wallet-first authentication and institutional onboarding: architecture

Status: implemented and tested locally; **not committed**, awaiting owner review. Stellar Testnet only. Not production-ready, not Mainnet-ready, not independently reviewed. Evidence is same-author. See `WALLET-FIRST-AUTH-VALIDATION.md` for exactly what was verified and how, and `WALLET-FIRST-AUTH-SECURITY-REVIEW.md` for threats, fixes and residual risks.

## The one rule

**Wallet ownership is not institutional authority.** Signing in with a wallet proves control of a Stellar key. It does not create a membership, an administrator, a reviewer, a settlement initiator or a Stellar signer. Those are separate concepts with separate records, each checked by the server on every request:

| Concept | Where it lives | Created by |
|---|---|---|
| Internal Tobin user | `users` | first successful wallet sign-in, or email registration |
| Verified wallet | `user_wallets` | a signed one-time challenge (sign-in, or "add wallet") |
| Organization | `organizations` | the user who creates it |
| Membership and role (`admin` / `member`) and status (`active` / `suspended`) | `memberships` | creating an organization, or accepting an invitation |
| Invitation | `invitations` | an organization administrator |
| Clearing reviewer authority | `reviewer_grants` (MVP-1.3) | an administrator grants it explicitly; never the creator by default |
| Settlement initiation | the MVP-1.4/1.5 batch and execution rules | unchanged |
| Stellar multisig signer authority | the chain (signer-set verification, MVP-1.5) | unchanged; nothing in this work touches it |

## What was reused and what was added

Reused unchanged: the HttpOnly opaque-token session model (`auth_sessions`, token stored as SHA-256), the persisted failure rate limiter (`rate_events`), the `x-tobin-request` CSRF header plus SameSite=Strict plus the foreign-Origin/Host guard in `proxy.ts`, the registry authorization (`#need`), the SEP-53 signature verification (`wallet-proof.ts`, first used by the owner against a real Freighter in MVP-1.5 Stage 1), the Freighter client helpers (`freighter.ts`), the activity log, and every MVP-1.2 to 1.5 rule (reviewer separation of duties, settlement gates, signer-set checks).

Added: migration 8; wallet sign-in challenge and verification in `AuthService`; wallet management; session rotation, renewal and revocation; the onboarding account view; organization fields and duplicate guard; membership suspension; wallet-bound invitations; server-side owner-tool gate; the welcome, onboarding, account and join screens; a workspace switcher; a wallet change banner.

The organization ownership proof (`/api/registry/orgs/:o/wallet-challenges`) is Testnet-only on the server: any other network is rejected before anything is stored.

Not replaced: email and password accounts still work exactly as before and remain available as a secondary option on the welcome screen.

## Authentication sequence

1. The browser asks `POST /api/auth/wallet/challenge {publicKey, network:"testnet"}`.
2. The server validates the key, applies rate limits, stores a challenge row (random 128-bit id and nonce, purpose `sign-in`, network, key, the site from the validated `Host`, issued and expiry times, five-minute life) and returns the text to sign. The text is **rebuilt from the stored row at verification time**; the client's copy is never trusted.
3. The wallet signs the text (Freighter `signMessage`, SEP-53). The user approves the prompt in the extension.
4. The browser sends `POST /api/auth/wallet/verify {challengeId, signature, scheme:"sep-53"}`.
5. The server, in one database transaction: loads the challenge; checks purpose, expiry, unconsumed state and failure count; verifies the ed25519 signature over the SEP-53 digest of the rebuilt text; **consumes the challenge with a single guarded `UPDATE … WHERE consumed_at IS NULL AND expires_at > now` and requires one changed row** (this is what makes replay and a concurrent double answer fail); resolves the active wallet to its user or creates a new user, wallet, onboarding row and audit events; creates a fresh session and revokes the session cookie the browser presented (rotation); commits.
6. The response sets the cookie and returns only the user id, display name, the onboarding step and the organization list. The token is never in a response body.

Every failure of steps 5's checks returns the same `401 AUTH_FAILED` ("sign-in could not be completed"). Wrong answers are counted per key (rate limit) and per challenge (a challenge is burned after five wrong answers); that bookkeeping is committed even though the call then fails.

Only the `sep-53` scheme is accepted for sign-in. The `raw` scheme (signing arbitrary bytes) remains available only for the existing organization-scoped ownership proof.

## Sessions

Opaque 256-bit random token in an `HttpOnly; SameSite=Strict; Path=/` cookie (`Secure` in production). The database stores only the SHA-256. Lifetime 8 hours; a wallet session additionally ends after 2 hours without activity (`last_seen_at`, updated at most once a minute) and is bound to the wallet it was created with: removing that wallet revokes the session. `POST /api/auth/renew` rotates the token (new token, old revoked) but a session can never live longer than 24 hours from its first creation. `POST /api/auth/logout` revokes the current session; `POST /api/auth/logout-all` revokes every session of the user. Sign-in always rotates. No token is kept in browser storage and the UI never treats client state as proof of authentication: every protected request is resolved from the cookie on the server.

## Data model (migration 8; migrations 1 to 7 are untouched)

- `users`: `+ auth_method ('password'|'wallet')`, `+ updated_at`. A wallet-only user has the reserved placeholder email `wallet.<id>@wallet.tobin.invalid` and an unusable password hash, because `users.email` is NOT NULL in the accepted schema and rebuilding that table would risk cascading deletes. The placeholder is never shown, never accepted by login (login requires `auth_method='password'`), and the `.invalid` domain cannot be registered.
- `user_wallets`: id, user, network (`testnet` only, by CHECK), key, status, verified/created/revoked times. A partial unique index allows **one active user per (network, key)**. Rows are never deleted (trigger), identity columns cannot change (trigger), and a revoked row is final (trigger). A key revoked from one user may later be verified by another; nothing is merged.
- `auth_challenges`: single-use challenges (purpose, network, key, optional user for adding a wallet, domain, nonce, times, consumed time, failure count). CHECK: an add-wallet challenge names its user and a sign-in challenge does not.
- `auth_audit`: append-only (update and delete refused by trigger). Records user creation, session creation, wallet linked and revoked, profile change, revoke-all. It never contains signatures or tokens.
- `onboarding`: `profile_done`, `last_org_id` (a preference, re-checked against active membership on every use).
- `auth_sessions`: `+ last_seen_at`, `+ auth_method`, `+ wallet_id`.
- `organizations`: `+ institution_type` (bank, payment-institution, broker-dealer, fintech, corporate-treasury, other), `+ jurisdiction` (two capital letters).
- `memberships`: `+ status ('active'|'suspended')`.

## Organizations, membership and invitations

- **Create an institution** (atomic): the organization, the creator's `admin` membership and the activity record exist together. The role is an application role only. It is not a reviewer grant, not Stellar signing authority and not contract administration; the creator cannot approve a calculation they are barred from approving under the MVP-1.3 rules, and gets no reviewer authority until an administrator grants it. A user cannot hold two institutions whose names differ only by case or spacing (names of other institutions are never consulted: that would reveal their existence).
- **Join** only with an invitation: unguessable token (192 bits), only its SHA-256 stored, 7-day expiry, single use, revocable, role fixed by the offer. Recipient binding by what the invitation names: an **email** invitation can only be accepted by the verified account holding that email (a wallet-only user has none, so it can never satisfy it); a **Stellar address** invitation can only be accepted by a user holding that wallet as a verified, active wallet; an invitation that names neither is open to the holder of the token. Every failure is the same `INVALID_INVITATION`. Attempts are rate limited per user.
- **Suspend / restore** (administrators only, never oneself, never the last active administrator): a suspended member keeps the record but resolves to "no such organization" everywhere, drops out of `myOrganizations` and the last-workspace preference, and is not an eligible participant.
- **No personal workspace**: the product has no such model, so a user with no institution sees an explanation and the two real options. No placeholder institution is ever created.
- **Workspace switching**: the navigation switcher (shown with two or more institutions) and the two page selectors call `POST /api/auth/workspace`, which verifies active membership on the server.

## Authorization boundary of every route

All `/api/registry/*` routes resolve the user from the session cookie and then `#need(orgId, user, admin?)`: non-members and suspended members get the uniform `404`, non-administrators `403`. The owner tooling (`/api/stellar/cosign`, `/api/stellar/run`) additionally requires an **active verified wallet that is the administrative account, one of its configured signers, or the configured second account** (`lib/stellar/owner-access.ts`), because wallet sign-in is open to any wallet and being signed in must not be enough to drive them; the transactions still need the real signatures. `/api/stellar/validation` (the wallet check) is for the user's own key and needs only a session. `/api/w0`, `/api/rpc` and `/api/bootstrap` belong to the local sandbox consoles, are not part of the institutional area, and are protected by the local-only Host/Origin guard, not by sessions (unchanged and out of scope).

## HTTP endpoints added or changed (`/api/auth/*`; all POST need `x-tobin-request: 1`)

| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST wallet/challenge` | public | issues a sign-in challenge (201) or `400`/`429` |
| `POST wallet/verify` | public | verifies, rotates the session, sets the cookie (200) or generic `401 AUTH_FAILED` / `429` |
| `POST wallet/link/challenge`, `wallet/link/verify` | session | add a wallet with a fresh proof of the new key; `409 WALLET_UNAVAILABLE` if the key is active on any user; at most 5 wallets |
| `POST wallet/remove {walletId}` | session | revokes (never deletes); `409 LAST_METHOD` if it is the only way into a wallet-only account |
| `GET me` | session | user (no email for wallet-only), wallets, onboarding step, active organizations, validated last workspace |
| `POST profile`, `POST workspace` | session | display name; remember workspace (membership checked) |
| `POST renew`, `POST logout`, `POST logout-all` | session | rotation within the 24-hour cap; revocation |
| `GET audit` | session | the user's own authentication events |
| `POST /api/registry/orgs/:o/members/:u/status` | admin | suspend or restore |
| `POST /api/registry/orgs` | session | also takes `institutionType`, `jurisdiction` |

## Operations and troubleshooting

- No new environment variable is needed. `TOBIN_DB_PATH` is required in production as before; migration 8 applies on startup and is idempotent.
- The sign-in challenge is bound to the `Host` header (validated against the local allow-list by `proxy.ts`). Reaching the app under another host name is refused before it gets here.
- "Freighter was not found": install the extension, unlock it, reload. "wrong network": switch Freighter to Testnet. "locked": unlock and pick an account. "rate limited": wait ten minutes (10 challenges per key, 300 in total per ten minutes; 10 failed answers per key per fifteen).
- To use the owner Testnet tools with wallet sign-in, sign in with the wallet that is a configured signer or the second account (or add that wallet to your account on the Account page). An email account with no verified wallet can no longer reach those tools: this is a deliberate change.
- Account recovery is **deferred by owner decision**: a user must keep at least one verified wallet. There is no administrator override and no support recovery (see `RELEASE-SCAN-EXCEPTIONS.md`).
