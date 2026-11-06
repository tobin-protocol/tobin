# W0 entry readiness: Web Console design and non-executing integration

Date: 2026-11-06. Status of this document: hand-off, **not an implementation and not an authorization**. W0 has not started. It may start after the human merge decision on PR #11 (or on the branch, if the owner chooses).

## 1. Phase 2C dependencies

| Dependency | State |
|---|---|
| Closure record | `phase-2c/PHASE-2C-FINAL-CLOSURE-REPORT.md`: CLOSED WITH LIMITATIONS |
| Signer source with integrity gate, launcher, verifier, SDK restoration | delivered, 251 tests |
| B0 / B1 owner approval | granted 2026-11-06 (`phase-2c/B0-B1-PROJECT-OWNER-APPROVAL.md`) |
| Independent third-party review | NOT VERIFIED |
| Process-invocation hazard | BLOCKED (`phase-2c/PROCESS-INVOCATION-HAZARD.md`) |
| Deployment identity F, `deployment-config.json`, pinned configuration | do not exist |
| Authorization to execute | NOT GRANTED |

## 2. Approved integration contract

`phase-2c/tst-signer-web-console-integration-contract.md` is authoritative and is **not redesigned here**. W0 implements against it. In short: the browser talks only to the console backend; the backend calls only the launcher (`tst-signer.cjs`) with a fixed argument vector, `shell: false`, a fixed working directory, an explicit minimal environment and a timeout; the approved baseline hash is an out-of-band server setting; the typed confirmation exists only inside the local signer; audit is append-only, written by the backend and redacted.

## 3. W0 scope (allowed)

Readiness dashboard; preview request interface; approval-intent workflow (recorded evidence, expiry, requester ≠ approver, bound to a baseline hash and configuration hash); audit event viewer; authentication and authorization design; backend adapter design; local signer adapter **interface**; a **mock signer adapter**; contract tests; error and refusal presentation (`INTEGRITY_REFUSED` shown as a security event); operator documentation. Real signer preview integration only where section 8 prerequisites are met.

## 4. W0 non-goals and explicit prohibitions

W0 must not introduce: remote signing; remote key access or creation; browser-to-signer communication; remote `init` or `execute`; arbitrary command execution; a browser-supplied baseline pin; a browser-supplied typed confirmation; a generalised signing service; live transaction submission; any bypass of the local operator; endpoints that read or write the state file, the DPAPI blob, the key directory or environment variables; endpoints that return transaction XDR to be signed elsewhere. It must not require or create deployment identity F, `deployment-config.json` or a new `pinned.cjs`, run a live Stellar RPC call, or deploy anything. It must not change signer files (that changes the approved baseline; any change goes through a new candidate and owner approval).

## 5. Architecture boundaries

Browser → console backend (authenticated) → **adapter interface** → either the mock adapter (W0 default) or, later, the local launcher adapter. The adapter interface is the only seam; it exposes a closed enumeration (`getReadiness`, `requestPreview(op ∈ {deploy, mint-C, mint-D})`, `recordApprovalIntent`, `listAuditEvents`, `getResult`). Nothing else is reachable. The signer host and the console backend are separate trust zones; execution stays at the signer host in a terminal.

## 6. Required components

Adapter interface and types; mock adapter with scripted refusals (integrity refusal, unpinned, config absent, timeout, malformed output); backend routes for the five operations; authentication and role model (operator / reviewer / viewer, per contract section 3); append-only audit writer (fail closed on write error); approval-intent store; UI for readiness, preview, intents, audit; contract test suite shared by mock and (later) real adapter.

## 7. Security invariants (each needs a test)

1. No code path starts a process other than the launcher, and in W0 none starts any process.
2. Arguments come from the closed enumeration only; free text is never an argument or environment value.
3. The baseline hash and any confirmation phrase never come from, and are never shown to, the browser.
4. An intent is invalid on baseline or configuration hash change, expiry, or same requester and approver.
5. An unwritable audit log blocks the request.
6. Refusals are shown verbatim after redaction; no stack traces, paths or environment values.
7. Read-only endpoints are authenticated too.
8. The adapter environment contains no `PATH` an unprivileged user can influence (until the hazard is fixed).
9. Nothing in W0 writes to `scripts/tst-signer/**`.

## 8. Prerequisites before any real signer preview

(a) Process-invocation hazard remediated, a new baseline approved by the owner and independently verified. (b) A separate written owner authorization for preview integration. (c) Deployment configuration and pinned hash created under the owner's explicit authorization. (d) The launcher's approved baseline hash configured by the operator out-of-band. Until then, W0 uses the mock adapter only.

## 9. Acceptance criteria

Mock-adapter contract tests pass for every operation and every refusal class; an automated test proves no child-process API is imported by the console backend; audit append-only and fail-closed tests pass; the UI shows BLOCKED readiness accurately from the mock; documentation lists the prohibitions in section 4; CI green; no change under `scripts/tst-signer/**`, `contracts/` or approved manifests.

## 10. Test strategy and deployment assumptions

Unit tests for the adapter contract and intent rules; contract tests run against the mock now and the real adapter later; static test that forbidden modules (`child_process`, `fs` on signer paths, `net` clients to RPC) are absent from the backend bundle; browser journey for the UI; all with dummy data. Assumptions: the console is a separate service from the signer host; the signer host is a single Windows operator machine; no secret enters the console's configuration except the approved baseline hash (a public-record value, not a secret) and authentication settings.

## 11. Outstanding dependencies

Process-invocation remediation and B2; independent review; deployment identity and configuration (owner); owner decision on the public-path exposure; hosting and retention decisions recorded in `phase-2c/technical-decision-closure.md`.
