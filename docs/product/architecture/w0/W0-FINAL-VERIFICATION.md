# W0 final verification

Date: 2026-11-06. Scope: the W0 non-executing Web Console foundation (PR #12) after the final remediation pass. Same-author evidence; no independent review has been performed. This report is not an authorization of anything: **W0 uses a mock signer adapter and does not authorize or implement real signer integration, signing, transaction submission, or deployment.**

## 1. Findings and resolutions

| ID | Finding | Resolution | Regression tests |
|---|---|---|---|
| A | An approval intent only required that *some* earlier preview existed for the same requester and operation | Intent now carries `previewRequestId`; the preview must exist, belong to the stated requester, match the operation, have a completed result with outcome `OK` and the same baseline hash, and have no intent yet; recorded intents are frozen and cannot be changed or moved | `w0-approvals` (transfer to another requester, operation or preview; every non-OK scenario; pending preview; baseline from the preview; one intent per preview; immutability) |
| B | `approval_intent_recorded` was written before persistence, so a persistence failure left a contradictory history | Reserve → audit → commit lifecycle; audit failure releases the reservation and stores nothing; a failure after the audit write is followed by an explicit `approval_intent_rejected` marked `PARTIAL FAILURE`; no mutable or deletable audit events | `w0-approvals` (success, audit failure and recovery, persistence failure after audit and recovery, failure of the rejection write, duplicate id, concurrent identical submissions, truthfulness invariant) |
| C | Development authentication could in principle become available outside local use; `Secure` cookie not set | `decideDevIdp`: hosted-environment markers refuse the provider in every mode and the override cannot change that; production needs the exact override `W0_ALLOW_DEV_IDP=1`; production cookies are `Secure; HttpOnly; SameSite=Strict`; anonymous requests are capped before they can write audit events; the audit log has a capacity limit that fails closed | `w0-auth` (decision matrix over every marker, hosted sign-in refusal, production default, labelling, cookie attributes, session id format and uniqueness, fixation, forged cookies, expiry, logout invalidation, CSRF variants, unknown identity/role, authn vs authz, anonymous cap) |
| D | Hash trust boundary needed verification and an explicit UI statement | Verified: expected hashes are server constants, user input is a claim compared exactly and in lowercase, extra fields are rejected, no route accepts or changes them, mock constants differ from B1 and both B0 hashes; the UI says they are mock development values | `w0-auth`, `w0-approvals` |
| E | Isolation review | All W0 source and routes re-reviewed (section 3); a zero-call runtime proof through the HTTP API for every scenario was added alongside the service-level one; every data payload now carries `origin: "mock"` | `w0-isolation`, `w0-isolation-http`, `w0-auth` (labelling) |
| F | No browser journey | Added `test/browser/w0-journey.mjs` (CDP, real Chrome, production build, mock scenario `ok`) | 43 checks, section 2 |
| G | Accessibility | Focused pass; fixes listed in `W0-ARCHITECTURE.md` section 10 | journey checks |

Defects found by the journey and fixed: the success notice was wiped by the list reload that followed it; and `guard` was recreated on every render, which re-ran every list reload and erased error messages as soon as they appeared (a real defect that unit tests could not see).

## 2. Test and check results (actual, run on this branch)

| Check | Result |
|---|---|
| `npm run typecheck` (root, both workspaces) | passed (exit 0) |
| `npm run build:console` | passed (exit 0); routes `/w0` and `/api/w0/[...path]` present |
| `npm test --workspace tobin-web-console` | 125 tests: **117 passed, 0 failed, 8 skipped** |
| of which W0 suites | `w0-core` 24, `w0-approvals` 21, `w0-auth` 16, `w0-http` 14, `w0-isolation` 11, `w0-isolation-http` 1: 87 tests, all passed |
| skipped (8) | the existing console tests that need the Rust bridge (`TOBIN_BRIDGE_EXE` unset locally); the CI job builds the bridge and runs them. Not run locally. |
| `npm test --workspace tobin-mvp1-sdk` | 64 tests: 55 passed, 0 failed, 9 skipped (bridge-dependent, same reason). Not affected by W0; run as a regression check only |
| W0 browser journey (`w0-journey.mjs`, Chrome, production build on loopback) | **43 of 43 checks passed**, run three times |
| link check (`scripts/ci/check-links.mjs`) | 0 broken links (re-run after this file was added: see PR checks) |
| release scan rules (`scan.test.mjs`) | 8 passed, 0 failed |
| release source-tree scan (`check-gates.mjs`, all W0 files included) | 734 files, 0 findings |
| Rust checks | not applicable (no Rust or contract file changed; verified by diff) |
| Linting | not applicable: the repository has a lint script only for `tobin-landing`, which is unchanged; no linter exists for the console |
| existing MVP-1 browser journey (`journey.mjs`) | not run (needs the Rust bridge); the `/` page and its code were not changed |
| W0 browser journey in CI | **not run by CI** (the existing browser job is separate and was not modified); documented limitation |
| GitHub Actions on this commit | see the PR; reported in the closure message |

Journey coverage: open `/w0` and labelling; development sign-in with exactly four accounts and no operator account; `HttpOnly`/`SameSite=Strict`/`Secure` cookie and no JavaScript access; readiness `BLOCKED` with all eight checks and no PASS; preview request and outcome; approver: malformed hash, wrong baseline, wrong configuration all rejected, valid intent recorded, second intent for the same preview refused; audit viewer (events visible, type filter, event detail, no secrets); viewer: disabled controls plus direct API bypass attempts (403, 403, 403 without CSRF, 404 for a nonexistent execute route) and the denials in the audit; keyboard Tab traversal and visible focus; 420 px layout without overflow on every tab; no console errors.

## 3. Isolation review result

Reviewed: route table, service, adapter and mock, identity, sessions, RBAC, approval lifecycle, audit store, readiness, validators, error handling, UI, environment handling, documentation. Verified by static scan **and** by runtime recorders (process, socket, TLS, HTTP, DNS and `fetch` entry points replaced by throwing recorders; zero calls across every mock scenario through both the service and the HTTP API; no 500 responses):

- no route or code path invokes, imports, spawns, or references the real signer, a shell, DPAPI, keys, state files, deployment configuration, or `scripts/`;
- no live RPC, signing, submission or deployment; no arbitrary filesystem or command endpoint; no secret material in any payload;
- the browser receives no baseline pin, confirmation phrase, key material or XDR; the only environment variables read are `NODE_ENV`, `W0_ALLOW_DEV_IDP`, `W0_MOCK_SCENARIO`, `PORT` (through the existing guard) and the hosted-marker names;
- every mock result is labelled mock.

Source scanning alone is not treated as proof: the runtime recorders and the closed-route tests complement it. The tests never execute, import, read, or alter the real signer or its files.

## 4. Repository integrity

Nothing under `scripts/tst-signer/**`, `contracts/`, the lockfile, any manifest, B0/B1 hash or Phase 2C evidence file was changed (diff against `main` shows none). `apps/web-console/package.json` gained one script (`test:w0-browser`); no dependency was added. Pre-existing untracked documentation files were not touched.

## 5. Limitations and unresolved items

Production IdP; durable transactional audit, intent and session storage; multi-instance support; backend-to-signer transport; deployment topology; B2 and the process-invocation hazard; independent review of W0; hosted-environment detection is best effort; `Secure`-cookie behaviour only verified in Chrome; accessibility testing limited to automated structural checks, a contrast calculation and keyboard traversal (no screen reader, no axe-class scanner); the W0 browser journey is not wired into CI; 8 console tests were skipped locally for lack of the Rust bridge. See `W0-ARCHITECTURE.md` section 8.
