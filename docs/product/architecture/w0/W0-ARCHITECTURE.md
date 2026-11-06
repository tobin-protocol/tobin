# W0 architecture: non-executing Web Console foundation

Date: 2026-11-06 (remediation pass the same day). Implements `W0-ENTRY-READINESS.md` against `../phase-2c/tst-signer-web-console-integration-contract.md`, which remains authoritative and is not redesigned here. Evidence for this document: [W0-FINAL-VERIFICATION.md](W0-FINAL-VERIFICATION.md).

> **W0 is a non-executing Web Console foundation. It uses a mock signer adapter and does not authorize or implement real signer integration, signing, transaction submission, or deployment.**

Status vocabulary used below: **Implemented and tested** (automated tests exist and were run) · **Implemented, not independently reviewed** (all of W0: same author) · **Not implemented** · **Out of scope**.

## 1. Where it lives

Inside the existing Next.js console (`apps/web-console`), namespaced so the MVP-1 sandbox page at `/` is untouched.

| Path | Role |
|---|---|
| `lib/w0/types.ts` | shared types: operations, roles, readiness, preview, approval intent, audit event, the `SignerAdapter` interface |
| `lib/w0/validate.ts` | strict, closed-shape validators (unknown keys rejected, never ignored) |
| `lib/w0/rbac.ts` | server-side permission matrix; unknown role or permission is denied |
| `lib/w0/identity.ts` | `IdentityProvider` abstraction, **development** provider, in-memory sessions |
| `lib/w0/service.ts` | the enforcement layer: authorisation, validation, audit-before-adapter, result normalisation, approval lifecycle |
| `lib/w0/mock-adapter.ts` | the only `SignerAdapter` implementation: deterministic and scripted |
| `lib/w0/readiness.ts` | pure readiness evaluation |
| `lib/w0/stores.ts` | in-memory append-only audit store, reserve/commit intent store, preview store |
| `lib/w0/redact.ts` | second-layer output redaction |
| `lib/w0/http.ts`, `app/api/w0/[...path]/route.ts` | closed route table, sessions, CSRF, rate limits; one thin catch-all route |
| `lib/w0/deps.ts` | process wiring from server configuration, development-IdP decision |
| `app/w0/page.tsx`, `components/w0/w0-app.tsx`, `app/w0/w0.css` | UI (presentation only) |

Request path: browser → `proxy.ts` (Host/Origin/content-type guards, CSP nonce) → `handleW0` (session, CSRF, rate limit) → `ConsoleService` (RBAC, validation, audit) → `SignerAdapter` (mock). There is no other seam. **Implemented and tested.**

## 2. Adapter interface and mock behaviour

Exactly four methods: `getReadiness()`, `requestPreview(request)`, `recordApprovalIntent(intent)`, `listAuditEvents(filter)`. A future adapter, separately authorised, implements this interface without changing the UI contract. It is **not implemented**.

The mock never imports signer code, starts a process, touches a file, key or DPAPI, opens a socket or contacts RPC. Its outcome is fixed at server start by `W0_MOCK_SCENARIO` (closed list: `unpinned` (default), `integrity-refused`, `refused-application`, `usage`, `timeout`, `adapter-error`, `malformed-output`, `ok`); a request cannot choose it. Mock results say so ("MOCK: ...") and every data payload carries `origin: "mock"` (readiness: `source: "mock"`).

The service normalises every adapter result and fails closed: wrong shape, unknown outcome, an exit code that does not match the outcome (`0 OK, 1 REFUSED_APPLICATION, 2 USAGE, 3 UNPINNED, 4 INTEGRITY_REFUSED`, anything else `ADAPTER_ERROR`), a mismatched `requestId`, a throw or a timeout all become failed results. Nothing is retried; an integrity refusal is also recorded as a security event.

## 3. Authentication, sessions and roles

**No production identity provider is selected and W0 is not an authentication system.** It ships `DevelopmentIdentityProvider` (fixed accounts without credentials: `dev-viewer`, `dev-requester`, `dev-requester-2`, `dev-approver`), reported as `DEVELOPMENT` in every session and in the UI.

When the development provider is available (`decideDevIdp`, `lib/w0/deps.ts`):

| Condition | Result |
|---|---|
| any hosted-platform marker in the environment (`VERCEL`, `NETLIFY`, `RENDER`, `FLY_APP_NAME`, `K_SERVICE`, `AWS_LAMBDA_FUNCTION_NAME`, `KUBERNETES_SERVICE_HOST`, and others listed in `HOSTED_ENV_MARKERS`) | **refused**, in every mode, and `W0_ALLOW_DEV_IDP` cannot override it |
| `NODE_ENV=production` without `W0_ALLOW_DEV_IDP=1` | refused: no provider, nobody can sign in |
| `NODE_ENV=production` with `W0_ALLOW_DEV_IDP=1` and no hosted marker | allowed, still labelled `DEVELOPMENT`. **Purpose: running the production build on a developer machine (loopback) for the browser journey and local review. Not a deployment mode.** |
| otherwise (`next dev`, tests) | allowed |

