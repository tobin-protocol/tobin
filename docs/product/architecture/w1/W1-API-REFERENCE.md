# W1 API reference: `/api/w0/*` (mock-backed console API)

Date: 2026-11-06. Describes the API as implemented in `apps/web-console/lib/w0/http.ts` and `service.ts` on `main`. **Every data response is backed by the mock signer adapter and carries `"origin": "mock"`.** Nothing here executes, signs, submits, deploys or reaches a signer. There is no execute, init, key, state, file, command, baseline-approval or deployment route, and none may be added without a separate written authorization (`../phase-2c/tst-signer-web-console-integration-contract.md` section 8).

## Common rules

| Rule | Value |
|---|---|
| Transport guards (`proxy.ts` and `handleW0`) | `Host` must be `127.0.0.1:PORT` or `localhost:PORT` (else 403 `forbidden host`); a foreign `Origin` on `/api/*` is refused (403); `POST` must be `application/json` (else 415); no CORS header is ever sent |
| Body limit | 1,000,000 bytes, counted while streaming (413 `request too large`) |
| Authentication | session cookie `w0_session` (opaque 256-bit id, `HttpOnly`, `SameSite=Strict`, `Path=/`, 30 minutes, `Secure` in production builds) except the sign-in bootstrap |
| CSRF | every non-GET request except sign-in needs header `x-w0-csrf` equal to the session's token (403 otherwise) |
| Rate limits (per process, in memory) | sign-in 20/min (global key); unauthenticated data requests 30/min (global, checked before any audit write); authenticated requests 60/min per subject; exceeding gives 429 `rate_limited` |
| Response envelope | success `{ "ok": true, "origin": "mock", ... }`; failure `{ "ok": false, "code": "<code>", "message": "<generic text>" }`; no stack, path, environment value or adapter error text is ever returned |
| Error codes | `invalid` 400, `unauthenticated` 401, `forbidden` 403, `not_found` 404, `method_not_allowed` 405, `conflict` 409, `rate_limited` 429, `internal` 500, `audit_unavailable` 503 |
| Caching | `Cache-Control: no-store` on every response |

Roles (server-enforced): `viewer` reads; `requester` = viewer + request preview; `approver` = viewer + record approval intent. `operator` is the local OS account on the signer host and is not a web role. Unknown roles and permissions are denied.

## Routes

| Method and path | Kind | Auth and role | Rate limit | Audit events written |
|---|---|---|---|---|
| `GET /api/w0/session` | read-only | none (identity bootstrap only; returns the session if a valid cookie is sent, else the identity-provider status and sign-in choices) | none | none |
| `POST /api/w0/session` | state-changing (creates a session) | none; credentials are whatever the identity provider checks (development provider: one of four fixed subjects, no secrets) | sign-in limiter | none |
| `DELETE /api/w0/session` | state-changing (destroys the session) | session + CSRF | none | none |
| `GET /api/w0/readiness` | read-only at the API; **writes an audit event** | session; viewer, requester or approver | authenticated | `readiness_checked` (fails closed with 503 if it cannot be written) |
| `GET /api/w0/previews` | read-only | session; any web role | authenticated | none |
| `POST /api/w0/previews` | state-changing | session + CSRF; **requester** | authenticated | `preview_requested` (before the adapter is reached), `preview_completed`, and `integrity_refused` or `adapter_error` where they apply; denial writes `auth_denied` |
| `GET /api/w0/approvals` | read-only | session; any web role | authenticated | none |
| `POST /api/w0/approvals` | state-changing | session + CSRF; **approver** | authenticated | `approval_intent_recorded`, or `approval_intent_rejected` (including the explicit PARTIAL FAILURE case); denial writes `auth_denied` |
| `GET /api/w0/audit` | read-only | session; any web role | authenticated | none |

Anything else under `/api/w0/` returns 404; a wrong method on a known path returns 405. A missing or expired session on a data route returns 401 and writes `auth_denied` (actor `anonymous`) unless the anonymous cap is exceeded (then 429, nothing written).

### `POST /api/w0/session`
Request: `{ "subject": "<dev subject>" }` (exactly this one key). Response 200: `{ ok, authenticated: true, principal: { subject, role }, csrf, idp: "DEVELOPMENT" }` plus `Set-Cookie`. 401 for an unknown subject or any extra key; 403 if no identity provider is enabled (production build without the override, or a hosted environment), where `GET /api/w0/session` reports `idp: "NONE"` and the reason in `idpNote`.

### `GET /api/w0/readiness`
Response 200: `{ ok, origin: "mock", report: { generatedAt, overall: "BLOCKED" | "READY_FOR_OPERATOR_EXECUTION", checks: [8 x { id, status: PASS|FAIL|BLOCKED|UNKNOWN, detail }], source: "mock" } }`. `overall` is `BLOCKED` unless every check is `PASS`. Readiness never implies execution permission; `READY_FOR_OPERATOR_EXECUTION` would only mean an operator may go to the signer host, and the mock never reports it.

### `POST /api/w0/previews`
Request: `{ "requestId": "<UUID-shaped>", "operation": "deploy" | "mint-C" | "mint-D" }` (closed shape; any other key or operation is 400). `requestId` is the idempotency key: reuse gives 409. Response 201: `{ ok, origin: "mock", preview: { requestId, operation, requestedBy, requestedAt, origin: "mock", result: { requestId, outcome, exitCode, redactedOutput, baselineHash?, summary? } } }`. `outcome` is one of `OK, REFUSED_APPLICATION, USAGE, UNPINNED, INTEGRITY_REFUSED, TIMEOUT, ADAPTER_ERROR`; a refusal is a normal 201 result, not an HTTP error. No outcome is ever retried. 503 if an audit write fails (nothing is returned for a result whose completion could not be logged).

### `POST /api/w0/approvals`
Request (closed shape, all fields required): `approvalId` (uuid), `previewRequestId` (uuid), `operation`, `baselineHash` and `configSha256` (64 lowercase hex), `requestedBy`, `approvedBy` (`[A-Za-z0-9._@-]{1,64}`), `approvedAt`, `expiresAt` (ISO UTC `...Z`). Server rules: `approvedBy` is the authenticated approver; requester differs from approver; the hashes equal the server's expected values (the browser supplies claims only); `approvedAt` within 5 minutes of server time, not expired, at most 24 hours long; the referenced preview exists, belongs to `requestedBy`, matches `operation`, completed with `OK` and reported the same baseline hash; one intent per preview. Response 201: `{ ok, origin: "mock", intent }`. 400 invalid or unmet rule, 403 role or self-approval, 409 duplicate `approvalId` or preview already has an intent, 500 explicit partial failure, 503 audit unavailable. An intent is evidence only: it is not execution authority and triggers nothing.

### `GET /api/w0/audit`
Query (all optional, each at most once): `actor`, `operation`, `type` (one of the eight event types), `outcome`, `from`, `to` (ISO UTC). Anything else, a repeated parameter or a malformed value is 400. Response 200: `{ ok, origin: "mock", events: [...] }` in insertion order. Events are this console's mock events held in memory; real signer state-file events are never read.

## Limits that apply to every route
Sessions, audit, intents, previews and rate-limit counters are in server memory only (lost on restart, single instance, not durable audit infrastructure). The identity provider is the development provider; W0/W1 is not a production authentication system. See [W1-THREAT-MODEL.md](W1-THREAT-MODEL.md) and [W1-DECISION-PAPERS.md](W1-DECISION-PAPERS.md).
