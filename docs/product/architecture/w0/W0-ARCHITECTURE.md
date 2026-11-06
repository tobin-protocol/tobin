# W0 architecture: non-executing Web Console foundation

Date: 2026-11-06. Implements `W0-ENTRY-READINESS.md` against `../phase-2c/tst-signer-web-console-integration-contract.md`, which remains authoritative and is not redesigned here.

> **W0 is a non-executing Web Console foundation. It uses a mock signer adapter and does not authorize or implement real signer integration, signing, transaction submission, or deployment.**

## 1. Where it lives

Inside the existing Next.js console (`apps/web-console`), namespaced so the MVP-1 sandbox page at `/` is untouched.

| Path | Role |
|---|---|
| `lib/w0/types.ts` | shared types: operations, roles, readiness, preview, approval intent, audit event, the `SignerAdapter` interface |
| `lib/w0/validate.ts` | strict, closed-shape validators (unknown keys rejected, never ignored) |
| `lib/w0/rbac.ts` | server-side permission matrix; unknown role or permission is denied |
| `lib/w0/identity.ts` | `IdentityProvider` abstraction, **development** provider, in-memory sessions |
| `lib/w0/service.ts` | the enforcement layer: authorisation, validation, audit-before-adapter, result normalisation |
| `lib/w0/mock-adapter.ts` | the only `SignerAdapter` implementation: deterministic and scripted |
| `lib/w0/readiness.ts` | pure readiness evaluation |
| `lib/w0/stores.ts` | in-memory append-only audit, intent and preview stores |
| `lib/w0/redact.ts` | second-layer output redaction |
| `lib/w0/http.ts`, `app/api/w0/[...path]/route.ts` | closed route table, sessions, CSRF, rate limit; one thin catch-all route |
| `lib/w0/deps.ts` | process wiring from server configuration |
| `app/w0/page.tsx`, `components/w0/w0-app.tsx`, `app/w0/w0.css` | UI (presentation only) |

Request path: browser → `proxy.ts` (Host/Origin/content-type guards, CSP nonce) → `handleW0` (session, CSRF, rate limit) → `ConsoleService` (RBAC, validation, audit) → `SignerAdapter` (mock). There is no other seam.

## 2. Adapter interface and mock behaviour

Exactly four methods: `getReadiness()`, `requestPreview(request)`, `recordApprovalIntent(intent)`, `listAuditEvents(filter)`. A future adapter, separately authorised, implements this interface without changing the UI contract. It is **not** built.

The mock never imports signer code, starts a process, touches a file, key or DPAPI, opens a socket or contacts RPC. Its outcome is fixed at server start by `W0_MOCK_SCENARIO` (a closed list: `unpinned` (default), `integrity-refused`, `refused-application`, `usage`, `timeout`, `adapter-error`, `malformed-output`, `ok`); it is never chosen by a request. Mock results say so ("MOCK: ...").

The service normalises every adapter result and fails closed: wrong shape, unknown outcome, exit code that does not match the outcome (`0 OK, 1 REFUSED_APPLICATION, 2 USAGE, 3 UNPINNED, 4 INTEGRITY_REFUSED`, anything else `ADAPTER_ERROR`), a mismatched `requestId`, a throw, or a timeout all become failed results. Nothing is retried; an integrity refusal is recorded as a security event.

## 3. Authentication and roles

No production identity provider is selected. W0 ships `DevelopmentIdentityProvider` (fixed accounts without credentials: `dev-viewer`, `dev-requester`, `dev-requester-2`, `dev-approver`), reported as `DEVELOPMENT` in every session and in the UI. It is on under `next dev`; a production build has **no** provider unless `W0_ALLOW_DEV_IDP=1` is set, and is still labelled development. Sessions are server-side, the cookie is an opaque id (`HttpOnly`, `SameSite=Strict`, 30 minutes); every non-GET needs the session's CSRF token in `x-w0-csrf`; sign-in and API calls are rate limited.

| Role | May |
|---|---|
| viewer | read readiness, previews, intents, audit |
| requester | viewer rights and request a preview |
| approver | viewer rights and record an approval intent; never for their own request |
| operator | **not a web role**: the local OS account on the signer host |

Authorisation is enforced in the service layer; UI disabling is a convenience only.

## 4. Lifecycles

**Preview.** Authorise → validate against the closed operation list → reject a reused `requestId` → write `preview_requested` (fail closed) → adapter → normalise → write `preview_completed` (+ `integrity_refused` or `adapter_error`) → return. If the second write fails the result is withheld.

