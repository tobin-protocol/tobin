# F. SCF Build readiness assessment

Current SCF Build requirements, tracks, funding structure and evaluation criteria were **not verifiable from the repository** and are not asserted here; confirm them against the official programme documentation before planning the submission. This assessment applies a reviewer's general lens: real problem, working product, real Stellar integration, credible execution, honest claims.

## 1. Lens
| Question | Assessment (evidence-based) |
|---|---|
| Real problem | Plausible and well argued in the README (clearing of recurring multilateral obligations); **demand is not validated**: the README itself says whether real Stellar flows are interconnected enough has not been measured. No users, customers, partners or traction exist in the repository, and none must be invented. |
| Differentiation | A contract that stores obligations and verifies value conservation of any proposed netting plan, with per-debtor authorization and atomic settlement, is a distinctive, checkable design. Differentiation in the market is unproven. |
| Stellar/Soroban relevance | High: Soroban contracts, Stellar authorization entries, multisig governance on Testnet are real. |
| Working product | Contracts and engine: yes. Application: no. |
| Real Testnet interaction | Thin and partly unpublished (create-session and mint recorded; lifecycle on the deployed instance not evidenced here). |
| Security consciousness | Exceptional process for a pre-MVP: baselines, threat models, release gates. Same-author only. |
| Documentation | Deep and honest, but oriented to internal phases rather than to a reviewer or an integrating developer. |
| Roadmap realism | README milestones exist; budget and milestone clarity for SCF could not be verified. |

## 2. Deliverables 1 to 20

| # | Deliverable | Current state | Needed for submission quality |
|---|---|---|---|
| 1 | Public landing page | **Live**, lint clean, design system documented; statuses mirror the README honestly ("Built / Differs / Not built") | link to the live demo and evidence; keep claims within evidence |
| 2 | Deployed application | Missing | deploy the product app at the app subdomain |
| 3 | Organization onboarding | Missing | build (G phase 2/4) |
| 4 | Clearing sessions | Mocked (sandbox) | live sessions on Testnet |
| 5 | Obligation management | Mocked | persisted, wallet-authorized |
| 6 | Verified netting | Engine verified; app display missing | show gross vs net and an independent verifier |
| 7 | Approval and authorization workflows | Contract complete; app missing | wallet-signed flow, signing room |
| 8 | Testnet contract integration | Contracts deployed; app transport missing | network transport and wallet adapter |
| 9 | Transaction verification | Missing | explorer links, status polling, public verifier page |
| 10 | Technical architecture docs | Partial (many internal documents) | one reviewer-facing architecture document with diagrams |
| 11 | Contract documentation | Good (`contracts/README.md`, ABI reference) | add a short developer-facing summary and events guide |
| 12 | Developer integration guide | Missing | write after the transport exists |
| 13 | API documentation | Only for W0 (`W1-API-REFERENCE.md`) | document the product API |
| 14 | SDK documentation | SDK README for MVP-1 | publishable quick start; versioning |
| 15 | Architecture diagrams | Mermaid in this audit only | place in product docs |
| 16 | Security and threat model | Strong for signer/console; none for product app | threat-model the product app; label as internal |
| 17 | Automated test evidence | Strong (96 Rust, 267 console, 64 SDK, signer suites, CI) | add E2E on Testnet; publish CI summary |
| 18 | End-to-end demonstration | Missing | report H |
| 19 | Demo video | Missing | record after H works live |
| 20 | SCF application materials | Not found in the repository | prepare per the official template once confirmed |

## 3. What would make the submission stand out
- A live Testnet clearing session where **independent wallets** authorize and a public page re-derives the net positions from on-chain obligations and matches the settlement transaction (checkable, not a claim).
- The explicit gross-versus-net display (value that did not have to move) using real session data, never invented savings.
- A clearly bounded, honest scope: "up to 4 participants, one asset, Testnet, no administrator, immutable contract" with the reasons.
- Visible engineering discipline: reproducible builds and Wasm hashes, CI evidence, a verifier script anyone can run read-only.

What is merely expected: a landing page, a dashboard, organization pages, CI, and a README.

## 4. Verdict
NOT READY. The foundation is stronger than most pre-MVP submissions, but a reviewer cannot yet log in, connect a wallet, run a session and verify it on-chain. Do not add claims (partners, users, savings, audits) that the evidence does not support.
