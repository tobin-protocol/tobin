# Security assessment of the Tobin backend

Status: read-only desk review of the current `main`. Stellar Testnet only. Nothing was run: no server, no test suite, no network call, no database. Statements are labelled **Verified** (code read), **Recommendation**, **Inference**, **Unknown** or **Owner decision**. `console` is `apps/web-console`; `web` is `apps/web`.

**No penetration test, fuzzing, load test or independent security review has taken place.** This document is a same-author code review and is not a substitute for one. A finding marked "none found" means none was found by reading the files listed, not that none exists.

Companion documents: `existing-backend-assessment.md`, `authentication-and-authorization.md`.

## 1. Headline

1. **A public Railway deployment is blocked by the loopback-only request guard, and fails closed.** Every request whose `Host` is not `127.0.0.1:PORT` or `localhost:PORT` receives `403 forbidden host`, including `/api/health`, static assets and the calls the `web` proxy makes unless the two apps share one network namespace (SEC-01).
2. `web` (the public-facing UI) sets **no** CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy` or HSTS (SEC-02).
3. In the `web`→`console` topology the console's CSRF header, `Origin` and `Content-Type` defences are neutralised by the proxy; only `SameSite=Strict` remains (SEC-03).
4. Email accounts are never verified, so email-addressed invitations are bound to an unproven string; registration is unrated and enumerable (SEC-04, SEC-05).
5. Rate limiting has no IP dimension; a global sign-in budget and a per-email lockout can be used to deny service (SEC-06).
6. The SQL layer is clean: every statement is static and parameterised.
7. No secret, key or database file is tracked in Git (the scan below).

## 2. Scope and method

Read: `console/proxy.ts`, `lib/server/*`, `lib/auth/*`, `lib/registry/{http,service,sqlite-store,authorization,wallet-proof,identity}.ts`, `lib/db/database.ts`, `lib/stellar/*` (outbound calls and file reads), all `app/api/**/route.ts`, `scripts/db.ts`, `web/proxy.ts`, `web/app/api/[...path]/route.ts`, `web/lib/{proxy-policy,access/decide,api/http,wallet/*}.ts`, both `package.json`, `.gitignore`, `.github/` listing, tracked wallet-first-auth and security documents. Not read in full: UI component files, W0 internals beyond identity/http/deps, `signer-tests.yml`, `integration.yml`, `release-readiness.yml`, contract code.

Severity scale: **Critical** (direct compromise of funds or all tenants now), **High** (serious weakness or deployment blocker), **Medium**, **Low**, **Informational**. "Blocks Railway" means it should be resolved or explicitly accepted by the owner before a public deployment, not that it is a code defect.

## 3. Findings summary

| ID | Severity | Title | Blocks Railway |
|---|---|---|---|
| SEC-01 | High | Loopback-only Host/bind assumptions make a hosted deployment fail closed; naive relaxation exposes unauthenticated sandbox routes | **Yes** |
| SEC-02 | High | `web` sends no security headers (no CSP, framing, nosniff, referrer, HSTS) | Yes for a public pilot |
| SEC-03 | Medium | Proxy supplies the CSRF header and JSON content type; Origin check is bypassed; only SameSite remains | No (accept or fix before pilot) |
| SEC-04 | Medium | Email never verified; email-bound invitations only as strong as the code's secrecy | No |
| SEC-05 | Medium | Unauthenticated, unrated registration with 64 MiB scrypt; account enumeration by status | Yes before open signup |
| SEC-06 | Medium | No IP-aware rate limiting; global challenge budget and per-email lockout are denial-of-service levers | Yes before open signup |
| SEC-07 | Medium | Wallet sign-in challenge `domain` is the internal Host, not the public site | No |
| SEC-08 | Medium | Insufficient security logging and monitoring | Yes for a pilot with real users |
| SEC-09 | Medium | Single-instance state (SQLite file, in-memory maps) limits deployment to one replica and affects duplicate-execution protection on restart | Yes (constraint: one replica + volume) |
| SEC-10 | Low | Execution account mapping is not reviewed; insider can redirect a payee | No |
| SEC-11 | Low | Signer-set read interpolates an unvalidated `account` into a Horizon URL | No |
| SEC-12 | Low | `stellar/validation` open to any signed-in user; triggers server-side RPC work | No |
| SEC-13 | Low | Suspended member reinstated by accepting an invitation | No |
| SEC-14 | Low | Request bodies are read fully before the size check; list endpoints unbounded | No |
| SEC-15 | Low | `web/proxy.ts` matcher skips paths containing a dot; `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` disables the gate | No |
| SEC-16 | Low | Audit integrity rests on triggers only; no hash chain; no purge of sessions or audit | No |
| SEC-17 | Low | Production build includes W0 mock API and the MVP-1 sandbox routes | No (remove or gate) |
| SEC-18 | Informational | Organization ownership proof also accepts the `raw` scheme | No |
| SEC-19 | Informational | Full `Cookie` header forwarded to the console; cookie lacks `__Host-` prefix | No |
| SEC-20 | Informational | Dependency hygiene: exact pins and baseline check in CI; no automated vulnerability scan; `apps/web` tests not in CI | No |

## 4. Findings

### SEC-01 High: loopback-only guards and bind addresses make a hosted deployment fail closed

- **Evidence (Verified).**
  - `console/lib/server/guards.ts:16` `allowedHosts(port)` is exactly `127.0.0.1:${port}` and `localhost:${port}`; `checkRequest` returns `403 forbidden host` first (`guards.ts:35`); `console/proxy.ts:9-13` applies it to **every** request, including `/_next/static/*` and `/api/health` (test `test/guards.test.ts:9` asserts this for `evil.example`, `0.0.0.0:8787`, `[::1]:8787`, and a port mismatch).
  - `PORT` is read by `configuredPort` (`guards.ts`), so a platform-injected `PORT` changes the only accepted host to `127.0.0.1:$PORT`.
  - Both apps start with `--hostname 127.0.0.1` (`console/package.json`, `web/package.json`), which is not reachable from another container.
  - `web` calls the console with `fetch(BACKEND + path)` (`web/app/api/[...path]/route.ts:8, 31`) and `web/proxy.ts:68, 75`. The `Host` the console sees is derived from `TOBIN_API_URL` (default `http://127.0.0.1:8787`). A Railway private-network URL (for example `http://<service>.railway.internal:PORT`) would be refused with 403 on every call, and `/api/auth/me` failing makes `web/proxy.ts` treat everyone as signed out (`web/proxy.ts:79-81`).
- **Impact.** A public deployment does not work as-is; health checks fail. The failure mode is safe (closed).
- **The security trap.** The only protection of `console/app/api/bootstrap` and `console/app/api/rpc` (the sandbox, which spawns a Rust bridge when `TOBIN_BRIDGE_EXE` is set) and of `app/api/w0` (mock API) is this Host/Origin guard; none authenticates the caller (`lib/server/api.ts:20-56`). If the guard is relaxed to "any host" to make Railway work, those routes become reachable by the public. W0 refuses its development identity provider when `RAILWAY_ENVIRONMENT` is set (`lib/w0/deps.ts` `HOSTED_ENV_MARKERS`), and the sandbox needs `TOBIN_BRIDGE_EXE`, so the practical exposure is small, but they should not ship.
- **Likelihood.** Certain on first deployment attempt.
- **Remediation (Recommendation).** (1) Make allowed hosts and origins configuration (`TOBIN_ALLOWED_HOSTS`, `TOBIN_ALLOWED_ORIGINS`) that fails closed when unset in production; (2) do not expose the console publicly at all: only `web` is public, the console is reachable only on Railway's private network and its allow-list contains the exact private host name; (3) exclude `/api/bootstrap`, `/api/rpc`, `/api/w0`, `/w0` and the sandbox page from production builds or require an environment switch; (4) bind to `0.0.0.0` (or `::`) in the platform start command; (5) state in the deployment document which topology is chosen. **Owner decision:** topology (one service running both apps vs. two services with private networking).
- **Blocks Railway:** **Yes.**

### SEC-02 High: `web` sends no security headers

- **Evidence (Verified).** `web/next.config.ts` has no `headers()`; `web/proxy.ts` sets only `x-tobin-auth` on the request; `grep` for `Content-Security-Policy`, `X-Frame-Options`, `frame-ancestors`, `Strict-Transport-Security` in `apps/web` finds nothing. The console has CSP with nonces, `frame-ancestors 'none'`, `nosniff`, `no-referrer` and `X-Frame-Options: DENY` (`guards.ts:65-85`, `next.config.ts`) but those apply only to console responses. Responses from the `web` proxy route carry only `nosniff` (`route.ts:36`).
- **Impact.** Clickjacking of one-click application actions (approve, reject, grant reviewer, remove member) in a framed page; no CSP as a second line against any future XSS; no HSTS. The pages that sign nothing with a key still perform institutional decisions.
- **Likelihood.** Requires the victim to be signed in and visit an attacker page. Medium. No XSS sink was found in `web` (no `dangerouslySetInnerHTML`, `innerHTML`, `eval` in `apps/web`).
- **Remediation (Recommendation).** Add a nonce-based CSP, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS (via `next.config.ts` headers and `proxy.ts`), mirroring `console/lib/server/guards.ts`. Freighter injects into the page; test the CSP with the extension.
- **Blocks Railway:** not technically; **blocks a public pilot.**

### SEC-03 Medium: the proxy bypasses the console's CSRF defences

- **Evidence (Verified).** `web/app/api/[...path]/route.ts:22-27` for POST sets `content-type: application/json` and `x-tobin-request: 1` itself, forwards only the cookie, and the server-side `fetch` has no `Origin`. The console's checks (header required, `Content-Type` JSON-only, foreign-Origin refusal) therefore pass for any request that reaches the proxy. The `web` proxy itself checks neither `Origin` nor `Content-Type` nor a custom header. The wallet-first-auth review lists the custom header as the CSRF control (residual 7: "no per-session CSRF token").
- **Impact.** For a cross-site `text/plain` form POST (a "simple request" needing no preflight) to `https://<web>/api/registry/...` the browser sends the cookie only if SameSite permits. With `SameSite=Strict` it does not, unless the attacker is same-site (a sibling subdomain of the same registrable domain) or the browser ignores SameSite.
- **Likelihood.** Low with Strict cookies on a dedicated domain; higher if the app runs under a shared parent domain. Whether `*.up.railway.app` is treated as separate sites by browsers depends on the Public Suffix List: **Unknown**.
- **Remediation (Recommendation).** In the proxy route: require `Content-Type: application/json` from the browser (415 otherwise), require `x-tobin-request: 1` from the browser, check `Origin`/`Sec-Fetch-Site` against the configured public origin, then forward. This restores the intended layering at no cost to the UI (`web/lib/api/http.ts` already sends JSON; it would also need to add the header).
- **Blocks Railway:** No.

### SEC-04 Medium: email addresses are unverified

- **Evidence (Verified).** `AuthService.register` creates a user and returns `kind: 'verified'` (`auth/service.ts:91-108`) without any email challenge; there is no verification table or route. Invitation acceptance compares `invitee` with `user.email` (`registry/service.ts:190`). The architecture document states the invitation "can only be accepted by the verified account holding that email".
- **Impact.** An attacker who obtains an invitation code (192 bits, delivered out of band) for `alice@bank.com` can register `alice@bank.com` (if not taken) and accept it. The binding does not defend against code leakage as documented. Conversely, an attacker pre-registering an invitee's address blocks the legitimate invitee from registering (the legitimate user gets `REGISTRATION_FAILED`).
- **Likelihood.** Requires code leakage or pre-registration; delivery is manual, which narrows exposure.
- **Remediation (Recommendation).** Send a verification message and record `email_verified_at` before the address can satisfy an invitation; until then, prefer wallet-bound invitations and correct the documentation. **Owner decision:** email delivery provider (none is configured, `registry/http.ts:139`).
- **Blocks Railway:** No (but fix before real institutions are invited).

### SEC-05 Medium: registration is unauthenticated, unrated, and enumerable

- **Evidence (Verified).** `POST /api/auth/register` (`auth/http.ts:90-95`) needs only the CSRF header. It computes scrypt N=2^16, r=8 (about 64 MiB per hash; `maxmem` 256 MiB) per request (`service.ts:52-60, 99`). No `rateFail` call exists on this path. An existing address returns `409 REGISTRATION_FAILED`; a new one returns `201` with a cookie.
- **Impact.** Memory/CPU exhaustion by concurrent registrations (libuv thread pool of 4 limits parallel scrypt to about 256 MiB at a time, **Inference**); account enumeration; unbounded user table growth.
- **Likelihood.** Anyone who can reach the endpoint.
- **Remediation (Recommendation).** Throttle registration globally and per IP; return an identical response for new and existing addresses (e.g. `202 check your email`) once email verification exists; consider a CAPTCHA/proof-of-work only if abuse appears.
- **Blocks Railway:** Yes before open sign-up; not if registration is closed.

### SEC-06 Medium: rate limiting has no IP dimension; denial-of-service levers

- **Evidence (Verified).** Keys are `login:<email>`, `chal:<key>`, `chal:*`, `wverify:<key>`, `accept:<user>` (`auth/service.ts:41-48`, `registry/http.ts:30-31`). `web` does not forward a client IP and the console never reads `X-Forwarded-For`; the wallet-first-auth review states this (residual 4). `rateCount` runs a `DELETE` on every call (`service.ts:372`).
- **Impact.** Anyone can (a) exhaust the 300-per-10-minutes global challenge budget and block all wallet sign-ins, (b) lock a named user out of password login by sending five bad passwords every 15 minutes, (c) keep authenticated writes unlimited (create organizations, sessions, obligations without cap). Per-key brute force of signatures is infeasible regardless (ed25519).
- **Likelihood.** Trivial for an attacker who can reach the service.
- **Remediation (Recommendation).** Add per-IP limits at the edge (platform) and in the app using the one trusted forwarded hop; keep per-account limits; add generous caps on organizations per user and objects per session; move the cleanup `DELETE` out of the read path.
- **Blocks Railway:** Yes before open sign-up.

### SEC-07 Medium: sign-in challenge domain is the internal Host

- **Evidence (Verified).** `domain: request.headers.get('host')` (`auth/http.ts:55`). Through the proxy that header is the backend's host (`127.0.0.1:8787` by default) because `fetch` derives `Host` from the URL (`web/app/api/[...path]/route.ts:31`).
- **Impact.** The message does not name the site the user is on, so a wallet prompt on a phishing page looks identical to the real one, and an attacker can request a challenge for a victim's public key from the real service and present it on a look-alike page. Control is by the user reading the message; Freighter does not enforce origin binding of `signMessage` (**Unknown**: not verified).
- **Likelihood.** Requires phishing a Tobin user and knowing their public key (public).
- **Remediation (Recommendation).** Use a configured public origin (`TOBIN_PUBLIC_ORIGIN`) in the message and have the server compare it with the `Origin`/forwarded host; include it in the signed text; consider SEP-0053-style domain binding if the wallet supports it.
- **Blocks Railway:** No.

### SEC-08 Medium: insufficient security logging and monitoring

- **Evidence (Verified).** The only server log statement in `console/lib` is the start-up failure (`lib/server/backend.ts:52`). There is no request log, no failed-login log, no rate-limit log, no alert hook. Business events exist as database rows (`activity`, `auth_audit`).
- **Impact.** Credential stuffing, abuse and intrusion would be invisible unless the database is queried; platform logs would be empty.
- **Remediation (Recommendation).** Emit structured one-line events to stdout for authentication success/failure, rate-limit trips, authorization refusals (`403`, `SEPARATION_OF_DUTIES`), and admin actions; never log tokens, signatures or message text (consistent with `auth_audit` rules); document retention. **Owner decision:** retention and who monitors.
- **Blocks Railway:** For a pilot with real users, yes.

### SEC-09 Medium: single-instance state

- **Evidence (Verified).** SQLite file with WAL; backend singleton on `globalThis` (`backend.ts:36-55`); in-memory `ATTEMPTS` and `PREPARED` maps in `lib/stellar/run.ts:58-60` and `cosign.ts`; W0 stores and sandbox in memory; the wallet-first-auth review residual 6.
- **Impact.** Two replicas would not share the in-memory duplicate-submission guards of the owner tools, and two processes on one network volume risk SQLite locking problems (**Inference**). The in-memory guards are lost on restart; the tool "re-observes the chain first" (`run.ts` header comment), so the chain read is the real guard (**Verified** claim by the code's own comment, not re-proved here).
- **Remediation (Recommendation).** Run exactly one replica with a persistent volume; set the replica count explicitly; move attempt records to the database before any scale-out.
- **Blocks Railway:** constraint on topology, not a blocker.

### SEC-10 Low: execution account mapping is not reviewed

- **Evidence (Verified).** Each member verifies their own key via the organization ownership proof (`registry/service.ts:771-789`). `startSettlementExecution` (admin) takes the single verified key of each payer/payee (`service.ts:794-818`) after the batch was approved; the batch view returns `sourceAccount: null, destinationAccount: null` (`registry/http.ts:216`), so the reviewer approves instructions without seeing accounts.
- **Impact.** A member can verify an account of their choosing as their settlement account; a creditor-member could direct their own receipts elsewhere, or an admin could choose among verified keys. The on-chain transaction still requires the real signers and shows the addresses at signing time (**Inference**; not exercised here).
- **Remediation (Recommendation).** Show the payer/payee keys to the batch reviewer or require confirmation of the participant-to-key map by the other party. **Owner decision.**
- **Blocks Railway:** No.

### SEC-11 Low: unvalidated `account` interpolated into a Horizon URL

- **Evidence (Verified).** `registry/http.ts:117` checks only `typeof b['account'] === 'string'` (after `network === 'testnet'`); admin authorization happens at line 118; `readLiveSignerSet` then does ``fetch(`${horizon}/accounts/${o.account}`)`` (`lib/stellar/signer-set.ts:149`) via `fetch(url, { signal })` in `lib/stellar/live.ts`. The host is a constant (`https://horizon-testnet.stellar.org`).
- **Impact.** Not SSRF to an arbitrary host. An organization administrator can inject path segments or a query into a GET to the fixed Horizon host (for example `../` or `?`), and the server reports only a status or "a source answered for a different account". Redirects are followed by default `fetch` semantics (**Inference**).
- **Likelihood.** Requires administrator rights in some organization (organizations are free to create).
- **Remediation (Recommendation).** Call `isStellarAccount(account)` before any network access; use `encodeURIComponent`; set `redirect: 'error'`.
- **Blocks Railway:** No.

### SEC-12 Low: `/api/stellar/validation` is open to any signed-in user

- **Evidence (Verified).** `app/api/stellar/validation/route.ts` requires the header and a session only (no `ownerToolsAllowed`); it runs `prepareOwnerValidation`, which calls the Soroban RPC (`getLatestLedger`, `getAccount`, simulations) and reads a tracked deployment file (`owner-validation.ts:14-15`). Wallet sign-in is open to any key, so "signed in" is a low bar.
- **Impact.** Outbound request amplification against the public Testnet RPC from a free account; no data of other tenants. The route is also reachable only through `console` directly, since the `web` proxy does not forward `/api/stellar/*` (`proxy-policy.ts:49`).
- **Remediation (Recommendation).** Apply the owner gate or a per-user rate limit; disable the route in production unless needed.
- **Blocks Railway:** No.

### SEC-13 Low: suspended member reinstated through an invitation

- **Evidence (Verified).** `#acceptInvitation` rejects if `#role(...)` is non-null (`service.ts:186`), and `#role` ignores suspended rows (`service.ts:54-56`); `putMembership` upserts `status` from the new object, which has none, so it becomes `active` (`sqlite-store.ts:37-39`).
- **Impact.** A suspended member who is later invited by an administrator (or holds a valid unbound code) regains access without the administrator explicitly restoring them. Needs an administrator-issued invitation.
- **Remediation (Recommendation).** Refuse acceptance for any existing membership row regardless of status.
- **Blocks Railway:** No.

### SEC-14 Low: bodies read before size check; unbounded lists

- **Evidence (Verified).** `readBody` calls `request.text()` then checks `text.length > 4096` (`registry/http.ts:36-38`); the `web` proxy does the same with 8 KiB (`route.ts:23-24`). The streaming limiter `readJsonBody` (1 MB) exists but is used only by the sandbox routes (`guards.ts:42-62`). List endpoints have no pagination and load the entire organization activity log (`registry/http.ts:148, 157-160`); no per-user or per-organization creation caps.
- **Impact.** Memory pressure from large bodies; slow responses and storage growth under abuse. Next route handlers apply no default body limit (**Unknown** for the pinned version; platform edges may limit).
- **Remediation (Recommendation).** Reject by `Content-Length` and stream-limit; add pagination and caps; paginate activity by `seq`.
- **Blocks Railway:** No.

### SEC-15 Low: `web/proxy.ts` matcher and sample-data switch

- **Evidence (Verified).** `matcher: ["/((?!api/|_next/|.*\\..*).*)"]` (`web/proxy.ts:99`) excludes any path containing a dot, so a page URL such as `/sessions/abc.def` is not gated server-side (the client `AppGate` and the API still enforce). `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` (build-time) makes the proxy return `next()` for everything (`proxy.ts:86`) and switches the UI to the fictional adapter.
- **Impact.** The markup of the authenticated shell can be requested without a session in the dotted-path case; data requires the API. A mis-set build variable would disable the redirect gate.
- **Remediation (Recommendation).** Match on static file extensions explicitly; fail the production build if `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` is set.
- **Blocks Railway:** No.

### SEC-16 Low: audit-log integrity relies on triggers only

- **Evidence (Verified).** `activity` and `auth_audit` have `BEFORE UPDATE/DELETE` triggers that abort (`database.ts:108-109, 604-605`); no hash chain; an actor with database access can drop the triggers (acknowledged, wallet-first-auth review residual 9). `auth_sessions` and `rate_events`/`auth_challenges` grow or are cleaned opportunistically; expired sessions are never removed.
- **Impact.** Tamper evidence is limited to anyone without database privilege. **No HTTP path** can update or delete these rows (Verified: no such route).
- **Remediation (Recommendation).** Restrict database credentials to the application role without `TRIGGER`/`DDL` rights in PostgreSQL; consider periodic anchoring of a hash of the log; add retention jobs for sessions.
- **Blocks Railway:** No.

### SEC-17 Low: non-product surfaces in the production bundle

- **Evidence (Verified).** `app/api/w0`, `app/w0`, `app/page.tsx` (sandbox console, `components/console-app.tsx` using `innerHTML` with an escaping helper `esc`, `lib/console/view.ts:13`), `app/api/{bootstrap,rpc}` are part of the console build.
- **Impact.** Larger attack surface and confusion; they are inert in a hosted deployment today (see SEC-01) but depend on the Host guard.
- **Remediation (Recommendation).** Gate or exclude them in production builds.
- **Blocks Railway:** No.

### SEC-18 Informational: `raw` signature scheme

The organization ownership proof accepts `raw` (signature over the message bytes) as well as `sep-53` (`registry/service.ts:777`); sign-in accepts only `sep-53` (`auth/service.ts:215`). The signed text always begins with a fixed Tobin title and a statement that it signs no transaction, so a `raw` signature cannot be confused with a transaction hash in the way an unrestricted `raw` scheme could (**Inference**). Consider removing `raw` once Freighter `signMessage` is confirmed for that flow.

### SEC-19 Informational: cookie handling

`web` forwards the browser's whole `Cookie` header to the console (`route.ts:19-20`), while the console only reads `tobin_session`. The cookie is host-only and `HttpOnly; SameSite=Strict; Secure` in production but not `__Host-` prefixed (`auth/http.ts:20-21`). Forward only `tobin_session`; consider the prefix.

### SEC-20 Informational: dependencies and CI

- **Verified.** Direct dependencies are exact-pinned (`next 16.4.3`, `react 19.3.0`, `@stellar/stellar-sdk 17.4.0`, `@stellar/freighter-api 6.0.1` in `console/package.json`; `web` adds React Query, TanStack Table, Radix, Zod, Playwright dev, and similar with caret ranges for several). CI installs with `npm ci --ignore-scripts` and checks a dependency baseline against the lockfile (`ci.yml`). No `dependabot.yml` and no `npm audit` step were found (the `.github` listing has `CODEOWNERS`, templates, workflows). `apps/web` unit and Playwright tests are not run by any workflow found (**Verified** by search; three workflows not opened).
- **Not done.** No install, audit or network call was made in this review.
- **Unknown.** Whether `node:sqlite` is still experimental in the pinned Node 24 patch.
- **Recommendation.** Add scheduled dependency updates and a lockfile audit; run `apps/web` tests in CI; pin the Node patch version.

## 5. Topic-by-topic review

### 5.1 Authentication and sessions
Opaque 256-bit token, SHA-256 at rest, `HttpOnly; SameSite=Strict; Secure`, idle/absolute limits for wallet sessions, rotation, revocation, wallet-bound sessions: see `authentication-and-authorization.md`. Weaknesses: SEC-04, SEC-05, SEC-06; no idle timeout for password sessions; no MFA; no password reset.

### 5.2 Authorization bypasses and BOLA/IDOR (per endpoint family)
**Method:** read every branch of `handleRegistry` (lines 55-299) and each service method it calls; checked that the organization id from the URL passes `#need`/`#opSession`/`session()` and that child ids are matched to their parent.

| Endpoint family | BOLA/IDOR result |
|---|---|
| Organizations, members, reviewers, invitations, wallets | org-scoped by `#need`; target ids looked up inside the organization's own lists (`membershipsOfOrg`, `invitationsOfOrg`); invitation revoke checks `orgId` (`service.ts:172`). No bypass found. |
| Sessions, participants | `session()` verifies `s.orgId === orgId` (`service.ts:231-236`); participants must be active members of the same organization. No bypass found. |
| Obligations | `#own(sessionId, id)` verifies `o.sessionId === sessionId` (`service.ts:405-409`) after the session's organization is verified. No bypass found. |
| Calculations, authorization | latest calculation of the session; decisions keyed by calculation; reviewer + SoD. No bypass found. |
| Settlement batches, executions, attempts | `#batchOf(sessionId, batchId)` searches within the session (`service.ts:676-679`); executions are by batch id after the batch check. No bypass found. |
| Wallet challenges | `c.orgId === orgId && c.userId === user` (`service.ts:776`). No bypass found. |
| Signer-set history | queried by `(orgId, network, account)` (`sqlite-store.ts:139`). No bypass found. |
| Same-organization visibility (not cross-tenant) | all members can see all members' verified keys, execution accounts, full organization activity (SEC-10, observation). |

**Result:** no cross-tenant read or write was found by reading. This is a code-reading result, not a test result.

### 5.3 Cross-tenant leakage
Responses use display names substituted from ids found in the organization's own data; activity is per organization; `404` is uniform for non-members. Possible leakage: wallet existence on another account via `WALLET_UNAVAILABLE` for authenticated users (documented); `REGISTRATION_FAILED` status (SEC-05). Global tables are only the user directory (accessed through ids in the organization's data) and the supported-assets list.

### 5.4 SQL injection
**Verified:** every statement in `lib/auth/service.ts`, `lib/registry/sqlite-store.ts`, `lib/db/database.ts`, `scripts/db.ts` is a string literal with `?` placeholders. Two template-literal statements (`sqlite-store.ts:58, 79`) contain no interpolation. There are no dynamic `ORDER BY`, no dynamic `IN (...)` lists, no table or column names from input, no `exec` of strings built from input (`database.ts:663` executes the static migration text). `grep` for `${` inside `prepare(`/`#q(`/`exec(` found none. The in-memory store is not SQL. No finding.

### 5.5 Input validation
Bounded and typed per field (assessment document, section 8). Gaps: SEC-11, SEC-14, URL path ids not format-checked (they are only looked up). JSON parse errors map to `400`. Mass assignment: body fields are picked explicitly; unknown fields are ignored (test S12).

### 5.6 CSRF
SEC-03 and `authentication-and-authorization.md` section 17.

### 5.7 XSS
- `web`: no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` found (`grep` over `apps/web`). User text is rendered by React. Display names reject `<` and `>` and control characters at write time (`service.ts:95`, `registry/service.ts:36-41`).
- `console`: the sandbox page uses `root.innerHTML = renderApp(...)` with an `esc()` helper (`components/console-app.tsx:86`, `lib/console/view.ts:13`), applied in the sampled lines; the full view file was not audited line by line (**Unknown** coverage). `apps/landing/Logo.tsx` uses `dangerouslySetInnerHTML` with a constant string (**Inference**, not read in full).
- CSP: strong in `console` (nonce, `strict-dynamic`, no `unsafe-inline`; `unsafe-eval` only in development), absent in `web` (SEC-02).

### 5.8 SSRF
All server-side `fetch`/RPC targets are constants or operator configuration: Horizon and Soroban RPC constants (`lib/stellar/live.ts:7`, `rpc.ts:12`); the deployment record `rpc` URL (`owner-validation.ts:15`, operator file); the `web` proxy `TOBIN_API_URL` (environment). No URL, host, scheme or port comes from a request. The user influence is the path segment in SEC-11. `app/api/rpc` is **not** an RPC proxy: it invokes the local test-host sandbox with a prepared call against known contract ids only (`lib/server/api.ts:49-50`). The `web` proxy allows only `/api/auth|registry`, GET and POST, rejects dot-segments and `%`, and prepends a fixed backend (`proxy-policy.ts:49-61`). Decoded `?` or `#` in a segment is not rejected (**Verified**), which can alter the upstream path/query shape but not the host; the console re-authorizes everything (Informational).

### 5.9 Secrets management
`.gitignore` covers secrets and keys; `git grep` for Stellar secret-key patterns (`S` + 55 base32) over tracked files found nothing; no tracked `.env`, `.sqlite`, `.db`, `.pem`, `.key` files were found. `accounts/*.json` are tracked public records (public keys and evidence) used by owner tools (`cosign.ts:15`). The server holds no private key by design. Configuration is by environment variables (`TOBIN_DB_PATH`, `TOBIN_STELLAR_CLEARING_CONTRACT`, `TOBIN_SECOND_ACCOUNT`, `TOBIN_ADMIN_ACCOUNT_RECORD`, `TOBIN_REPO_ROOT`, `TOBIN_DEPLOYMENT_RECORD`, `TOBIN_BATCH_ID`, `TOBIN_BRIDGE_EXE`, `TOBIN_API_URL`), none a secret. `seed-demo` needs `TOBIN_DEMO_PASSWORD` and is refused in production. A release scanner exists (`scripts/release/scan.mjs`, not run). **Unknown:** git history was not scanned.

### 5.10 Logging of sensitive information
Nothing sensitive is logged (almost nothing is logged: SEC-08). `auth_audit` stores wallet public keys and event kinds, never tokens or signatures. Error responses for 500 are generic; Stellar routes return up to 160 characters of an error message to the signed-in caller (`app/api/stellar/*/route.ts`), which could include internal detail (Low, **Inference**).

### 5.11 Database access controls
SQLite file access is by filesystem permission. The app is the only writer. Foreign keys are on; CHECK constraints constrain enumerations; triggers protect history. On PostgreSQL use a least-privilege application role without DDL, run migrations with a separate role, and restrict network access. **Unknown:** file mode of the SQLite file in the intended Railway volume.

### 5.12 Webhooks
**Verified:** none exist. No inbound webhook route, no signature-verification code, no outbound webhook sender.

### 5.13 API abuse
SEC-05, SEC-06, SEC-12, SEC-14. No pagination; no per-tenant quotas; no API keys (cookie sessions only).

### 5.14 Transaction replay and duplicate execution
- Wallet challenges: single use (section 4.4 of the auth document).
- Settlement: decisions unique per calculation; one execution per batch; attempt transaction hashes unique per attempt step and globally (`service.ts:910-911`); a duplicate submission cannot be recorded; steps run in order from observed chain state with no automatic retry (owner tools; `run.ts` header); `NOT_FOUND`/timeout is an unknown outcome and blocks a new attempt until the hash is read (`retry-policy.ts`, `submitSigned` in `rpc.ts`).
- No idempotency key exists for HTTP creates (benign duplicates of drafts, organizations).
- **Not verified here:** the on-chain contract's own replay protection (out of scope; contract code was not reviewed).

### 5.15 Wallet and signing boundaries
Verified: the server holds no key; sign-in and ownership proofs sign text only; the owner tools submit only a transaction signed in the browser and only after a typed per-step confirmation, with an amount cap of one base unit and re-simulation before send (`run.ts` header, `MAX_UNITS = 1n`); `ownerToolsAllowed` limits who may drive them; no institutional role grants signing authority. Residual: confirmed on-chain outcomes are not written back to application records (AGENTS.md section 13).

### 5.16 Audit-log integrity
SEC-16. Additionally: `activity` is organization-visible to every member, so members can read all actions and ids in their organization.

## 6. Proxy and gate review (`apps/web`)

| Item | Result | Evidence |
|---|---|---|
| Path normalisation | allow-list `^/api/(auth|registry)(/|$)`; rejects `..`, `.`, `/`, `\`, `%` in segments; Next decodes params first so `%2e%2e` becomes `..` and is refused; decoded `?`/`#` not rejected (Informational) | `lib/proxy-policy.ts:49-61` |
| Methods | GET and POST only | `proxy-policy.ts:56` |
| Header forwarding | only `accept`, `cookie`, and for POST `content-type` and `x-tobin-request`; no `Host`, `Origin`, `X-Forwarded-*`, `Authorization` | `route.ts:18-27` |
| Cookie forwarding | whole `Cookie` header (SEC-19) | `route.ts:19-20` |
| Response headers | only `content-type`, `cache-control: no-store`, `nosniff`, and every upstream `Set-Cookie`; no leakage of other upstream headers | `route.ts:36-37` |
| Host header | derived from `TOBIN_API_URL`; the console demands loopback (SEC-01) | `route.ts:8, 31` |
| Client IP | not forwarded (SEC-06) | `route.ts` |
| Redirect handling | `redirect: 'manual'`; upstream status is passed through, the proxy does not follow redirects | `route.ts:31` |
| Body limit | 8 KiB after full read (SEC-14) | `route.ts:23-24` |
| Open redirect via `next` | `safeNext` accepts only a same-origin absolute path (`^/(?![/\\])`, no control characters, not `/sign-in`, max 512 chars); used server-side in `decideAccess` and client-side in sign-in; `NextResponse.redirect(new URL(decision.to, request.url))` takes a path only. No open redirect found. | `lib/access/decide.ts:118-124, 135`; `sign-in/page.tsx:63`; `ConnectWallet.tsx:51` |
| Page gate | `web/proxy.ts` calls `GET /api/auth/me` with the session cookie; unreachable console means signed out (fail closed); `x-tobin-auth` request header is overwritten server-side | `web/proxy.ts:71-95` |
| Gate coverage | matcher skips dotted paths and `api/`, `_next/` (SEC-15); `AppGate` is a client fallback | `web/proxy.ts:99`; `(app)/layout.tsx` |
| Redirect origin | `new URL(path, request.url)`; behind a platform edge `request.url` depends on the `Host`/forwarded headers Next trusts. **Unknown** on Railway. | `web/proxy.ts:90` |

## 7. Console `proxy.ts` guards
`console/proxy.ts` is sound for its purpose: Host allow-list first, then foreign-Origin on `/api/`, then JSON-only POST, then CSP nonce (`proxy.ts:9-29`). Tests (`guards.test.ts`) cover host, origin, content type, port parsing, streaming body limit, CSP directives and static headers. The same code is the deployment blocker in SEC-01 and the only access control on the sandbox/W0 routes.

## 8. What changes with a public Railway deployment

| Topic | Today | Required change or decision |
|---|---|---|
| Host guard | loopback only (403 otherwise) | configurable allow-list; or keep the console private and co-located (SEC-01) |
| Bind address | `127.0.0.1` | `0.0.0.0`/`::` via the platform start command |
| `PORT` | read by guard as the only port | platform injects it; allow-list must include the exact private host:port used by `web` |
| Public edge | none | TLS terminated by Railway; production cookies `Secure`; set `NODE_ENV=production` (also required for `TOBIN_DB_PATH` fail-closed) |
| Client IP | not available | trust exactly one forwarded hop; pass the IP to the console through a header the console trusts only from `web` |
| Security headers | console yes, `web` no | add to `web` (SEC-02) |
| Persistence | local SQLite file | one replica + volume or PostgreSQL (see assessment section 22) |
| Sandbox/W0 | present | exclude from production |
| Owner Stellar tools | read repo-relative files; in-memory maps | disabled or explicitly configured; one replica |
| Secrets | none in the app | none required by the code; database URL (if PostgreSQL) becomes the first secret |
| Backups, logging, alerts | none | needed (SEC-08) |
| Registration | open | decide open vs invitation-only before launch (SEC-05, SEC-06) |

## 9. What was checked and found sound

- Parameterised SQL everywhere; no dynamic identifiers; migrations are static and transactional (`database.ts:652-669`).
- Server-side authorization in the service layer on every organization-scoped method; uniform `404`; child-object scoping; no client-supplied identity; no route to set chain provenance or execution state.
- Cryptography choices: scrypt with stored parameters and bounded cost on read, constant-time compare, dummy hash for unknown emails, 256-bit session tokens hashed at rest, ed25519 verification with exact length checks, server-rebuilt challenge text, single-use guarded consumption, burn after repeated failures.
- Session handling: rotation on sign-in, revocation on wallet removal and logout-all, absolute caps, `HttpOnly`/`SameSite=Strict`/`Secure` cookie.
- Fail-closed configuration: no backend without `TOBIN_DB_PATH` in production; in-memory path refused; development identity provider cannot exist in production; W0 development identity refused on hosted markers; Testnet-only for sign-in and ownership proofs.
- Immutable history tables and invalidation of dependent approvals on change; separation of duties for decisions.
- Owner Stellar tools: gated by header, session and verified-wallet allow-list; outbound URLs constant; amount capped; no key held.
- No XSS sinks found in `web`; strong CSP on the console; open-redirect handling is correct.
- No secret keys or database files tracked in Git (by search; history not scanned).
- No webhooks, so no webhook-verification surface.

## 10. What could not be verified

- Anything that needs a running system: actual headers, cookie behaviour behind Railway's edge, redirect origins, performance and timeouts.
- Freighter `signMessage` behaviour for the sign-in flow against the real extension; whether it binds origin.
- The contents of three workflow files, the full UI component tree, git history, the `scripts/release/scan.mjs` result, contract code.
- Public Suffix List status of the Railway domain (affects SEC-03's likelihood).

## 11. Recommended order (Recommendation)

1. SEC-01 topology and guard configuration (decision, then code).
2. SEC-02 security headers on `web`; SEC-03 proxy checks.
3. SEC-05, SEC-06, SEC-08 before open sign-up or any real user.
4. SEC-04 email verification or wallet-bound invitations; SEC-07 public-origin domain.
5. SEC-11, SEC-12, SEC-13, SEC-15 small fixes.
6. SEC-09, SEC-16, SEC-20 as part of the PostgreSQL and operations work.

An independent review of authentication, session handling, the proxy, and the settlement preparation rules is advisable before any pilot; none has been performed.