Defence in depth: `proxy.ts` accepts only `Host: 127.0.0.1:PORT` or `localhost:PORT`, so a remotely reachable instance rejects ordinary traffic regardless; the hosted-marker list is a best-effort list, not a proof, which is why it is not the only control. A hosted or shared deployment needs an approved production IdP first (unresolved).

Sessions are server-side; the cookie holds a 256-bit random id (`crypto.getRandomValues`), expires after 30 minutes (checked server side on every request), is destroyed on sign-out, and a new id is issued at every sign-in (no fixation). Cookie attributes: `HttpOnly; SameSite=Strict; Path=/; Max-Age=...` and **`Secure` in every production build**; only `next dev` (plain HTTP on loopback) omits `Secure`. Chrome accepted the `Secure` cookie from `http://127.0.0.1` in the browser journey; Edge and other browsers were not tested. Every non-GET request needs the session's CSRF token (`x-w0-csrf`); anonymous requests are rate limited before they can write audit events; authenticated and sign-in requests are rate limited.

| Role | May |
|---|---|
| viewer | read readiness, previews, intents, audit |
| requester | viewer rights and request a preview |
| approver | viewer rights and record an approval intent; never for their own request |
| operator | **not a web role**: the local OS account on the signer host |

Authorisation is enforced in the service layer; disabling a button is a convenience only. Unknown identities and roles fail closed. **Implemented and tested.**

## 4. Lifecycles

**Preview.** Authorise → validate against the closed operation list → reject a reused `requestId` → write `preview_requested` (fail closed) → adapter → normalise → write `preview_completed` (+ `integrity_refused` or `adapter_error`) → return. If the second write fails the result is withheld.

