# Tobin: AI-generated and AI-assisted artifacts disclosure

**Status:** disclosure structure for Open Track guidance point 6, dated 2026-11-09. What the repository shows is stated as fact; what only the owner knows is marked as owner input. It makes no claim about verification that the repository does not evidence.
**Evidence basis:** [`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md), [`CONTRIBUTING.md`](../../../CONTRIBUTING.md), [`.github/pull_request_template.md`](../../../.github/pull_request_template.md), `git log` author, committer and trailer data, the test suites, CI configuration and release gates.

## 1. What the repository shows about AI use

| Fact | Evidence |
|---|---|
| The repository contains instruction files written for AI coding agents: `AGENTS.md` ("instructions for AI coding agents", naming Claude Code, OpenAI Codex and GitHub Copilot) and `CLAUDE.md` (an entry point to it). | `AGENTS.md` line 1 and 3; `CLAUDE.md` |
| The repository's rule is that commits and pull requests carry **no AI attribution or co-author trailers**; significant AI assistance is to be disclosed in the pull request description instead. | `AGENTS.md` section 11; `CONTRIBUTING.md` (commit and AI sections); pull request template |
| Consequently **commit history cannot show where AI was used**. A search of the full history found no `Co-authored-by` or "generated with" line (0 matches in 204 commits), which follows from the rule and says nothing about whether AI was used. | `git log --format=%B` |
| Authors: ebubechi-ihediwa (199 commits), Kaycee276 (3), Richard Udeh (2). 35 commits have the committer GitHub (web-interface merges). | `git log --format='%an' \| sort \| uniq -c` |
| The pull request template has a field "AI assistance disclosure" asking for the tool and what it did, or "None". Past pull request descriptions are on GitHub and were not examined for this document. | `.github/pull_request_template.md` |
| `CONTRIBUTING.md` states that AI-generated code is held to the same standard as human code and that contributors must understand every line, verify what an agent says ("agents invent APIs, flags, packages and test results"), and run the tests themselves. | `CONTRIBUTING.md`, "AI-assisted contributions" |
| `AGENTS.md` and `CLAUDE.md` define restricted actions an agent may not take without explicit owner approval (Mainnet, minting, contract or signer changes, secrets, weakening controls, editing accepted evidence, network submissions) and forbid committing, pushing or merging unless asked. | `AGENTS.md` sections 11 and 12 |

The repository does not state which artifacts were AI-generated. The owner must say so below.

## 2. Disclosure by artifact category

For each category the owner supplies the facts only they know. The right-hand column records what the repository itself evidences about verification; it is not a statement that a human reviewed every item.

| Category | How AI assistance was used | Tools and models | Human review and verification performed | What the repository evidences about verification |
|---|---|---|---|---|
| Source code (TypeScript application, SDK) | `[OWNER INPUT NEEDED: which parts, and how: generation, completion, refactoring, review]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED: who reviewed, how, and whether every change was read]` | Automated suites (`node:test`) for the console, SDK and web app; real-browser journeys; typecheck; CI configuration in `.github/workflows/`. Test counts are recorded in milestone and status documents, labelled "tested locally" and same-author. Hosted CI results are not recorded (gates E01 to E05 NOT VERIFIED) |
| Smart contracts (Rust, Soroban) | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | Rust test suites under `contracts/*/tests`; digest known-answer fixtures; one Testnet run read back from the network. No independent review (gate P01 BLOCKED); no fuzzing (P04) |
| Tests | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED: whether tests were checked to fail on broken code]` | Mutation checks run by hand are recorded in some milestone documents (for example the P2 record in `docs/backend-implementation/IMPLEMENTATION-STATUS.md`); they are same-author and not systematic |
| Documentation (READMEs, architecture, milestone and security reports) | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | The terminology guide and `AGENTS.md` set wording rules against overclaiming; a link checker (`scripts/ci/check-links.mjs`) runs in CI configuration; documents are labelled with evidence levels. These are controls on wording, not proof of accuracy |
| Diagrams (Mermaid) | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | Diagrams are text in the repository and can be compared with code |
| Designs and UI | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | Browser journeys at two widths; accessibility and cross-browser review are recorded as incomplete |
| Audits, reviews and reports (security reviews, audit-style reports in `docs/`) | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | The repository calls these the author's own reviews and says they are not independent audits. If AI produced them, they are still same-author, and no independent review exists |
| This SCF documentation package | `[OWNER INPUT NEEDED: confirm how the package was drafted and who verified each claim]` | `[OWNER INPUT NEEDED]` | `[OWNER INPUT NEEDED]` | Claims carry file, line or evidence pointers so a reviewer can check them; owner inputs are marked rather than guessed |

## 3. Limits of AI-generated text and the controls that exist

AI-generated text and code can be wrong, including invented APIs, files, test results and claims. The repository has these controls:

1. A rule that confirmed settlement outcomes come from reading the chain by transaction hash, never from an API reply, a simulation or a tool's own statement (`AGENTS.md` section 6).
2. A rule that nothing is claimed beyond its evidence, with a maturity vocabulary that separates implemented, tested, Testnet-verified, independently reviewed, pilot-ready and production-approved (`docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`).
3. Source-of-truth ordering: code and tests over reports; discrepancies are reported, not silently reconciled (`AGENTS.md` section 3).
4. Automated tests, type checking, a source-tree release scan and machine-readable release gates (`release/RELEASE-GATES.json`), whose pass requires recorded approval or evidence.
5. A restricted-actions list that keeps agents away from signing, secrets, minting, Mainnet and edits to accepted evidence.
6. A rule that agents report skipped checks honestly (`AGENTS.md` section 10).

What the controls do not provide: independent verification. The same author wrote code, tests and reviews, and no independent party has reviewed the contracts, the application or the evidence. These controls reduce error; they do not prove that no AI-generated error remains.

## 4. Owner statement to complete

- `[OWNER INPUT NEEDED: overall statement of the share and nature of AI-generated and AI-assisted work across the project]`
- `[OWNER INPUT NEEDED: the human verification process in practice: who reviews diffs, whether tests are run by a human before merge, how evidence records are checked]`
- `[OWNER INPUT NEEDED: whether AI tools had access to secrets, signing keys or the live Testnet accounts (the repository rules forbid it; confirm)]`
- `[OWNER INPUT NEEDED: AI disclosures already made in pull request descriptions, with links]`
