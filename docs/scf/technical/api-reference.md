# Institutional HTTP API reference

Status: technical document of the SCF Build Award (Open Track) submission package, 2026-11-09. Written from the route handlers, not generated; there is no OpenAPI file and the API is not a stable public interface. Our own recommended documentation.
Evidence basis: `apps/web-console/lib/auth/http.ts`, `lib/registry/http.ts`, `lib/public/discover.ts`, `lib/server/{config,guards}.ts`, `app/api/**/route.ts`, `apps/web/lib/proxy-policy.ts`, `apps/web/app/api/**`, and the service rules in `lib/registry/service.ts`. Routes were read, not called.

Related: [architecture.md](architecture.md), [technical-specification.md](technical-specification.md) (rules, limits, error meanings), [ui-and-console.md](ui-and-console.md). Existing generated-style pages: [HTTP routes](../../../apps/docs/content/docs/reference/http-routes.mdx), [SDK](../../../apps/docs/content/docs/reference/sdk.mdx), [netting engine](../../../apps/docs/content/docs/reference/engine.mdx), [errors](../../../apps/docs/content/docs/reference/errors.mdx).

## 1. Access classes

| Class | Routes | Who can call |
|---|---|---|
| Public | `GET /api/public/v1/{stats,institutions,settlements,assets}`; probes `/api/live`, `/api/ready` (web), `/api/live`, `/api/ready`, `/api/health` (console) | anyone through the web app (Discover) or, on the console, anyone holding the proxy secret except probes |
| Session | `/api/auth/*` (except register, login, wallet challenge/verify), `/api/registry/*` | a signed-in user (cookie `tobin_session`); further rules per route below |
| Internal (web to console hop) | headers `x-tobin-proxy-auth`, `x-tobin-client-ip`, `x-request-id` | the web server only |
| Local owner tools | `/api/stellar/{run,cosign,validation}` | a signed-in user whose verified wallet is on the owner list; not served by a hosted console |
| Development only | `/api/bootstrap`, `/api/rpc`, `/api/w0/*` | local loopback only; refused in hosted mode |

Roles used below: member (active membership), admin (role `admin`), reviewer (separate grant). Non-members of an organization get `404 NOT_FOUND` for everything under it, the same as for a missing organization.

## 2. Common rules

- Format: JSON. Responses carry `cache-control: no-store` (Discover: `public, max-age=30`) and `x-content-type-options: nosniff`.
- Writes: every non-GET request to `/api/auth` and `/api/registry` must carry `x-tobin-request: 1`, otherwise `403 FORBIDDEN`. POST must be `application/json`. Body at most 4096 characters at the console, 8 KiB at the web proxy; unknown fields are ignored.
- Errors: `{ "error": CODE, "message": text }`. Status mapping is in [technical-specification.md](technical-specification.md) section 12; `401 UNAUTHENTICATED` without a valid session, `503 BACKEND_UNAVAILABLE` when the database is not available, `500 INTERNAL` otherwise.
- Pagination: none, except Discover. `GET .../sessions` returns every session of the organization.
- Idempotency: **none today**. There is no idempotency key. Duplicate protection comes from schema and rules: one decision per calculation (`EXISTS`), one batch per calculation attempt, one execution per batch, single-use challenges and invitations, unique transaction hash per attempt step.
- Versioning: only `/api/public/v1`. The institutional routes are unversioned.
- Provenance: sessions created here are `local-draft`; no route can set `chain-read` or `chain-confirmed`.

## 3. Rate limits

Per-user and per-key limits always apply; per-address limits apply in hosted mode only, using the client address forwarded by the web server (`trustedClientIp`, `auth/http.ts:17`). Values and sources are in the specification section 13. In short: login 5 failures per email per 15 minutes (429 `RATE_LIMITED`); register 10 per hour per address; login 20 failures per 15 minutes per address; wallet challenge 10 per key and 300 global per 10 minutes, 30 per address; wallet verify 10 failures per 15 minutes per key, 20 per address; invitation accept 10 failures per user per 15 minutes; at most 4 password hashes computed at once. There is no limit on other routes. Rate limiting from Vercel egress addresses is unverified.

## 4. Auth routes (`/api/auth/...`)