**Approval intent (evidence only, never authority).** An intent now names the **specific preview it is evidence for** (`previewRequestId`, a W0 addition to the contract's sketch). Checks, in order: authorise; closed-shape validation; `approvedBy` equals the authenticated approver; requester differs from approver; `baselineHash` and `configSha256` equal the server's expected values (exact, lowercase hex only); `approvedAt` within 5 minutes of the server clock; not expired; `expiresAt` after `approvedAt` and at most 24 hours later; and the referenced preview must (a) exist, (b) belong to `requestedBy`, (c) be for the same `operation`, (d) have a completed result, (e) with outcome `OK`, (f) that reported the same `baselineHash`, and (g) have no intent already. A refused, unpinned, usage, integrity-refused, timed-out, errored, malformed or still-pending preview is never evidence that an operation is ready. A recorded intent is a frozen copy: no update or delete path exists, so it cannot be moved to another requester, operation, preview, baseline or configuration. An intent never triggers the signer, never produces a typed confirmation, and cannot sign or submit.

Consequence worth knowing: with the default mock scenario (`unpinned`, which mirrors the real documented state) **no approval intent can be recorded**, by design. Use `W0_MOCK_SCENARIO=ok` to exercise approvals. This is not a conflict with the contract, which does not say a preview must fail or succeed; it is a W0 engineering rule and is documented as such. The 5-minute skew, 24-hour lifetime and one-intent-per-preview rules are likewise W0 engineering choices, not founder decisions.

**Audit lifecycle for intents.** The intent store and the audit store cannot be updated atomically, so the sequence is reserve → audit → commit, with no mutable or deletable audit events:

| Situation | Audit history | Store | Response |
|---|---|---|---|
| success | one `approval_intent_recorded` | intent visible | 201 |
| rejected by validation | one `approval_intent_rejected` (best effort) | nothing | 4xx |
| audit write fails | nothing (the log is down) | reservation released, nothing visible | 503, retry with the same id possible |
| commit fails after the audit write (defensive; a reserved id cannot normally fail) | `approval_intent_recorded` followed by `approval_intent_rejected` with detail **PARTIAL FAILURE** | reservation released, nothing visible | 500 |
| duplicate `approvalId` or second intent for a preview | one `approval_intent_rejected` | unchanged | 409 |

So `approval_intent_recorded` means "accepted and being committed"; a stored intent always has exactly one such event, and a recorded event without a stored intent is always followed by an explicit partial-failure rejection. A truly durable store with transactions would remove the need for this convention and is a production blocker (section 8). **Implemented and tested.**

The expected hashes are server configuration. In W0 they are labelled mock values (`sha256("TOBIN-W0-MOCK-BASELINE")` and `sha256("TOBIN-W0-MOCK-CONFIG")`, in `lib/w0/deps.ts`), deliberately not the approved B1 hash nor either B0 hash (a test asserts this). The browser supplies claims only; no route accepts or changes the expected values; there is no baseline approval or pinning endpoint. The UI states that these are development values and the server decides what is expected.

## 5. Audit

Fields per the contract plus `origin` (always `mock`) and a redacted `detail` for rejection reasons. The store has no update or delete method, stores frozen copies and returns copies. It holds at most 10,000 events and then refuses new ones, which blocks the requests that need an event (fail closed) instead of dropping history or growing without bound. All events are mock events; **real signer state-file events are never read or shown**. The viewer filters by actor, operation, type, outcome and time range and shows single events. The UI and this document state that these events live in server memory only.

## 6. Readiness

Eight checks, each `PASS`, `FAIL`, `BLOCKED` or `UNKNOWN`; overall is `BLOCKED` unless every check is `PASS`. The mock reports the documented real state (nothing configured) with `UNKNOWN` where W0 cannot know, and says it is mock data. `READY_FOR_PREVIEW`, in the contract's sketch, is not produced: W0 uses `BLOCKED` and `READY_FOR_OPERATOR_EXECUTION` only.

## 7. Security boundaries

No endpoint, adapter method or code path exists for `execute`, `init`, keys, state, deployment configuration, baseline approval or pinning, signing, submission, XDR, files, commands, DPAPI or environment values. The browser never receives a baseline pin, confirmation phrase, key material, XDR or a state path. W0 source imports no `child_process`, `fs`, `net`, `http` or similar module, references no signer file, and reads `process.env` only in `deps.ts`. Errors are generic. Enforced by tests (section 9).

## 8. Storage model, limitations and production blockers

| Item | State |
|---|---|
| Audit events, intents, previews, sessions, rate-limit counters | **in server memory only**: lost on restart, not durable, single process. Multi-instance operation is **unsupported** (each instance would have its own sessions, history and limits). The UI says so. |
| Mock storage as audit infrastructure | **no**: it is not production-grade audit infrastructure and must not be described as such |
| Production identity provider and operator authentication | not implemented; unresolved decision |
| Durable, transactional audit and intent storage | not implemented; unresolved decision; **production readiness stays blocked until selected and implemented** |
| Durable session storage and a shared rate limiter | not implemented; same blocker |
| Backend-to-signer transport (same host, loopback, named pipe) | not implemented; none exists in W0 |
| Deployment topology, hosting, retention | unresolved (`../phase-2c/technical-decision-closure.md`) |
| Process-invocation hazard and a new baseline (B2) | blocked; separate workstream; precondition for any real preview |
| Hosted-environment detection | best effort (marker list) plus the loopback Host guard |
| `Secure` cookie on non-Chromium browsers over http://127.0.0.1 | untested |
| Accessibility | structural checks automated, no screen-reader testing, no automated axe-class scan (section 10) |
| Independent review of W0 | not done |

## 9. Running and testing

```
npm ci --ignore-scripts                                  # repository root
npm run dev --workspace tobin-web-console                # http://127.0.0.1:8787/w0  (development identity on; cookie without Secure)
npm run build:console && W0_ALLOW_DEV_IDP=1 npm run start --workspace tobin-web-console   # production build on loopback, development identity explicitly enabled
W0_MOCK_SCENARIO=ok npm run dev --workspace tobin-web-console                              # choose the scripted outcome ('ok' allows approvals)
npm run typecheck
npm test --workspace tobin-web-console                   # includes the w0-* suites
npm run build:console && (cd apps/web-console && node test/browser/w0-journey.mjs <output dir>)   # real-browser journey (needs Chrome or Edge); not part of node --test and not run by CI
```

Suites (details and results in the verification report): `w0-core` (RBAC, validation, redaction, readiness, previews, audit), `w0-approvals` (preview binding, immutability, audit lifecycle), `w0-auth` (development-IdP boundary, cookies, sessions, CSRF, trusted hashes), `w0-http` (API, closed routes, error hygiene), `w0-isolation` and `w0-isolation-http` (static source scans and zero-call runtime proofs through the service and the HTTP API for every mock scenario). Tests use only the mock and in-memory stores; none touches the real signer, its files, or its environment.

## 10. Accessibility review (focused, not a redesign)

Done and verified in the browser journey at 1200 px and 420 px on every tab: one `h1`, no skipped heading levels, `lang` set, every control labelled, every table has a caption and column scopes, buttons named (the audit "Inspect" button names its event), no horizontal overflow, visible 3 px focus outline on keyboard focus, keyboard Tab traversal, errors and notices announced through `role="alert"` and `role="status"`, status shown as text plus a symbol (not by colour alone: PASS ✓, FAIL ✗, BLOCKED ⛔, UNKNOWN ?, SECURITY EVENT labelled in text). Computed contrast of the palette in use is 6.2:1 or better in light mode and 7.1:1 or better in dark mode for status text and tab/error fills. A defect was fixed: error text on the red fill was white (poor contrast in dark mode); it now uses the page background colour.

Not done: screen-reader testing, an automated accessibility scanner (none is installed in the repository and none was added), zoom/reflow beyond 420 px, high-contrast mode, cross-browser checks beyond Chrome.
