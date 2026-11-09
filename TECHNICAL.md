# Tobin: technical overview

Status: the technical entry point of the repository, 2026-11-09. It summarizes the design and points to the detailed documents in [`docs/scf/technical/`](docs/scf/technical/). Where this page and a detailed document differ, the detailed document and the code win.
Evidence basis: `contracts/`, `packages/mvp1-sdk`, `apps/web`, `apps/web-console`, `contracts/deployments/testnet.json` and the milestone records. Every status below is backed by a citation in the linked documents.

**Maturity.** Tobin runs on **Stellar Testnet only** and is in the specification and validation stage. MVP-1.2 to MVP-1.5 are complete with limitations ([`AGENTS.md`](AGENTS.md), section 13); the evidence is same-author; one owner-run Testnet settlement of 1 base unit is recorded; no independent security review has taken place; the hosted web application does not execute settlement. Production deployment and real-value use are not approved.

## What it is

Tobin is institutional clearing and settlement software for Stellar. Institutions record the payment obligations they owe each other; a deterministic engine computes net positions (net = outgoing minus incoming, positive means debtor); a reviewer approves the exact result; settlement instructions are prepared for the net amounts only; and a Soroban contract validates and executes a settlement plan that every participant has approved and every debtor has authorized. It is not an anchor, custodian, payment processor, DEX, lender or bank.

## Components

| Component | Path | Role |
|---|---|---|
| Web application (canonical UI) | `apps/web` | Next.js interface for institutions; no database; reaches the backend through a server-side proxy |
| Console | `apps/web-console` | Backend: authentication, organizations, sessions, obligations, calculations, approvals, settlement preparation, public Discover API, SQLite persistence; also the owner-run Stellar tools and a local sandbox |
| SDK and engine | `packages/mvp1-sdk` | Netting engine, digests, prepared contract calls |
| Clearing contract | `contracts/clearing` (`TobinClearingV1`) | On-chain session lifecycle (Open, Committed, Approved, Settled), plan validation, approvals, debtor-authorized transfers |
| Test token | `contracts/token` (`TobinTestToken`) | Capped Soroban token used for Testnet settlement |
| Stellar Testnet | RPC and Horizon | Simulation, submission, reads |

## What the contract does and does not enforce

The contract accepts any plan that satisfies its validity rules (values conserved, per-participant debit and credit equal to the net, strictly ordered instructions, checked arithmetic). It does **not** require the plan to equal the engine's output or to be the smallest possible plan, and it has no time limit, abort, default, recovery or administrator override. Who submits is open: submission carries no authority. The detailed list is in [`technical-specification.md`](docs/scf/technical/technical-specification.md), section 8.

## Lifecycle and where each step stands

| Step | Status today |
|---|---|
| Obligations, netting, institutional approval of the calculation, settlement preparation | implemented in the console; application records only |
| The hosted application | stops at settlement preparation |
| Signing and submission | local owner-run tools with Freighter, for a hard-coded one-unit scenario; not available in the hosted deployment |
| Read-back and comparison with the plan | implemented in the owner-run tool; results are not stored in the database |
| Writing a confirmed on-chain outcome back to application records | not implemented; no route can set `chain-confirmed` |

Application records are not on-chain records: prepared is not signed, signed is not submitted, submitted is not confirmed, and confirmed means read back from the network and reconciled against the approved batch.

## Deployment

The web application is served from Vercel and the console runs on Railway with SQLite on a volume (one replica), both Stellar Testnet only. PostgreSQL, hosted settlement execution, invitation-controlled registration and independent review are planned and not built. See [`deployment-and-operations.md`](docs/scf/implementation/deployment-and-operations.md) for what is verified and what is not.

## Detailed documents

| Document | Content |
|---|---|
| [architecture.md](docs/scf/technical/architecture.md) | components, trust boundaries, on-chain versus off-chain, current versus planned topology |
| [technical-specification.md](docs/scf/technical/technical-specification.md) | the rules as implemented, with code references |
| [stellar-integration.md](docs/scf/technical/stellar-integration.md) | contracts, signing, submission, read-back, the network's current capabilities |
| [ui-and-console.md](docs/scf/technical/ui-and-console.md) | the two applications, overlap and a retirement plan |
| [api-reference.md](docs/scf/technical/api-reference.md) | the HTTP API |
| [security overview](docs/scf/security/security-overview.md), [threat model](docs/scf/security/threat-model.md) | controls, findings and review status |
| [diagrams](docs/scf/diagrams/README.md) | 13 Mermaid diagrams, current and planned drawn separately |
| [SCF package index](docs/scf/README.md) | the full submission documentation |

To run the project locally, see [`README.md`](README.md).