**Approval intent (evidence only, never authority).** Authorise → validate shape → checks: `approvedBy` equals the authenticated approver; requester differs from approver; `approvalId` unused; `baselineHash` and `configSha256` equal the server's expected values; `approvedAt` within 5 minutes of now; not expired; `expiresAt` after `approvedAt` and at most 24 hours later; a preview request by that requester for that operation exists. Then audit, then store. Rejections are audited. The 5-minute skew, 24-hour lifetime and the "matching preview" rule are **W0 engineering choices**, not founder decisions. An intent never triggers the signer, never produces a typed confirmation, and cannot sign or submit.

The expected hashes are server configuration. In W0 they are labelled mock values (`sha256("TOBIN-W0-MOCK-BASELINE")` and `sha256("TOBIN-W0-MOCK-CONFIG")`, in `lib/w0/deps.ts`), deliberately not the approved B1 hash. The UI does not display the server's values: an approver enters them from their own independent record.

## 5. Audit

Fields per the contract (`eventId`, `timestamp`, `actor`, `role`, `requestId`, `type`, optional `operation`, `baselineHash`, `configSha256`, `outcome`, `exitCode`, `adapterVersion`) plus `origin` (always `mock`) and a redacted `detail` for rejection reasons. The store has no update or delete method, stores frozen copies and returns copies. All events are mock events; **real signer state-file events are never read or shown**. The audit viewer filters by actor, operation, type, outcome and time range and shows single events.

## 6. Readiness

Eight checks (`sdk_restored`, `baseline_matches_approved`, `approved_baseline_configured`, `deployment_config_present`, `deployment_config_pinned`, `state_present`, `key_file_present`, `rpc_reachable`), each `PASS`, `FAIL`, `BLOCKED` or `UNKNOWN`. Overall is `BLOCKED` unless every check is `PASS`. The mock reports the documented real state (nothing configured) with `UNKNOWN` where W0 cannot know (it never reads the signer directory or contacts a network), and says it is mock data. `READY_FOR_PREVIEW`, which the contract's sketch lists, is not produced: W0 uses only `BLOCKED` and `READY_FOR_OPERATOR_EXECUTION`.

## 7. Security boundaries

No endpoint, adapter method or code path exists for `execute`, `init`, keys, state, deployment configuration, baseline approval or pinning, signing, submission, XDR, files, commands, DPAPI or environment values. The browser never receives a baseline pin, confirmation phrase, key material, XDR or a state path. W0 source imports no `child_process`, `fs`, `net`, `http` or similar module, references no signer file, and reads `process.env` in `deps.ts` only. Errors are generic; output is redacted twice (signer layer in future, W0 layer now). Enforced by tests (section 9).

## 8. Known limitations and unresolved decisions

| Item | State |
|---|---|
| Production identity provider and operator authentication | unresolved; development provider only |
| Production audit and intent storage | unresolved; in-memory, lost on restart, single process |
| Backend-to-signer transport (same host, loopback, named pipe) | unresolved; none exists in W0 |
| Deployment topology, hosting, retention | unresolved (`../phase-2c/technical-decision-closure.md`) |
| Process-invocation hazard and a new baseline (B2) | blocked; separate workstream; a precondition for any real preview |
| Rate limiting and sessions | per-process memory; not suitable for multiple instances |
| `Secure` cookie flag | not set (plain HTTP on loopback); a hosted deployment must set it |
| Accessibility, cross-browser review, browser journey test for the W0 UI | not done |
| Independent review of W0 | not done |

## 9. Running and testing

```
npm ci --ignore-scripts                 # from the repository root
npm run dev --workspace tobin-web-console    # http://127.0.0.1:8787/w0   (development identity is on)
npm run build:console && W0_ALLOW_DEV_IDP=1 npm run start --workspace tobin-web-console   # production build, development identity explicitly enabled
W0_MOCK_SCENARIO=integrity-refused npm run dev --workspace tobin-web-console               # choose the scripted outcome
npm run typecheck
npm test --workspace tobin-web-console       # includes test/w0-core, w0-http and w0-isolation
```

Tests use only the mock and in-memory stores. `w0-isolation.test.ts` scans W0 source for forbidden modules, signer references, dynamic execution and outbound requests, checks the adapter has exactly four methods and the API has one closed route table, and then runs every mock scenario through the full service with process, socket, HTTP, DNS and `fetch` entry points replaced by recorders, asserting zero calls. No test touches the real signer, its files, or its environment.

Prerequisites before any real signer preview are unchanged and listed in `W0-ENTRY-READINESS.md` section 8.
