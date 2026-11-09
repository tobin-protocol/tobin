# Tobin: SCF submission documentation

Status: reviewer-facing documentation package for the SCF Build Award, Open Track. Prepared 2026-11-09.
Evidence basis: the repository at the commit that contains this package, its recorded evidence files, and the public sources cited in each document.

**Maturity notice.** Tobin is institutional clearing and settlement software for Stellar. It runs on **Stellar Testnet only**. It is in the specification and validation stage: the milestones MVP-1.2 to MVP-1.5 are complete with limitations (`AGENTS.md`, section 13), MVP-1.6 to MVP-1.8 are planned, and the scope of this submission is Stellar Testnet only (Mainnet is not authorized, not built and not part of this submission). The evidence is same-author. One owner-run Testnet settlement of 1 base unit has been recorded. No independent security review has taken place and none is claimed. The hosted web application does not execute settlement. Production deployment and real-value use are not approved.

## Start here

| If you are | Read first |
|---|---|
| an SCF reviewer deciding on the application | [criteria mapping](criteria-mapping.md), then [PRD](product/prd.md) and [roadmap](product/roadmap.md) |
| checking what exists and how it is proven | [implementation status](implementation/implementation-status.md), [evidence register](implementation/evidence-register.md), [testing and validation](implementation/testing-and-validation.md) |
| assessing the technical design | [architecture](technical/architecture.md), [technical specification](technical/technical-specification.md), [Stellar integration](technical/stellar-integration.md) |
| assessing security | [security overview](security/security-overview.md), [threat model](security/threat-model.md), [monitoring plan](security/monitoring-plan.md), and `SECURITY.md` at the repository root |
| looking at diagrams | [diagrams index](diagrams/README.md) |

## Contents

| Area | Document | Purpose |
|---|---|---|
| Mapping | [criteria-mapping.md](criteria-mapping.md) | the SCF Build Award rules (official), the Open Track guidance (11 points) and this package, side by side |
| Product | [prd.md](product/prd.md) | requirements, scope, non-goals, with current status per requirement |
| | [roadmap.md](product/roadmap.md) | completed work, MVP-1.6 to MVP-1.8, the SCF tranche mapping (our proposal), the release gates, Mainnet stated as out of scope |
| | [market-analysis.md](product/market-analysis.md) | comparable approaches, differentiation, what is unproven |
| | [onchain-growth-and-metrics.md](product/onchain-growth-and-metrics.md) | how on-chain growth would be measured |
| | [budget-and-timeline.md](product/budget-and-timeline.md) | budget framework by official tranche |
| | [team.md](product/team.md) | team and prior work |
| | [ai-disclosure.md](ai-disclosure.md) | use of AI-generated and AI-assisted artifacts and the verification process |
| Technical | [architecture.md](technical/architecture.md) | components, trust boundaries, on-chain versus off-chain, current versus planned |
| | [technical-specification.md](technical/technical-specification.md) | the rules as implemented, with code references |
| | [stellar-integration.md](technical/stellar-integration.md) | contracts, signing, submission, read-back, the network's current capabilities |
| | [ui-and-console.md](technical/ui-and-console.md) | `apps/web` (canonical) and `apps/web-console`, overlap, retirement plan |
| | [api-reference.md](technical/api-reference.md) | the institutional HTTP API |
| Security | [security-overview.md](security/security-overview.md) | controls matrix, findings status, independent review status |
| | [threat-model.md](security/threat-model.md) | the current system's threats and mitigations |
| | [monitoring-plan.md](security/monitoring-plan.md) | on-chain and operational monitoring |
| Implementation | [implementation-status.md](implementation/implementation-status.md) | per-component status and evidence |
| | [testing-and-validation.md](implementation/testing-and-validation.md) | tests, recorded runs, gates, test plan |
| | [deployment-and-operations.md](implementation/deployment-and-operations.md) | local and hosted deployment, verified versus not verified |
| | [evidence-register.md](implementation/evidence-register.md) | each claim mapped to its evidence |
| | [implementation-truth-matrix.md](implementation/implementation-truth-matrix.md) | documented claim versus actual implementation, per capability, re-read against the source |
| | [testnet-engineering-evidence.md](implementation/testnet-engineering-evidence.md) | the eight recorded Testnet transactions of the fixed scenario, with what is and is not independently verified |
| | [demo-recording-guide.md](implementation/demo-recording-guide.md) | DRAFT guide for the reviewer demonstration recording |
| Diagrams | [diagrams/](diagrams/README.md) | 12 Mermaid diagrams (13 files), current and planned drawn separately |
| Corrections | [corrections-log.md](corrections-log.md) | changes made to existing files for this package, and decisions still open |

## How to read the statements

- Every status carries evidence: a file and line, a commit, a recorded run, or a transaction recorded in the repository's evidence files. Where the repository cannot establish something, the document says so, and where the owner must supply it the text reads `[OWNER INPUT NEEDED: ...]`.
- The state families are kept apart throughout: an application record is not an on-chain record; prepared is not signed; signed is not submitted; submitted is not confirmed; confirmed means read back from the network and reconciled against the approved batch. Wallet connection, verified wallet ownership, authenticated user, institutional membership, reviewer authority and Stellar signing authority are separate things.
- The clearing contract accepts any valid settlement plan. It does not enforce that a plan equals the engine's output or that it is minimal.
- Official SCF requirements, the Open Track guidance and our own recommendations are labelled as such. The handbook is the authority.

## The unified documentation source

The public documentation site (`apps/docs`, docs.tobinprotocol.xyz) is meant to be the single reader-facing home for development documentation, and this directory is its source and evidence layer. Linking the two in both directions is still to be done; see [criteria-mapping.md](criteria-mapping.md), point 8.
