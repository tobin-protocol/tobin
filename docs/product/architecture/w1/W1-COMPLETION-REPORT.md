# W1 completion report

Date: 2026-11-06. Branch `feat/w1-contract-tests-and-decisions`, based on `main` at `e0a1235` (PRs #11, #12, #13 merged). Evidence is self-verification by the author; no independent review. **W1 does not authorize real signer operations, a real adapter, wallet work, execution, deployment or any production claim.**

## 1. Scope and authority

The repository contains no W1 milestone specification (the identifier "W1" in the decision register means *wallet support*, which is blocked and unrelated). The owner approved a proposed scope on 2026-11-06 in the working session (the console milestone, items W1-1 to W1-5). That approval is the authority for this work; it is recorded here and is not a repository document of its own.

## 2. Status of each item

| Item | Deliverable | Status |
|---|---|---|
| W1-1 | Reusable adapter contract suite (`apps/web-console/test/w1-adapter-contract.ts`, run by `w1-adapter-contract.test.ts` against the mock in all 8 scenarios) | **Implemented and verified** (120 tests); negative controls: five deliberately broken adapters (extra `execute` member, falsely "ready" readiness, wrong exit code, path leak, intent not stored) each failed the suite |
| W1-2 | Store conformance suites for audit, intent and preview stores (`w1-store-conformance.ts`, `.test.ts`) | **Implemented and verified** (22 tests); negative controls: stores that keep references, expose a delete member, allow commit without reservation, or expose `add` each failed the suite |
| W1-3 | W0 browser journey in CI (`.github/workflows/w0-console.yml`) | **Implemented; verified by the PR's own CI run** (section 4) |
| W1-4 | API reference and threat-model update (`W1-API-REFERENCE.md`, `W1-THREAT-MODEL.md`) | **Implemented** (documentation; same-author review only) |
| W1-5 | Decision papers D1 to D4 (`W1-DECISION-PAPERS.md`) | **Implemented as documents; the decisions are blocked on the owner** |

Nothing was changed in the W0 library code, the adapter interface, the routes, the signer, the baselines, the manifests, `pinned.cjs`, contracts or the SDK.

## 3. Local verification (commands and actual results)

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm test --workspace tobin-web-console` | 267 tests: 259 passed, 0 failed, 8 skipped (the existing Rust-bridge-dependent tests; CI runs them). Before W1: 125 / 117 / 0 / 8 |
| of which new: `node --test test/w1-adapter-contract.test.ts` | 120 passed (15 contract tests x 8 mock scenarios) |
| of which new: `node --test test/w1-store-conformance.test.ts` | 22 passed |
| `npm run build:console` | passed |
| `node scripts/ci/check-links.mjs` | 0 broken links |
| release scan (`scripts/release/check-gates.mjs`) | 0 findings |
| existing B0/signer suites | not re-run locally (no signer file changed; CI re-runs them if triggered) |
| `node test/browser/w0-journey.mjs` | not re-run locally in this pass (no UI change); it runs in the new CI job |

## 4. CI results

GitHub Actions on PR #14, all passing: "Rust, TypeScript and documentation checks" (3m50s; the console suite ran with the Rust bridge: **267 tests, 267 passed, 0 failed, 0 skipped**), "W0 browser journey (mock adapter)" (1m43s; new workflow `w0-console.yml`, real Chrome on a Linux runner, **43 of 43 checks passed**, which also shows the `Secure` session cookie is accepted by Chrome on Linux over `http://127.0.0.1`), Vercel and Vercel Preview Comments. The signer workflows did not run (no file under `scripts/` changed).

## 5. Security implications

No trust boundary changed. The new files are tests, a CI workflow (read-only token, no secrets, no deployment, mock adapter only, loopback server, throw-away browser profile) and documents. The contract suite makes it harder to weaken the adapter surface later: an adapter exposing any execute, init, sign, submit, key, state, file or command member, claiming readiness without all checks passing, leaking paths or secrets, or mislabelling a mock fails it. The store suites make it harder to weaken append-only and reserve/commit semantics. Passing either suite is necessary and **not sufficient** for production or for a real adapter.

## 6. Not implemented, deferred, blocked

| Item | State |
|---|---|
| Real adapter, signer transport, any signer call | **not implemented**; requires D4, B2, independent review and a separate written authorization |
| Production identity provider (D1), durable storage (D2), multi-instance strategy (D3), signer transport (D4) | **blocked by owner decisions**; papers provide options and recommendations only |
| B2 process-invocation hardening | deferred; separate candidate baseline and owner approval |
| Deployment identity F, `deployment-config.json`, non-null pin | not created |
| Wallet support (decision register W1), ten-ledger window | untouched |
| Public-path exposure decision, independent review | open |
| Windows-specific or cross-browser console testing, screen-reader testing | not done |

## 7. Acceptance

| Criterion | Status |
|---|---|
| Scope taken from an approved definition | met (owner approval of the proposed scope; no repository specification exists) |
| No signer, key, DPAPI, state, RPC, signing, submission, deployment | met (no such access; tests use the mock; recorders assert zero I/O) |
| Adapter contract unchanged (four methods) | met, now enforced by a reusable suite |
| New behaviour tested; existing tests not weakened | met (267 total, 0 failed; no existing test edited) |
| Documentation updated | met |
| CI | met (section 4) |
| W1 marked complete only with evidence | the decision papers are complete as documents, but W1's blocked decisions (D1 to D4) remain open: **the console is not production ready** |
