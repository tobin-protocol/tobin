# Communication and maturity terminology

The source of truth for how Tobin describes itself and its maturity. Contributors and AI coding agents follow it whenever they write or change a project description, documentation or public-facing text. It governs **wording**. It never changes what the evidence shows: where this guide and the evidence disagree, the evidence wins and this guide is corrected.

Status of this guide: maintained documentation (Category A, see [Documentation governance](https://docs.tobinprotocol.xyz/docs/resources/documentation-governance)). Facts below were checked against the repository on 2026-11-08; re-check them before relying on them after later milestones.

## 1. The official description

**One sentence.** Tobin is institutional clearing and settlement infrastructure built on Stellar.

**Expanded.** Tobin provides an institutional framework for recording financial obligations, calculating net positions, applying authorization controls, preparing settlement instructions, and settling through Stellar. It supports structured clearing operations and controlled settlement workflows between participating institutions. Its architecture separates institutional application workflows from on-chain settlement execution, with explicit authorization, verification and operational controls.

Qualifier that must stay attached wherever execution is described: today the application records and prepares; **Testnet execution is performed by separate, owner-run tools**, and confirmed outcomes are not yet written back into the application's records.

### Positioning

Tobin is infrastructure for institutions that already move money on Stellar. It sits above Stellar's existing standards and defines no protocol token.

Do not describe Tobin as a generic payment application, a universal clearing network, a fully decentralized clearing protocol, a production-proven settlement network, or a replacement for existing financial market infrastructure. Do not imply institutional customers, production deployments, live institutions or real-value settlement. None exists in the repository.

## 2. Maturity vocabulary

These terms are **not interchangeable**. Each is earned by specific evidence.

| Term | Means | Tobin today |
|---|---|---|
| **Implemented** | The functionality exists in the codebase. | MVP-1.2 to MVP-1.5 and wallet-first authentication. |
| **Tested** | It passed the relevant automated or manual tests; state the scope. | Yes: automated unit, integration, security and persistence suites, contract tests and real-browser journeys. Same-author tests. Bridge-dependent tests are skipped without the Rust bridge, and reports must say so. |
| **Testnet-verified** | It was demonstrated against Stellar Testnet with real network interactions, and outcomes were read back from the network. | The settlement path only, and narrowly: one owner-run execution of eight transactions with multisig co-signing, read back through RPC and Horizon and compared with the approved plan (`docs/product/architecture/mvp-1.5/`). Not the whole project. Wallet-first sign-in is not Testnet-verified. |
| **Independently reviewed** | Assessed by a qualified party independent of the implementation author. | No. All reviews and evidence are by the implementing author. |
| **Pilot-ready** | The pilot acceptance criteria, operational controls, security requirements and institutional onboarding requirements are satisfied. | No. These belong to MVP-1.6 to MVP-1.8. |
| **Production-approved** | The security, operational, governance, compliance, infrastructure and deployment approvals are complete. | No. Production deployment has not been approved; the release gates for versioned and production releases are blocked (`release/RELEASE-GATES.json`). |

Rules:

- A passing test is not independent review. A component demonstrated on Testnet does not make the project Testnet-verified. Say which component.
- Never call Tobin pilot-ready or production-approved unless the acceptance criteria and the evidence support it, and the owner has recorded it.
- Say **same-author** when evidence comes from the implementing author. It is true and it is the reader's most useful fact.

### Standard maturity notice

Use this wording, or a precisely equivalent one, where a visible notice is needed:

> Tobin's core clearing and settlement workflows have been implemented and demonstrated through controlled Stellar Testnet execution. Production deployment and real-value use have not yet been approved.

Where space allows, add: *Evidence is from the implementing author, and no independent security review has been performed.* Do not drop that sentence from pages whose purpose is status or security.

## 3. Terminology by document type

Classify the text before editing it.

| Category | Examples | Rule |
|---|---|---|
| **A. Public-facing positioning** | README introduction, landing page, documentation homepage and overview pages, repository description, funding-facing summaries | Confident, precise, evidence-led. Prefer the alternatives below. Keep one visible maturity notice. |
| **B. Technical documentation** | API and contract references, security docs, architecture, developer guides, runbooks, test documentation | Precise and transparent: "current implementation scope", "outstanding validation requirements", "security considerations", "unimplemented functionality", "known operational constraints", "deployment prerequisites", "verification status". State what has and has not been demonstrated. |
| **C. Historical engineering evidence** | Milestone reports, closure and acceptance records, security reviews, test evidence, decision records | **Do not rewrite.** Preserve findings, dates, outcomes and the maturity claims made at the time. A dated explanatory note may be added. |

### Preferred wording (public-facing, where accurate)

| Instead of | Prefer |
|---|---|
| Experimental software | Pre-production institutional infrastructure |
| Experimental MVP | Implemented MVP |
| Experimental Stellar integration | Stellar Testnet settlement integration |
| Known limitations | Current scope and remaining engineering work |
| Limitations | Outstanding validation requirements |
| Not production-ready | Production deployment has not yet been approved |
| Experimental implementation | Implemented Testnet integration |
| Experimental features | Implemented capabilities |
| Future experimental work | Planned development milestones |

These are guidelines. Choose the wording that fits the sentence, and do not swap one buzzword for another.

### Terms to avoid

- **Overclaiming:** production-ready, production-proven, enterprise-grade, battle-tested, audited (without an independent audit), secure (unqualified), fully decentralized, trustless, institutional-grade, live, adopted, in production.
- **Underclaiming:** "just a prototype", "proof of concept", "toy", repeated use of *experimental* or *limitations* for implemented functionality. Keep *experimental* only where it is literally true, for example a component or a library the owner has marked experimental.
- **Invented evidence:** customers, partners, logos, volumes, endorsements, funding, regulatory approvals, audit firms.
- **Conflations:** "settled" for a prepared, signed or submitted batch; "verified" for a test that passed; "on-chain" for an application record.

## 4. Rules for describing evidence

### Testnet evidence

- Name the scope: what ran, how many times, with which accounts. Today: one owner-run execution, eight transactions, a governed test token (one base unit), multisig co-signing, Freighter in Edge.
- Say that it was Testnet, with test assets, and that the evidence is same-author.
- Do not generalize: it shows the mechanics work in that scope. It does not show production behaviour, measured resource use, fee breakdown, maximum-size sessions, second-wallet or hardware-wallet behaviour.
- Do not claim a run was independently verified because the tool read the network back. Read-back from the network is the verification method; independent review is a separate status.

### Security and validation status

- No independent security review has been performed. No fuzzing has been done. Say so plainly where status or security is the topic.
- The reviews in `docs/` are the implementing author's own and are called reviews, not audits.
- Never write "audited", "certified" or "compliant" without a named independent party and a record.

### Roadmap

The approved roadmap is fixed. Preserve the names, order and statuses exactly:

| Milestone | Description | Status |
|---|---|---|
| MVP-1.2 | Clearing Operations Foundation | Completed |
| MVP-1.3 | Institutional Clearing Authorization | Completed |
| MVP-1.4 | Settlement Preparation Engine | Completed |
| MVP-1.5 | Stellar Settlement Integration | Completed with limitations |
| MVP-1.6 | Institutional Operations and Reconciliation | Planned |
| MVP-1.7 | Security, Governance and Infrastructure Hardening | Planned |
| MVP-1.8 | Controlled Institutional Pilot | Planned |

Do not move deliverables between milestones, add milestones, or describe a completed milestone as production readiness. "Completed with limitations" is the approved status of MVP-1.5; explain it, do not rename it. Wallet-first authentication was delivered after MVP-1.5 as separate work and does not reorder the list. Ideas from the broader protocol design (collateral, Merkle commitments, deadlines, abort, default and recovery) are **not** on this roadmap and must not be described as planned milestones.

## 5. Boundaries that must stay visible

Keep these distinctions in every description. The full list with the exact labels is in [`AGENTS.md`](../AGENTS.md#6-state-and-trust-boundaries-mandatory); do not weaken them to improve tone.

- Application and session records are not on-chain records. Provenance labels (`fixture`, `local-draft`, `chain-read`, `chain-confirmed`) have exact meanings.
- API success, database persistence and simulation do not prove settlement. Signing does not prove submission; submission does not prove confirmation; a confirmation must be reconciled against the approved batch.
- Wallet address claims are not proof of ownership. Connected wallet, authenticated user, institutional role, reviewer, settlement initiator and Stellar signing authority are different things.
- The netting engine produces a default plan. The contract accepts any plan that meets its own rules and does not require the engine's output or a minimal result.
- A prepared settlement batch is an application record, not a contract object.

## 6. Examples

| Accurate | Inaccurate | Why |
|---|---|---|
| "Tobin is institutional clearing and settlement infrastructure built on Stellar." | "Tobin is a decentralized clearing network." | The application is a single-instance web app; the chain holds the settlement contract. |
| "Settlement was demonstrated on Stellar Testnet: eight owner-run transactions with multisig co-signing, read back from the network." | "Settlement is verified on Stellar." | One narrow Testnet run; not the whole system; not Mainnet. |
| "Implemented and tested; independent security review has not been performed." | "Secure and audited." | No independent review exists. |
| "Production deployment has not yet been approved." | "Not production-ready, experimental software." | Accurate, but defines the project by what it lacks. Use for status text, not as the headline. |
| "Pilot readiness depends on MVP-1.6 to MVP-1.8 and an independent security review." | "Ready for institutional pilots." | The pilot criteria are not met. |
| "The engine generates a default plan; the contract accepts any valid plan." | "The contract enforces the optimal netting result." | The contract does not require a minimal or unique plan. |
| "Testnet execution is performed by owner-run tools; outcomes are not yet written back to application records." | "The platform settles automatically." | Submission and reconciliation are manual, owner-run steps today. |

## 7. Related documents

- [`README.md`](../README.md): the project introduction and capability table.
- [`AGENTS.md`](../AGENTS.md): trust boundaries, invariants, restricted actions.
- [`docs/SCF-PROJECT-POSITIONING.md`](SCF-PROJECT-POSITIONING.md): the funding-facing description, written to this guide.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md): how to propose a change.
