# Security findings status

Tracks the findings of [`docs/backend-audit/security-assessment.md`](../backend-audit/security-assessment.md) (SEC-01 to SEC-20). The audit document is the historical baseline and is **not** edited. Statuses: **Fixed** (the code change is merged on this branch and tested as stated), **Partially fixed**, **Accepted risk**, **Outstanding**. "Fixed" never means independently reviewed or production-approved: this is same-author evidence, Stellar Testnet only, and nothing was tested on Railway. Updated at the end of each phase; this version covers **P1**.

Evidence labels: **Local** = unit tests and local scripts on this branch; **CI** = hosted CI (filled in once the pull request has run); **Railway** = not applicable yet.

| ID | Severity (audit) | Status after P1 | What changed or why not | Evidence |
|---|---|---|---|---|
| SEC-01 | High | **Fixed** (hosting behaviour on Railway still Unknown) | Configurable, fail-closed Host and Origin allow-lists (`TOBIN_ALLOWED_HOSTS`, `TOBIN_ALLOWED_ORIGINS`, probe-only `TOBIN_HEALTH_HOSTS`); hosted console serves only `/api/auth`, `/api/registry` and the probes; every other route (sandbox, W0, `/api/rpc`, `/api/bootstrap`, owner tools) answers 404 even with the secret; every API request must carry the shared secret; process refuses to start without the configuration; bind address configurable | Local: `guards-hosted.test.ts`, `check-hosted-config.mjs` (37 checks) |
| SEC-02 | High | **Fixed** (real Freighter extension not tested under the policy) | Nonce CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS (hosted); no CSP violations on any checked page, signed out and signed in, with the wallet popover and Connect wallet window open | Local: `hosting.test.ts`, `check-security-headers.mjs` (52 checks) |
| SEC-03 | Medium | **Fixed** | The web proxy validates the real request (JSON, `x-tobin-request`, exact Origin, Fetch Metadata) before forwarding; it forwards the header only after validating it; `SameSite=Strict` kept | Local: unit tests, `check-security-headers.mjs`, `check-hosted-config.mjs` |
| SEC-04 | Medium | **Outstanding** | Email is still not verified. Verification and recovery are P7 | none |
| SEC-05 | Medium | **Partially fixed** | Per-address registration limit (10 per hour on the trusted address) and at most 4 concurrent password hashes. Registration is still unrestricted and still distinguishes 201 from 409; invitation control (BD-10) and enumeration resistance are P7 with U-11 | Local: `hosting-rate-logging.test.ts` |
| SEC-06 | Medium | **Fixed locally** (Railway forwarded-header behaviour Unknown) | Per-address limits for register, failed login, wallet challenge and failed wallet verification on the last `X-Forwarded-For` entry with exactly one trusted hop; forged leading entries ignored; no shared "unknown" bucket | Local: unit tests; `check-hosted-config.mjs` (forged header cannot dodge the limit) |
| SEC-07 | Medium | **Fixed** | The wallet challenge domain is the host of `TOBIN_PUBLIC_ORIGIN` in hosted mode, not the internal Host | Local: `hosting-rate-logging.test.ts` |
| SEC-08 | Medium | **Fixed** for logging; **Outstanding** for monitoring and alerting | Structured JSON lines with request id, route label, status, duration, refusal codes, guard failures and internal errors; redaction of credentials, tokens, signatures, keys, invitation codes and emails | Local: redaction tests in both apps |
| SEC-09 | Medium | **Accepted risk until P4 and P6** | One SQLite file and in-memory owner-tool state still require a single console replica | none |
| SEC-10 | Low | **Outstanding** | Execution account mapping is not shown to the batch reviewer; separate-reviewer rule (BD-08) is P7 | none |
| SEC-11 | Low | **Mitigated in hosted mode; Outstanding in code** | `/api/stellar/*` is refused by the hosted console; the unvalidated `account` in the signer-set Horizon URL is unchanged | Local: route-coverage test |
| SEC-12 | Low | **Mitigated in hosted mode** | `/api/stellar/validation` is refused by the hosted console | Local: route-coverage test |
| SEC-13 | Low | **Outstanding** | A suspended member can still be reinstated by accepting an invitation | none |
| SEC-14 | Low | **Outstanding** | Bodies are still read before the size check on the console; unbounded lists are P7 (pagination). The web proxy keeps its 8 KiB limit | none |
| SEC-15 | Low | **Partially fixed** | Hosted mode refuses `NEXT_PUBLIC_TOBIN_SAMPLE_DATA` (build and start), so the gate cannot be disabled in a hosted deployment. The matcher still skips dotted paths | Local: `check-hosted-config.mjs` |
| SEC-16 | Low | **Accepted risk** | Audit integrity rests on triggers and, from P4, privileges; no hash chain (decision BD-16; U-06 open) | none |
| SEC-17 | Low | **Fixed** (by refusal, not removal) | The hosted console refuses the sandbox, the W0 API, `/api/rpc` and `/api/bootstrap` at three layers (proxy guard, route handlers); the code is still in the build | Local: route-coverage test, `check-hosted-config.mjs` |
| SEC-18 | Informational | **Outstanding** | The `raw` scheme for organization ownership proof is unchanged | none |
| SEC-19 | Informational | **Outstanding** | Full `Cookie` header still forwarded; no `__Host-` prefix | none |
| SEC-20 | Informational | **Partially fixed** | `apps/web` lint, unit tests, build, the hosted-mode check and the browser smoke tests are now CI jobs (pending first CI run); no automated vulnerability scan | CI: see the pull request |

No penetration test and no independent security review has been performed on any of this.
