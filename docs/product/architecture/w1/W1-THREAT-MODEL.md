# W1 console threat model (W0 console plus W1 test and CI assurance)

Date: 2026-11-06. Scope: the non-executing Web Console (`apps/web-console`, `/w0`, `/api/w0/*`) backed by the mock adapter. Out of scope: the TST signer itself (see `../phase-2c/tst-signer-security-architecture.md`), any real adapter, wallets, production deployment. This is a same-author analysis, **not** an independent security review or an audit.

## 1. Assets

| Asset | Where | Why it matters |
|---|---|---|
| Integrity of the audit history | in-memory audit store | evidence of who requested and approved what |
| Integrity of approval intents (and their binding to one preview) | in-memory intent store | evidence for an operator; must not be forgeable or transferable |
| Session identity and role | in-memory session store, cookie | the only gate to read or request anything |
| The expected baseline and configuration hashes | server configuration (`deps.ts`), mock values | the trust anchor an approval is compared with |
| Signer secrets (keys, DPAPI blob, state) | **not present in the console and not reachable from it** | the console must never be a path to them |

## 2. Trust zones and boundaries

| Zone | Trust | Boundary control |
|---|---|---|
| Browser code | untrusted | every input validated server side; no secret, pin, confirmation phrase, key or XDR is ever sent to it |
| Console server (this code) | trusted to enforce policy, **not** trusted with keys | holds no key; its only downstream is the mock adapter; no process, file, socket or network API is imported |
| Mock adapter | trusted test double | deterministic; labelled mock; four-method interface |
| Signer host and the operator | outside the console | not connected in W0/W1 (no transport exists); the operator's typed confirmation stays local and is never requested by or shown in the console |
| Hosting platform / network | untrusted | loopback-only Host guard; hosted markers refuse the development identity provider |

## 3. Threats and controls

| # | Threat | Control | Verified by |
|---|---|---|---|
| T1 | A viewer or requester records an approval, or a viewer requests a preview, by calling the API directly | RBAC enforced in the service layer; denials audited | `w0-core`, `w0-auth`, `w0-http`, browser journey step 07 |
| T2 | An approver approves their own request, or impersonates another approver | `approvedBy` must equal the authenticated subject; requester must differ | `w0-approvals` |
| T3 | An approval is attached to the wrong or an unrelated preview, or reused for another requester, operation, baseline or configuration | intent names one preview; preview must exist, match requester and operation, have completed `OK` with the same baseline; one intent per preview; stored intents frozen | `w0-approvals` |
| T4 | The browser supplies or changes the "expected" hash | expected values are server constants; browser values are claims compared exactly, lowercase only; extra fields rejected; no route sets them; mock values differ from B0, B1 and the historical hash | `w0-auth`, `w0-approvals` |
| T5 | History is rewritten, contradictory or silently lost | append-only store, frozen copies, no update or delete method; reserve, audit, commit ordering with an explicit PARTIAL FAILURE event; capacity refusal; failed audit write blocks the request | `w0-core`, `w0-approvals`, `w1-store-conformance` |
| T6 | A refusal (`INTEGRITY_REFUSED`, `UNPINNED`, errors) is hidden, retried into success, or shown as readiness | refusals are normal results; nothing is retried; integrity refusals are security events; any malformed adapter result becomes `ADAPTER_ERROR`; readiness is `BLOCKED` unless every check passes | `w0-core`, `w1-adapter-contract` |
| T7 | Session theft, fixation, replay after logout, CSRF | opaque 256-bit ids, new id at each sign-in, server-side expiry and invalidation, `HttpOnly`, `SameSite=Strict`, `Secure` in production, per-session CSRF token | `w0-auth`, browser journey |
| T8 | The development identity provider is used on a hosted or remote deployment | refused when any hosted-platform marker is present; refused in production unless `W0_ALLOW_DEV_IDP=1`; loopback-only Host allow-list; always labelled DEVELOPMENT | `w0-auth` |
| T9 | Anonymous traffic fills the audit log or memory | anonymous cap before audit write; per-subject and sign-in limits; audit capacity fails closed | `w0-auth`, `w1-store-conformance` |
| T10 | A path from the console to the signer, keys, state, a shell or the network | no such import or route; closed route table; four-method adapter surface; static scans plus runtime recorders with zero calls across every scenario; the contract suite fails any adapter exposing `execute`, `sign`, `submit`, key, state, file or command members | `w0-isolation`, `w0-isolation-http`, `w1-adapter-contract` |
| T11 | Secrets, paths or stack traces leak into responses or audit | generic error bodies; redaction of adapter output and audit free text; contract suite requires redaction-stable output | `w0-http`, `w0-core`, `w1-adapter-contract`, `w1-store-conformance` |
| T12 | A mock result is mistaken for real signer evidence | `origin: "mock"` on every payload and event, MOCK labels and banners, version string contains "mock" (contract suite) | `w0-auth`, `w1-adapter-contract`, browser journey |
| T13 | A future store or adapter silently weakens the above | reusable contract and conformance suites that any implementation must pass (necessary, not sufficient) | `w1-adapter-contract`, `w1-store-conformance` |

## 4. Residual risks (not mitigated by W0/W1)

| Risk | Status |
|---|---|
| All state is in memory: restart loses audit and intents; single instance only; the PARTIAL FAILURE convention exists because the stores are not transactional | open; storage decision pending (decision paper D2) |
| No production authentication: the development provider has no credentials | open; decision paper D1 |
| A compromised console process can fabricate mock audit entries (no hash chain, no external anchor) | open; D2 |
| Hosted-environment detection is a best-effort marker list | open; backed by the loopback Host guard |
| Rate limits and sessions are per process | open; D3 |
| No path to the signer exists; when one is chosen it enlarges the attack surface and requires B2 and independent review | open; D4 |
| `Secure` cookie behaviour verified in Chrome only | open |
| The B2 process-invocation hazard in the signer (`powershell.exe`, `icacls` by bare name, inherited environment) | open; separate workstream; does not involve the console today |
| Same-author tests and analysis | open; no independent review |

## 5. Assumptions
Loopback or otherwise access-controlled use; one process; mock adapter only; the operator workflow at the signer host is unchanged and outside the console; Node 24.x; Chrome for the browser journey.
