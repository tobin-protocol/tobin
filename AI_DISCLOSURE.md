# AI disclosure

**Status:** maintained document. First version dated 2026-11-09. Statements marked **[Verified]** rest on evidence named in the same row or paragraph. Statements marked **[OWNER INPUT REQUIRED]** are facts only the team can confirm; they are left open rather than guessed. The concise application version is [`docs/scf/ai-disclosure.md`](docs/scf/ai-disclosure.md); the two must agree (see section 8).

## 1. Purpose and scope

Tobin is software for institutional clearing and settlement on Stellar Testnet. Readers who evaluate it, including grant reviewers, need to know which parts of the work were shaped by AI tools so they can weigh the evidence accordingly. This document covers AI assistance in:

- software development (application, SDK, backend, tests, contracts' surrounding tooling);
- technical documentation and diagrams;
- product planning and specifications;
- security and readiness reviews written by the team;
- preparation of the Stellar Community Fund (SCF) application.

It describes what happened, not an aspiration. It does not describe the maturity of the software; for that see the [README](README.md) and [`docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`](docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md).

## 2. AI tools used

| Tool | Status | Evidence |
|---|---|---|
| **Claude Code** (Anthropic's coding agent, run in the developer's terminal/IDE) | Used **[Verified]** | The repository carries instructions written for it ([`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)); the session records of the 2026-11 backend-hosting, test-foundation, public-Discover, documentation and deployment-verification work show it performing that work under the owner's direction. |
| Other Anthropic models or Claude chat products | `[OWNER INPUT REQUIRED: whether Claude chat/web was used for ideation, drafting or review]` | none in the repository |
| **OpenAI ChatGPT / Codex** | **Not evidenced.** `AGENTS.md` names Codex as a tool its rules apply to; that is a rule, not proof of use. `[OWNER INPUT REQUIRED: used or not, and for what]` | none |
| **GitHub Copilot** | **Not evidenced.** Same position as above. `[OWNER INPUT REQUIRED]` | none |
| Other AI coding, design or writing assistants | `[OWNER INPUT REQUIRED]` | none |
| AI-based features used for UI design or imagery | `[OWNER INPUT REQUIRED]` | none |

**Versions and dates.** Exact model names, versions and the dates of each session are **not fully recorded**. Repository commits deliberately carry no AI trailers (section 5), so history cannot reconstruct them. Where a version is needed it must come from the owner's tool account records, and it is left blank until then: `[OWNER INPUT REQUIRED: Claude model names/versions and approximate date ranges]`.

Contributors other than the owner appear in the history (Kaycee276: 3 commits, Richard Udeh: 2, out of 218 reachable commits; the owner's identities account for the rest). `[OWNER INPUT REQUIRED: whether the other contributors used AI tools]`

## 3. How AI was used

For each area: what AI did, and what stayed with the team. "AI-assisted" means AI produced or proposed text/code that a person then directed, reviewed and accepted. The repository cannot show line-by-line authorship; where it cannot, the row says so.

| Area | AI contribution | Team-owned decisions and checks | Evidence level |
|---|---|---|---|
| Product ideation, PRD, requirements | `[OWNER INPUT REQUIRED: extent]` The PRD and related product documents in `docs/scf/product/` were drafted with Claude Code in 2026-11 from existing repository material, with open facts left as owner-input markers. | Product direction, scope (Testnet only, no Mainnet deliverable), milestones, budget, team facts and the institutional thesis are the team's. Several scope decisions were given to the assistant as written owner decisions (recorded in `docs/scf/corrections-log.md`). | Verified for the SCF package; unknown for earlier product thinking |
| Technical specification and architecture documents | AI drafted and revised documents, diagrams and the implementation-truth matrix by reading code, and corrected earlier overstatements. | Architectural decisions (two services, PostgreSQL plan, custody model, owner-run Stellar tools, no backend private keys) were made or approved by the owner; ADR-0001 records them as owner decisions. | Verified |
| Code generation and implementation | Claude Code wrote or modified application and backend code, including the hosted-mode hardening (config guards, rate limits, CSRF, headers, logging), the store conformance and tenant-isolation test suites, the public Discover API and its wiring, and Dockerfiles. Earlier application, SDK and contract work: `[OWNER INPUT REQUIRED: how much was AI-written, with which tools]`. The repository's milestone notes refer to work "reported by the implementing agent", which indicates agent involvement in earlier phases. | The owner set the requirements, phase order and security boundaries, approved scope-expanding actions, and decided what to merge. The 2026-11 changes reached `main` through pull requests; whether every earlier commit did was not checked. | Verified for 2026-11 work; indicative only for earlier phases |
| Refactoring | Claude Code proposed and made refactors inside the work above. | Reviewed in pull requests. | Verified (limited) |
| Test generation and debugging | Claude Code wrote tests, ran them, diagnosed CI failures, and found and fixed a weak concurrency test through manual mutation checks. | The test suites are executed by CI on pull requests; a human decides to merge. Mutation checks are same-author and not systematic. | Verified |
| Security review support and threat modelling | Claude Code produced the backend audit (`docs/backend-audit/`), the security findings status and readiness reviews, and fixed identified issues. | These are the team's own reviews. **None is an independent audit.** | Verified |
| Documentation, README, diagrams | Claude Code drafted and corrected the SCF package, root README, `TECHNICAL.md` and Mermaid diagrams, with evidence pointers (file and line). | The owner reviewed, supplied wording decisions and merged. Tool-checked: relative links and the release scan run in CI. | Verified |
| Deployment and operations | Claude Code ran Railway and Vercel CLI commands under explicit owner approvals (a public console domain, secret rotation, frontend deployment) and verified results. | The owner holds the accounts and approved each step. No signing keys were involved. | Verified |
| SCF application drafting and editing | Claude Code drafted the documentation package submitted as the application material and the criteria mapping. `[OWNER INPUT REQUIRED: whether any application text outside the repository was drafted with AI]` | Final content, claims about the team and budget, and submission are the team's. | Verified for the repository package |

## 4. How AI was not used

These statements are limited to what the repository rules and records support. Where a negative cannot be proven, it says "no evidence".

- **Financial and clearing rules.** The netting rules and settlement semantics follow the contract and its specification, which the owner established; the contract accepts any valid plan and does not depend on an AI-computed result. AI did not set institutional policy. **[Verified from the contract design and ADR records]** Whether AI helped draft the original rules text: `[OWNER INPUT REQUIRED]`.
- **Approving security or architecture decisions.** AI did not approve anything. The repository rules require explicit owner approval for restricted actions (Mainnet, minting, contract or signer changes, secrets, weakening controls, network submissions) and forbid committing, pushing or merging unless asked ([`AGENTS.md`](AGENTS.md) sections 11 and 12). Merges were done by the owner. **[Verified: the agent has not merged to `main`.]**
- **Validating Stellar settlement.** A confirmed outcome must come from reading the chain by transaction hash, not from an AI statement ([`AGENTS.md`](AGENTS.md) section 6). In 2026-11 the eight recorded Testnet transactions were re-read from Horizon Testnet by a read-only request and compared with the recorded evidence; that check was run by the assistant and reported with its limits (Soroban call contents were not decoded). It is a consistency check, not independent verification. **[Verified]**
- **Deploying or approving production.** There is no production deployment of settlement. The hosted application is a Testnet pilot that does not submit Stellar transactions. Hosted deployments were made by the assistant only on explicit owner approval. **[Verified]**
- **Independent audit.** No independent security audit or code review exists. AI-written reviews are same-author. **[Verified]**
- **Generating on-chain evidence.** The Testnet transactions were produced by the project's owner-run tooling and the transaction ledger; the evidence files record them. AI did not fabricate or sign transactions. Whether any Testnet run was performed or driven by an AI agent in earlier phases: `[OWNER INPUT REQUIRED]`.
- **Access to secrets and signing keys.** The rules forbid it and no secret is committed (release scan). `[OWNER INPUT REQUIRED: confirm no AI tool was given signing keys or live Testnet account secrets]`. Note: during 2026-11 hosting setup a deployment CLI printed some environment variable values into the assistant's session; the affected shared secret was rotated afterwards. **[Verified]**

## 5. Human review and accountability

**What is actually done.**

1. The assistant does not push to `main` or merge; the 2026-11 changes were merged by the owner through pull requests. Earlier history was not audited for direct pushes.
2. CI runs on pull requests (type checking, linting, test suites for web, console, SDK, link check, release scan, hosted-configuration checks). A skip report rejects skipped tests. Test results from local runs are labelled local, not CI.
3. The assistant is instructed to read the code before stating a fact, to cite file and line, to report failures and skipped checks, and to stop at restricted actions ([`AGENTS.md`](AGENTS.md), [`CONTRIBUTING.md`](CONTRIBUTING.md)).
4. Security-, authorization- and settlement-related changes get special handling: the documented rules separate wallet connection, authentication, membership, role, reviewer authority and signing authority, and tests cover tenant isolation and role checks.
5. Claims in documentation carry evidence pointers and maturity labels; accuracy corrections are logged in [`docs/scf/corrections-log.md`](docs/scf/corrections-log.md).

**What is not done.** There is no independent review of the contracts, application or evidence. The same people and tools wrote code, tests and reviews. No fuzzing or external audit exists. Human review depth varies and the repository cannot prove that every line was read by a person. `[OWNER INPUT REQUIRED: how thoroughly the owner reviews AI-written diffs in practice]`

**Attribution.** By repository policy, commits and pull requests carry **no** AI attribution or co-author trailers; significant AI assistance is disclosed in the pull request description (the template has a field) and in this document. Therefore commit history alone understates AI involvement. A search of the history finds no AI trailers; that follows from the rule and must not be read as absence of AI use. Pull request descriptions on GitHub were not audited for this document. `[OWNER INPUT REQUIRED: AI disclosures already made in pull requests, with links]`

**AI is not a substitute** for an independent audit, a security review or actual Testnet verification, and nothing in the repository is presented as such.

## 6. Development-stage transparency

AI use is expected to change as the roadmap progresses. This document must be updated, in the same pull request where practical, when:

- a new AI tool or model family is introduced;
- AI starts to be used in a new area (for example test generation in CI, security tooling, operations or customer-facing features);
- the share of AI-written implementation changes materially;
- AI is introduced into testing, security or operational workflows;
- the review process for AI-written work changes materially.

A reviewer who finds AI involvement not described here should report it as a defect in this document.

## 7. Responsibility statement

The Tobin team accepts responsibility for the accuracy, integrity, security and operation of the project, and for everything it submits, regardless of whether AI tools assisted with any part of the work. Using an AI tool does not transfer responsibility to the tool or its provider.

## 8. Consistency with other documents

- [`docs/scf/ai-disclosure.md`](docs/scf/ai-disclosure.md) is the concise version for the SCF Build Award application and must state the same tools, uses, limits and open items.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md) define the process described in section 5.
- [`docs/scf/criteria-mapping.md`](docs/scf/criteria-mapping.md) maps SCF guidance point 6 to the application disclosure.

## 9. Open items needing team confirmation

1. Claude model names/versions and date ranges; whether Claude chat products were used.
2. Whether ChatGPT/Codex, Copilot or any other tool was used, and for what.
3. How much of the pre-November application, SDK and contract code was AI-written.
4. Whether AI helped draft the original clearing rules, the whitepaper-style specification or the SCF application text outside the repository.
5. Whether any AI tool had access to signing keys or live Testnet secrets.
6. Whether the other contributors used AI tools.
7. Existing AI disclosures in pull request descriptions.
8. How thoroughly AI-written diffs are reviewed in practice.