| Method and path | Auth | Request fields (validation) | Response (brief) |
|---|---|---|---|
| `POST register` | none; per-address limit | `email` (3 to 254, format), `password` (12 to 128, not equal to email), `displayName` (1 to 80, no control chars or `<`, `>`) | `201 {user}`; sets session cookie. Registration is open on the current hosted deployment |
| `POST login` | none | `email`, `password` | `200 {user}`; cookie |
| `POST logout` | cookie | none | `200 {ok}`; clears cookie |
| `GET me` | cookie | none | `200 {user, wallets, onboarding, organizations, lastOrgId}` or `401` |
| `GET audit` | cookie | none | `200 {events}` for the caller |
| `POST wallet/challenge` | none | `publicKey` (valid G address), `network` (testnet) | `201 {challenge}`: id, exact text to sign, expiry (5 minutes) |
| `POST wallet/verify` | none | `challengeId`, `signature` (base64, 64 bytes), `scheme` (`raw` or `sep-53`) | `200 {user, isNew}`; creates a wallet-only user if the key is unknown; cookie |
| `POST wallet/link/challenge`, `POST wallet/link/verify` | cookie | as above | `201`; adds a verified wallet to the caller (at most 5) |
| `POST wallet/remove` | cookie | `walletId` | `200`; the only sign-in method cannot be removed (`LAST_METHOD`) |
| `POST profile` | cookie | `displayName` | `200 {displayName}` |
| `POST workspace` | cookie | `orgId` (must be an organization of the caller) | `200` |
| `POST renew` | cookie | none | rotates the session token (wallet sessions never exceed 24 hours from creation) |
| `POST logout-all` | cookie | none | `200 {revoked}` |

A signed message grants no role. Session cookie: `HttpOnly`, `SameSite=Strict`, `Secure` in production.

## 5. Registry routes (`/api/registry/...`)

Paths below are relative to `/api/registry`; `:o` organization id, `:s` session id (64 hex), `:u` user id.

### 5.1 Organizations and people

| Method and path | Rule | Request fields |
|---|---|---|
| `GET assets` | signed in | none; operator-configured asset list, not an on-chain query. No route changes it |
| `GET orgs` | signed in | none |
| `POST orgs` | signed in; the creator becomes admin | `name` (2 to 80), `description` (up to 500), `visibility` (`public` opts into Discover; anything else is private), `institutionType` (`bank`, `payment-institution`, `broker-dealer`, `fintech`, `corporate-treasury`, `other`), `jurisdiction` (two capital letters) |
| `GET orgs/:o` | member | none |
| `POST orgs/:o/update` | admin | `name`, `description`, `visibility` |
| `GET orgs/:o/members` | member (email and wallet shown to admins only) | none |
| `POST orgs/:o/members/:u/role` | admin; last admin protected | `role` (`admin` or `member`) |
| `POST orgs/:o/members/:u/status` | admin; not yourself; last active admin protected | `status` (`active` or `suspended`) |
| `POST orgs/:o/members/:u/remove` | admin; refused while the member has active obligations or the session is past `configuring` | none |
| `GET orgs/:o/reviewers` | member | none |
| `POST orgs/:o/reviewers/:u/grant`, `.../revoke` | admin | none |
| `GET orgs/:o/invitations` | admin | none |
| `POST orgs/:o/invitations` | admin | `invitee` (email, Stellar address or free text, 3 to 120), `role`. No email is sent; the one-time token is returned once |
| `POST orgs/:o/invitations/:i/revoke` | admin | none |
| `POST invitations/accept` | signed in; per-user failure limit | `token`. A token bound to an email needs the account with that email; one bound to a Stellar address needs that verified wallet |
| `GET orgs/:o/wallets`, `POST orgs/:o/wallets` | member / admin | `address`; recorded as an unproven claim |
| `POST orgs/:o/wallet-challenges` | member | `network` (testnet), `publicKey` |
| `POST orgs/:o/wallet-challenges/:c/verify` | member | `signature`, `scheme` |
| `GET orgs/:o/wallet-verifications` | member | none |
| `POST orgs/:o/signer-sets` | admin (checked before any network read) | `network` (testnet), `account`; reads Horizon and RPC, fails with `503 CHAIN_UNAVAILABLE` if they disagree |
| `GET orgs/:o/signer-sets/:account` | member | none |

### 5.2 Sessions and clearing

| Method and path | Rule | Request fields |
|---|---|---|
| `GET orgs/:o/sessions` | member | none |
| `POST orgs/:o/sessions` | admin | `label` (1 to 80); the id is generated by the server |
| `GET orgs/:o/sessions/:s` | member | none; includes the organization activity |
| `GET .../:s/participants`; `POST .../participants`; `POST .../participants/:u/remove` | member; admin; admin | `userId`, optional `walletAddress` (must be an organization claim). Session must be `configuring` |
| `GET .../:s/obligations`, `GET .../obligations/:ob` | member | none |
| `POST .../:s/obligations` | admin, `configuring` | `debtor`, `creditor` (user ids of active participants), `amount` (digits only), `assetRef` (canonical identity) or `asset` (code), `reference` |
| `POST .../obligations/:ob/update`; `POST .../obligations/:ob/void` | admin, `configuring` | same fields; `reason` for void |
| `POST .../:s/calculate`; `GET .../:s/calculation` | admin; member | none; the server computes, the client supplies nothing |
| `GET .../:s/readiness`; `POST .../:s/ready`, `reopen`, `close` | member; admin | none |
| `GET .../:s/authorization`; `POST .../authorization/approve`, `.../reject` | member; reviewer | `calculationId`, `reason` (required for reject). Refused as `STALE` if superseded or changed, `SEPARATION_OF_DUTIES` if the caller ran or edited the input |
| `GET .../:s/settlement`; `POST .../settlement/prepare` | member; admin | `calculationId`, `attempt` (the next attempt number when earlier batches exist) |
| `GET .../settlement/batches/:b`; `GET .../validation` | member | none |
| `POST .../settlement/batches/:b/approve`, `.../reject` | reviewer; the preparer is refused | `instructionsHash` (the hash the reviewer saw), `reason` for reject |
| `GET .../batches/:b/execution`; `GET .../execution/attempts` | member | none; the response lists what is unavailable in this build |
| `POST .../batches/:b/execution/start` | admin | none; needs one verified account per payer and payee; creates a record in `awaiting-signer` |
| `POST .../execution/attempts/begin` | admin | `initiator` (user id with a verified account), `reviewedFailure` (boolean). Needs `TOBIN_STELLAR_CLEARING_CONTRACT` and a contract-kind asset; creates an attempt in `awaiting-signer` |

