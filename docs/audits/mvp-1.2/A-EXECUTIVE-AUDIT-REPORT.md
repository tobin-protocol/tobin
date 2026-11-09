# A. Executive audit report

## 1. Maturity in one paragraph
Tobin has a real, well-tested **protocol core**: two Soroban contracts (an immutable clearing contract and a capped test token), an off-chain netting engine, a typed SDK, a local sandbox that runs the real contracts in the Soroban test host, signer-integrity tooling (B0/B1) and a non-executing signer console (W0/W1). Three contracts are **independently verifiable on Stellar Testnet today**. It has **no institutional application**: no backend, database, authentication, organizations, invitations, session registry, wallet integration or network transport, and the application is not deployed (`app.tobinprotocol.xyz` does not resolve). The only deployed web asset is the marketing landing page. Today the project can demonstrate clearing mechanics locally and a thin on-chain footprint; it cannot yet demonstrate the target user journey on Testnet.

## 2. Strengths
- Contract design is conservative and well reasoned: state machine `OPEN → COMMITTED → APPROVED → SETTLED`, per-debtor `require_auth_for_args`, all-or-nothing settlement, state written before token calls, checked arithmetic, 27 stable error codes, no administrator or upgrade path. 96 Rust tests pass in CI.
- On-chain netting verification: the contract stores the obligations and recomputes nets itself, accepting any proposal that satisfies explicit correctness rules (so "on-chain verified netting" is a supportable claim for the contract's ceilings).
- The off-chain engine is integer-only (bigint, i128-checked), deterministic (XDR-byte tie-breaking) and cross-checked against Rust fixtures.
- Honest, evidence-labelled documentation culture; extensive security process (B0/B1 baselines, threat models, release gates, SHA-pinned CI actions, zero production dependency vulnerabilities).
- Governance of the token mint is genuinely multisig-enforced on Testnet (thresholds 5/6/7 observed live).

## 3. Weaknesses
- Application, backend, persistence, identity and wallet layers are absent (not partially built).
- The clearing contract is immutable with hard ceilings (4 participants, 16 obligations, 16 instructions), no cancel/amend, no abort or timeout, and caller-chosen session ids.
- Wallet signing has never been validated (tests T3 to T14 not run); there is no network transport.
- The signature-expiry policy (10 ledgers, about 50 seconds) conflicts with asynchronous multi-organization signing and is an unresolved owner decision (W3).
- The full-lifecycle Testnet evidence referenced by the README is unpublished, so the headline claim cannot be checked from the repository; the deployed instance's recorded functional checks cover only a mint and `create_session`.
- All three admin signers are one person; the master key is still enabled; no independent audit.

## 4. Critical blockers (top five)
1. No backend, database or authentication (IdP and database decisions pending).
2. No wallet integration and no network transport; wallet validation not authorized or run.
3. Cross-organization signing coordination is undesigned and collides with the 10-ledger expiry policy.
4. No deployed, publicly reachable application, and no Testnet evidence of the full lifecycle on the deployed contracts.
5. Contract ceilings and immutability may not fit an "institutional" demo; extending them means a new contract version (owner decision).

## 5. Readiness
- **Overall MVP readiness:** about the protocol-and-sandbox half of the product exists; the application half does not. Not a percentage claim.
- **SCF readiness:** NOT READY. The problem statement and engineering rigour are strong; the working Testnet demonstration, deployed app and public evidence are missing.

## 6. Final verdicts

| Assessment | Verdict | One-line basis |
|---|---|---|
| Repository architecture | Needs work | clean monorepo; heavy historical archives and duplicated revisions; no app layering yet |
| Frontend foundation | Needs work | strong landing design system; console is a minimal sandbox on separate, unshared styles |
| Organization management | Not ready | nothing exists |
| Session management | Needs work | contract complete; app has sandbox only |
| Obligations management | Needs work | contract and engine complete; no persistence; no cancel/amend by design |
| Netting engine | Ready | integer-exact, deterministic, tested; minor gaps (gross/savings not exposed, no decimal display) |
| Backend and persistence | Not ready | none exists |
| Stellar integration | Needs work | contracts deployed and verified; no transport or indexer |
| Wallet integration | Not ready | no code, validation not run |
| Settlement | Needs work | contract atomic settlement tested in host; not shown end to end on the deployed instance |
| Security | Needs work | strong signer/console hygiene; application-level controls absent; no independent audit |
| Testnet deployment | Needs work | contracts yes; application, backend, database, monitoring no |
| Documentation | Needs work | deep and honest; scattered, no user/developer/API guides for the product |
| SCF Build submission | Not ready | see report F |

## 7. The ten questions
1. **What can Tobin genuinely do today?** Run the full clearing lifecycle for up to 4 participants against the real contracts in a local test host with simulated authorizations; compute deterministic net positions and a valid settlement plan; hold three verified Testnet contracts; mint the governed test token under real multisig thresholds; create a session on Testnet (recorded, confirmed); serve a public landing page.
2. **Prototype, mock or incomplete:** the console sandbox (simulated authorizations, memory only), the W0/W1 signer console (mock adapter, development identity), the SDK's local-only transport, all "dashboard", "organization" and "history" concepts.
3. **Five most serious blockers:** section 4 above.
4. **To reach a compelling SCF Build submission:** the Testnet end-to-end journey (report H), a deployed app, wallet-signed authorizations, a public verifiable evidence pack, developer docs, a demo video and the application materials (reports F, I).
5. **Reusable without modification:** the two contracts and their deployments, the netting engine and digest, the SDK ABI/prepare/intent layers, the `Transport` interface, the signer tooling and W0/W1 as an isolated admin surface, the landing design tokens, CI workflows.
6. **Improve, not rewrite:** the SDK (add network transport and wallet adapter behind the existing interface), the console (turn the sandbox controller into real app screens), design tokens (extract from the landing without value changes), documentation (consolidate and index).
7. **Architectural decisions needing approval:** database, identity/authentication, signature-expiry window (W3), wallet-support decision (W1) and permission to run wallet validation (W2), contract version/ceilings, hosting layout, indexer approach, retention, whether the signer console ships in the public app.
8. **Shortest realistic path:** decisions, then an attended Freighter validation, an SDK network transport and wallet adapter, a minimal backend (auth, organizations, invitations, session registry), then the session screens wired to Testnet (report G, H).
9. **Explicitly exclude from the MVP:** real signer execution and the TST signer path, cancel/amend/abort/timeout, multi-asset sessions, more than four participants unless a new contract version is approved, collateral, Merkle commitments, notifications, multi-wallet support beyond Freighter, mobile native clients, production claims.
10. **What would make it technically impressive:** a recorded Testnet session in which two or more independent wallets authorize a multilateral netting whose conservation rules are enforced by the contract, with a public verifier page that recomputes the nets from on-chain obligations and matches the settlement transaction.
