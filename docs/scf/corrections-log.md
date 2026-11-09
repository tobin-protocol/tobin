# Corrections log (SCF documentation package)

Status: log of wording corrections made on branch `docs/scf-submission-package` on 2026-11-09; nothing committed.
Evidence basis: the audit reports in `docs/scf-readiness-audit/` (treated as leads), each item re-checked against the files named below. Wording only: no hash, address, ledger number, schema field, contract code or behaviour was changed. Finding ids refer to `contradictions-and-risk-register.md` (R-) and `terminology-and-language-audit.md` (A-, S-).

## Changed files

| Path | Change and reason | Finding | Evidence checked |
|---|---|---|---|
| `contracts/deployments/testnet.json` (`recordNote`, line 79) | "the same audited build" replaced by "the same verified Testnet build artifact ... (same Wasm hash, recorded above) ... No independent security audit is claimed." No independent audit exists. | R-H01, S7 | Wasm hash `ef48373...` is recorded at lines 12 and 27 (unchanged). JSON parses. `manifestProblems()` from `scripts/release/scan.mjs` returns no problems (the wording avoids the word the scan rejects). `testnet.schema.json` types `recordNote` as a plain string. Only the string changed (`git diff`). |
| `contracts/clearing/src/lib.rs` (line 3, comment) | "not for deployment" removed; added "Deployed on Stellar Testnet only; not approved for Mainnet or production use and not independently audited." True statements kept (not v0.2, no conformance claim, test token only). | R-H03, S5 | Comment line only; no code line touched. The Testnet deployment is recorded in `testnet.json`. |
| `SECURITY.md` | GitHub private vulnerability reporting stated as the primary route; the unverifiable "checked 2026-11-07 through the GitHub API" removed; email labelled "secondary route", still stated as reaching one person. | R-M13 | Owner decision (reporting enabled, verified by API on 2026-11-09). No script reads those sentences (`scripts/release/check-gates.mjs` only references the file name). |
| `README.md` | Item 1 of "three connected things", Frontend and Backend rows, repository tree and run note now say `apps/web` is the canonical user-facing app, `apps/web-console` is the backend, API and owner-tools host, hosted app does not execute settlement, owner tools are local. | R-H02 | `apps/web/package.json` (Next 16.4.3, React 19.3.0, name `tobin-web`); `apps/web-console/lib/server/config.ts:4,35` (hosted mode); `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md` (topology update). |
| `AGENTS.md` (sections 3-4 only: mermaid subgraph title, Frontend and Backend rows) | Same correction. Invariants, restricted actions, milestone table, decision rules untouched. | R-H02 | As above. |
| `apps/web/README.md` | Opening line and Hosting paragraph (Vercel at app.tobinprotocol.xyz, console on Railway, hosted-mode limits, open registration, no signing in the hosted app); `Launch app` sentence; Discover route note and known limit (public API exists in the console; page not wired). Status paragraph kept as is. | R-H02, A15, R-M05 | `apps/web/lib/proxy-policy.ts:7`; `apps/web-console/lib/public/discover.ts`; `apps/web/lib/tobin/client.ts` (no Discover method); `apps/landing/src/components/Nav.tsx:23,29`; Railway record. Unmerged Discover work is not described as present. |
| `apps/web-console/README.md` | Intro says the app hosts the API, owner tools and sandbox and that `apps/web` is canonical; loopback sentence now distinguishes local from hosted mode. | R-H02 | `lib/server/config.ts`; Railway record (sandbox, W0, `/api/stellar/run` answer 404 when hosted). |
| `contracts/README.md` | Removed "wallet work has not been authorized" and the nonexistent `../archive/phase-a/` reference; decision ids described as not published in this repository. Wallet/multisig statement kept as incomplete. | R-M02, A18 | `ls archive` fails; README.md lines 55-57 describe Freighter signing in the owner tools. |
| `apps/landing/README.md` (line 172) and `apps/landing/src/lib/site.ts` (comment) | Docs URL is set, not `null`; the app-URL comment no longer says "local-only". Comment only. | R-M03, A12 | `site.ts` line 10 sets `docs: https://docs.tobinprotocol.xyz`; `apps/docs` exists. |
| `docs/backend-implementation/IMPLEMENTATION-STATUS.md` | P2 row: Merged (PR #50), accepted by merge; final "Owner acceptance pending" -> "Accepted by merge (PR #50)". P1 already read Merged (PR #48). PR #51 is not mentioned: its subject is not recorded anywhere I could read. | R-M01 | Owner-supplied facts; P0/P1 rows use the same "accepted by merge" convention. |
| `docs/web-redesign/verified.md` | Appended dated update table; earlier rows kept as history. | R-M04 | `apps/web/lib/tobin/client.ts:57-59,151-153`; `apps/web/lib/proxy-policy.ts:7`; `apps/web/proxy.ts`; `apps/web/app/(app)/{loading,error,not-found}.tsx`. |

Link check: `node scripts/ci/check-links.mjs` reports 0 broken links. No build, test or server was run.

## Applied by the lead after review

| File | Change | Why |
|---|---|---|
| `apps/web-console/app/layout.tsx:14` | the header line now reads "Local sandbox console for the MVP-1 contracts. Everything on this page runs in a local sandbox on this machine; the institutional application is apps/web." | the old line ("MVP-1, experimental ...") understated and mislabelled the console (R-H03) |
| `apps/web-console/test/next-server.test.ts:78` | the asserted phrase changed in step with the string ("Everything on this page runs in a local sandbox on this machine") | the same assertion on the new truthful text; no assertion was removed or weakened |

## Not changed: owner decision or action needed

| Item | Why not changed / recommendation |
|---|---|
| Sign-in page strings | The console has no sign-in string of that kind (searched `apps/web-console/app` and `components`). `apps/web/app/(auth)/sign-in/page.tsx:99` ("Experimental Stellar Testnet application. Test assets only ... not been audited.") is accurate; changing it to the standard maturity notice is a wording choice for the owner (S1, S2). |
| `scripts/multisig/governed-token.mjs` lines 19, 72, 162 and `governed-token.test.mjs:57` | Tooling; not edited. The word "audited" is a code comment, a check label (`executable is the audited token Wasm`) and an error message, and the test asserts the label. Recommend renaming to "the recorded token Wasm" in script and test together, in one owner-approved change. Same word in `docs/governance/governed-token-evidence.md:7` and `scf-contract-governance-audit.md:48`. |
| Other "audited" wording | `release/RELEASE-GATES.json:217` is a negation (keep). `apps/web-console/test/w0-*.test.ts` use "audited" for logging (keep). |
| `msg.txt` at the repository root | Tracked draft commit message (R-L02). Recommend removal; owner decides. |
| "Tobin Clearing Protocol" in `package.json:5`, `release/RELEASE-GATES.json:3` and manifests | Name decision pending; names and release-gate files untouched. |
| Landing tagline "Welcome to the Future of Institutional Clearing" (`Hero.tsx`, `apps/landing/README.md:44`) | Owner/design decision (A9). |
| Landing media (hero video, photographs) | Source and licence unverified per `apps/landing/ASSET-CREDITS.md` and `NOTICE`; owner must verify or replace before a public push (A27). |
| Other contract source headers | `contracts/token/src/lib.rs:1` and both `Cargo.toml` `description` fields still say "not for deployment" (S5). Out of the authorised edit (clearing `lib.rs` line 3 only); `Cargo.toml` edits may touch release/lock tooling. Owner call. |
| `apps/web/app/(public)/discover/page.tsx:26` banner text | Accurate; wording preference only (S2). |
| `docs/product/architecture/wallet-first-auth/WALLET-FIRST-AUTH-ARCHITECTURE.md:3` "not committed" | Historical record; not rewritten (S17). |
| `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md:3` "for a demonstration and an SCF submission" and "pilot" naming | Internal record in the lead's tree; the milestone mapping decision says a Railway deployment alone is not an institutional pilot. Suggest "Testnet demonstration deployment" there (R-H05). |
| `docs/SCF-PROJECT-POSITIONING.md`, README "Product requirements not published" line | Owner decisions tied to the PRD (A4, A25). |
| Source-comment change and Wasm | A comment change cannot alter bytecode, but the deployed-artifact hash equality was not re-checked by a rebuild (no build run). Rebuild before relying on it in evidence. |

## 2026-11-09: accuracy pass on branch `chore/scf-demo-readiness` (from `origin/main` `8b2030d`)

Wording only, in `docs/scf/`; nothing committed. Each item was re-checked against the source named in [implementation-truth-matrix.md](implementation/implementation-truth-matrix.md).

| File | Change and reason |
|---|---|
| `product/roadmap.md`, `product/budget-and-timeline.md`, `criteria-mapping.md`, `README.md`, `product/prd.md`, `product/onchain-growth-and-metrics.md`, `security/monitoring-plan.md`, `product/ai-disclosure.md`, `implementation/implementation-status.md`, `implementation/deployment-and-operations.md` | Owner decision of 2026-11-09: Mainnet is no longer a promised or gated deliverable; the scope is Stellar Testnet only. The official handbook rule is quoted accurately (final tranche normally a Mainnet launch; jurisdiction restrictions may modify it, for example a Testnet-only final tranche) and labelled OFFICIAL; "Testnet-only final tranche" is labelled the TEAM'S SCOPE; Tranche 3 is re-mapped to MVP-1.8 controlled institutional usage on Testnet and labelled OUR PROPOSAL. MVP-1.2 to MVP-1.8 names, order and statuses are unchanged. The "Mainnet gated objective" budget row was removed. |
| `product/prd.md`, `technical/api-reference.md`, `technical/ui-and-console.md`, `implementation/implementation-status.md`, `implementation/evidence-register.md` | "Web Discover screen not wired" was stale: #52 wired it and it was live-verified on 2026-11-09. Corrected, with the empty-state wording issue recorded. |
| `product/roadmap.md`, `implementation/implementation-status.md` | P2 shown as merged (#50); #51 and #52 recorded as merged; the open `[OWNER INPUT NEEDED: title and scope of PR #51]` removed because the subject is now known (public Discover API and Dockerfiles). |
| `implementation/implementation-status.md`, `implementation/deployment-and-operations.md` | Added the Vercel and Railway identities, the live-verified Discover facts, and the fixed provenance limitation (the Vercel deployment was uploaded with the CLI and records no Git SHA; the Railway deployment records no commit hash). |
| `implementation/deployment-and-operations.md` | Added section 3a: `asset-add` configures only native or classic assets and `Dockerfile.console` seeds a USD classic asset, while the execution-plan builder requires a Soroban token contract identity. |
| `implementation/evidence-register.md` (rows 12, 24, 25) | "End-to-end Testnet settlement" reworded to an owner-run execution of a hard-coded one-unit scenario; the Horizon re-read of 2026-11-09 added with its limits; deployment row no longer "Unverified" for the Discover page. |
| `implementation/testing-and-validation.md` | Added the local run of 2026-11-09 (labelled "local, not CI") and adjusted the evidence-basis sentence. |
| `technical/stellar-integration.md` | "verified Testnet build artifact" replaced by the build artifact deployed on Testnet, with the unrecorded reproducible-build comparison stated (gate E04). |
| new: `implementation/implementation-truth-matrix.md`, `implementation/testnet-engineering-evidence.md`, `implementation/demo-recording-guide.md` | The matrix, the Testnet evidence record with its verification split, and the DRAFT demo guide. |

Not changed (out of this change's ownership): `README.md` (repository root), `technical/architecture.md` and `technical/technical-specification.md`; any claim needing correction there is reported to the lead instead. `docs/backend-implementation/RAILWAY-TESTNET-PILOT.md` keeps its historical "pilot" name (a record, not a claim of an institutional pilot).