No route accepts a signed transaction, submits, confirms or reconciles anything, or advances an execution state. The response `note` fields say so.

## 6. Public Discover API

`GET /api/public/v1/stats`, `/institutions`, `/settlements`, `/assets` (`lib/public/discover.ts`). Unauthenticated, read-only, `405` for other methods. Query: `limit` 1 to 50 (default 20), `cursor` (integer offset), `sort` (`name` or `newest` for institutions; settlements and assets accept their documented sort names but return nothing). Content:

| Endpoint | Returns |
|---|---|
| `stats` | `network`, `institutionsOptedIn` (count), and `null` for settlements recorded, assets in use and last settlement, with a note that nothing has been independently read back |
| `institutions` | `items` of `{id, displayName, institutionType?, jurisdiction?}` for organizations whose admins chose `public` visibility; `nextCursor` |
| `settlements`, `assets` | empty `items`; nothing is published because the backend records no independently read-back transaction |

It exposes only opted-in organization name, type and jurisdiction (and the organization id); never sessions, members, wallets or amounts. Through the web app the same paths are forwarded for GET only (`/api/public/v1/*`). The web Discover page calls them (merged in #52; live-verified on 2026-11-09).

## 7. Probes

| Service | Path | Meaning |
|---|---|---|
| web | `GET /api/live` | process answers (`{status, service}`) |
| web | `GET /api/ready` | the console answers its readiness probe within 3 seconds; reports `stellar: not checked` |
| console | `GET /api/live` | process answers |
| console | `GET /api/ready` | database answers and no migration is pending (`ready` / `not-ready`, schema version, pending count); `stellar: not checked` |
| console | `GET /api/health` | same database check with `ok` / `degraded` / `unavailable` |

## 8. What the web proxy forwards

`apps/web/app/api/[...path]/route.ts` with `lib/proxy-policy.ts`:

- Forwards only paths matching `/api/(auth|registry|public/v1)/...`, methods GET and POST (others `405`), `public/` only for GET. Segments containing `..`, `.`, `/`, `\` or `%` are refused (`400`). Everything else is `404 PROXY_REFUSED`: `/api/stellar/*`, `/api/bootstrap`, `/api/rpc`, `/api/w0/*`, `/api/health`.
- Validates the real browser request before forwarding (POST: JSON, an `Origin` equal to the public origin, `Sec-Fetch-Site` same-origin when sent, header `x-tobin-request: 1`; GET: Origin and Fetch Metadata checks), with refusal codes `CSRF_ORIGIN`, `CSRF_SITE`, `CSRF_HEADER`, `PROXY_REFUSED`.
- Forwards the session cookie, drops the browser `Origin`, sets `content-type: application/json`, passes the CSRF header on POST, adds `x-request-id`, and in hosted mode adds `x-tobin-proxy-auth` (shared secret) and `x-tobin-client-ip` (last `X-Forwarded-For` entry when `TOBIN_TRUSTED_PROXY_HOPS=1`). Returns the upstream body and `Set-Cookie` headers, `no-store`.
- Body over 8 KiB: `413`. Console unreachable: `503 BACKEND_UNAVAILABLE`.

The headers `x-tobin-proxy-auth`, `x-tobin-client-ip`, `x-request-id` are internal to the web-to-console hop. Browsers cannot supply a meaningful `x-tobin-proxy-auth`; a request to the public console domain without the correct secret is answered `403`.

## 9. Owner-run tool routes (local only)

`POST /api/stellar/run` (actions `status`, `prepare`, `attach`, `submit`, `resolve`; `submit` needs the exact text `I CONFIRM SUBMIT STEP n`), `POST /api/stellar/cosign` (`prepare`, `verify`), `POST /api/stellar/validation` (`account`; any signed-in user, read-only Testnet reads). `run` and `cosign` require a signed-in user whose verified wallet is on the owner list. All three require `x-tobin-request: 1`. A hosted console answers 404. Behaviour and limits: [stellar-integration.md](stellar-integration.md) section 6.
