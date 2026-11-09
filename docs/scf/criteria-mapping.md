# SCF criteria mapping

Status: maps the SCF Build Award rules and the Open Track guidance to the documents in this package. Prepared 2026-11-09.
Evidence basis: the SCF handbook pages named below (read on 2026-11-09) and the Open Track guidance image supplied by the project owner. The handbook is the authority; if it changes, it wins over this page.

Tobin is applying to the **SCF Build Award, Open Track**. The Open Track is a track within SCF Build, so the Build Award rules (funding, tranches, deliverables, eligibility) apply, and the Open Track guidance adds what a good submission contains. Three kinds of statement appear in this package and are labelled wherever they matter:

| Label | Meaning | Source |
|---|---|---|
| **Official** | a requirement or rule published by SCF | [Build Award](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award) (updated 01/9/2026), [Submission Criteria](https://stellar.gitbook.io/scf-handbook/scf-awards/scf-build/submission-criteria), [Budget and Deliverable Guidelines](https://stellar.gitbook.io/scf-handbook/scf-awards/scf-build/budget-and-deliverable-guidelines) (the last two pages show no date) |
| **Guidance** | what SCF says makes a good Open Track submission (not a checklist) | the owner-supplied image "What Makes a Good Open Track Submission" (11 points) |
| **Our recommendation** | how this repository chooses to document and evidence the project | this package |

## 1. Official Build Award rules that shape the submission

| Rule (official) | Where Tobin answers it | State |
|---|---|---|
| Award up to $150,000 in XLM; typically 3 to 6 months, not over 6 | [budget-and-timeline](product/budget-and-timeline.md) | total and timeline need the owner |
| Four installments: Tranche 0 10% on acceptance (no deliverable), Tranche 1 20% (MVP), Tranche 2 30% (Testnet or equivalent), Tranche 3 40% (Mainnet launch or equivalent); three tranches recommended and adjustable | [roadmap](product/roadmap.md) | mapped without a Mainnet tranche (OUR PROPOSAL); costs need the owner |
| The handbook says the final tranche is normally a Mainnet launch; jurisdiction-specific restrictions may modify this, for example a Testnet-only final tranche | [roadmap](product/roadmap.md) section 4: the **team's scope** is Stellar Testnet only, with a Testnet-only final tranche (controlled institutional usage on Testnet); Mainnet is not authorized, not built and not part of this submission | stated; whether SCF accepts a Testnet-only final tranche is SCF's decision |
| Each tranche is submitted within 90 calendar days of the previous payment or the balance is forfeited | [budget-and-timeline](product/budget-and-timeline.md) | stated |
| Deliverables are specific, verifiable and carry a cost each | [roadmap](product/roadmap.md) | deliverables and verification methods written; costs need the owner |
| Technical architecture complete at application; a clear Stellar use case and integration explanation | [architecture](technical/architecture.md), [technical specification](technical/technical-specification.md), [Stellar integration](technical/stellar-integration.md) | written from the code |
| Open-source plan for smart contracts | [roadmap](product/roadmap.md), contracts are in this repository under the licence in `LICENSE` | plan stated; licence scope decisions are release gates G02 and G03 |
| Tranche 2 requires a threat model and an on-chain monitoring plan | [threat model](security/threat-model.md), [monitoring plan](security/monitoring-plan.md) | drafted from the current system; thresholds and alert channels need the owner |
| Budget covers development only; audit costs are ineligible (Audit Bank); no marketing, legal fees or reimbursement of past work | [budget-and-timeline](product/budget-and-timeline.md); completed milestones are shown as existing work, not as deliverables | stated |
| A submission needs a roadmap and milestone plan, budget across tranches, current traction and team information; reviewers assess only what the submission contains | the documents in this package, [team](product/team.md) | team facts need the owner |
| Panel criteria: ecosystem value, technical feasibility, roadmap clarity, team capability | [PRD](product/prd.md), [market analysis](product/market-analysis.md), [roadmap](product/roadmap.md) | written; value claims are limited to what the evidence supports |

The handbook does not name a PRD. The PRD in this package is our recommendation.

## 2. Open Track guidance: the 11 points

| # | Guidance | Document(s) | Evidence it rests on | Gaps and owner inputs |
|---|---|---|---|---|
| 1 | Clearly scoped, technically ambitious product or protocol | [PRD](product/prd.md), [technical specification](technical/technical-specification.md) | contracts, engine, registry, tests, evidence records | none beyond review |
| 2 | Clear on-chain integration plan specific to the Stellar tech stack | [Stellar integration](technical/stellar-integration.md), [architecture](technical/architecture.md) | `contracts/`, `contracts/deployments/testnet.json`, the MVP-1.5 evidence | Testnet only; no Mainnet plan is part of this submission |
| 3 | Milestones and deliverables mapped to Mainnet deployment (SCF guidance) | [roadmap](product/roadmap.md): milestones and deliverables are mapped to a Testnet-only final tranche; Mainnet deployment is not part of this submission | milestone records, release gates | costs; the guidance point is answered with the team's Testnet-only scope, stated openly |
| 4 | Thoughtful budget reflecting team size, timeline and effort | [budget and timeline](product/budget-and-timeline.md) | the roadmap deliverables | total, team size, timeline, per-deliverable costs |
| 5 | How the solution drives on-chain growth, and how it is measured | [on-chain growth and metrics](product/onchain-growth-and-metrics.md) | contract events and entry points; the one recorded Testnet settlement as baseline | metric choices, thresholds and measurement window |
| 6 | Full disclosure of AI-generated and AI-assisted artifacts | [AI disclosure](ai-disclosure.md) | `AGENTS.md`, `CLAUDE.md`, repository verification controls | tools, models and the human review process |
| 7 | Market analysis, business and technical: differences and value | [market analysis](product/market-analysis.md) | cited public sources | business positioning, target segments, pricing |
| 8 | A unified source (like GitBook) with all development documentation: planning, roadmap, diagrams, dev artifacts, test plan, UI/UX prototypes | this package, [diagrams](diagrams/README.md), [testing and validation](implementation/testing-and-validation.md), `docs/web-redesign/` and `docs/screenshots/` for UI work; published through the docs site (`apps/docs`) | the repository | the docs site must link to this package and the other way round (not yet done) |
| 9 | Evidence that the team built and scaled similar products | [team](product/team.md) | none in the repository | everything: facts, links, commitment |
| 10 | A plan to use the network's latest strengths for long-term scalability | the "latest strengths" section of [Stellar integration](technical/stellar-integration.md) | cited Stellar developer documentation | which capabilities the team commits to |
| 11 | A video presentation showcasing the team | not a repository document | none | the owner produces it; the evidence register is its fact sheet |

## 3. What this package deliberately does not claim

Same-author evidence only; one owner-run Testnet settlement of 1 base unit; no independent security review (release gate P01 is blocked) and no fuzzing; wallet and multisig verification incomplete; resource use unmeasured; the economic benefit of netting unproven; the hosted web application does not execute settlement; Stellar Testnet only; Mainnet and real-value use are not authorized, not built and not part of this submission. See the [evidence register](implementation/evidence-register.md) and [security overview](security/security-overview.md).
