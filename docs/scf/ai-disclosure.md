# Tobin: AI disclosure (SCF Build Award application)

Concise version for the application. The full, maintained disclosure is [`AI_DISCLOSURE.md`](../../AI_DISCLOSURE.md) in the repository root; the two agree, and the root document governs if they ever differ. Dated 2026-11-09.

## Copy-ready text

**Tools.** Tobin was developed with AI assistance. The tool we can evidence is **Claude Code** (Anthropic), a coding agent used in the developer's environment. Exact model versions and session dates are not fully recorded, because by repository policy commits carry no AI trailers. We have not evidenced use of ChatGPT/Codex, GitHub Copilot or other tools. `[OWNER INPUT REQUIRED: confirm tools, model versions and date ranges; any other tool used]`

**Engineering.** Claude Code wrote and modified application and backend code, tests, deployment files and tooling, including the hosted-mode security hardening, the persistence and tenant-isolation test suites and the public Discover API. How much of the earlier application, SDK and smart-contract code was AI-written is `[OWNER INPUT REQUIRED]`. The Tobin team set the requirements, the phase order, the security boundaries (Stellar Testnet only, no backend private keys, owner-run Stellar tools) and approved each scope-expanding action.

**Documentation and application preparation.** The documentation package in `docs/scf/`, the root README, the technical overview, the Mermaid diagrams, the implementation-truth matrix and the security and readiness reviews were drafted and corrected with Claude Code. Claims carry file-and-line evidence pointers, and unknown facts are marked as owner input rather than invented. `[OWNER INPUT REQUIRED: whether any application text outside the repository was AI-drafted]`

**Human review and verification.** The 2026-11 changes were merged by the owner through pull requests; the AI agent does not push to `main` or merge. CI runs type checks, linting, the web, console and SDK test suites, a link checker and a release scan on pull requests. Security-, authorization- and settlement-related areas follow written rules, and their behaviour is covered by tests. Reviews in the repository are the team's own and are **not** independent audits. Human review depth varies and cannot be proven line by line from the repository. `[OWNER INPUT REQUIRED: how thoroughly AI-written diffs are reviewed in practice]`

**What AI did not do.** AI did not approve architecture or security decisions, merge code, deploy settlement, sign or submit Stellar transactions, or serve as an independent audit or as evidence of on-chain results. Settlement outcomes are confirmed only by reading the chain by transaction hash. The hosted application does not execute settlement. `[OWNER INPUT REQUIRED: confirm no AI tool held signing keys or live Testnet secrets]`

**Responsibility.** The Tobin team is responsible for the accuracy, integrity, security and operation of the project and for this submission, whether or not AI tools assisted. This disclosure will be updated when tools, areas of use or the review process change.

## Claims not independently verified

- Tool use other than Claude Code, and all model versions and dates.
- The share of earlier code written by AI.
- Review depth in practice, and any disclosures already made in pull request descriptions.
- That no AI tool had access to secrets (the rules forbid it; no secret is committed; the team must confirm).
