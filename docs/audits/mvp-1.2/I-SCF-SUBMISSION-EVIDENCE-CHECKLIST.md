# I. SCF submission evidence checklist

Unticked = not yet existing or not verifiable from the repository. Confirm the programme's own requirements first; this list is derived from the product, not from SCF rules.

## Product and demonstration
- [ ] Public application URL (HTTPS) with a Testnet banner and instructions for reviewers.
- [ ] Supported wallet instructions and a funded disposable-account guide.
- [ ] Live Testnet session: creation, join, obligations, finalization, proposal, approvals, settlement, with all transaction hashes and ledgers.
- [ ] Public verifier page or script that recomputes nets from on-chain data and matches the settlement.
- [ ] Demo video (3 to 5 minutes) of the live journey, plus the negative cases.
- [ ] Recorded fixtures/sandbox run clearly labelled if used for anything.

## Stellar evidence
- [x] Contract addresses, Wasm hashes and deploy transactions: `contracts/deployments/testnet.json` (verified read-only 2026-11-06).
- [x] Administrative multisig configuration and mint authorization tests: `docs/governance/governed-token-evidence.md`.
- [ ] Fresh Testnet evidence for the clearing lifecycle on the deployed (or a new, recorded) instance.
- [ ] Wallet validation results (tests T3 to T14).
- [ ] Measured resources, fees and TTL behaviour.
- [ ] Contract TTL extension record and schedule.

## Engineering evidence
- [x] Automated tests: Rust 96, console 267, SDK 64, signer suites; CI summaries.
- [ ] Testnet E2E test run in CI or a recorded manual run.
- [ ] Accessibility and responsive test record for the product app.
- [ ] Dependency audit output and SBOM/licence report (partly present: dependency baseline).
- [ ] Reproducible Wasm build instructions and hash comparison across two environments.

## Documentation
- [ ] Reviewer-facing architecture overview with diagrams.
- [ ] Contract reference with events and errors (exists internally; condense).
- [ ] Developer integration guide and API reference for the product.
- [ ] SDK quick start and versioning policy.
- [ ] Security model and threat model for the product app, labelled internal.
- [ ] Known limitations page (ceilings, immutability, Testnet only, no audit).

## Honest claims register
- [ ] Every public statement (landing, README, application text) mapped to evidence; remove or soften anything unevidenced (the unpublished Testnet run, "settlement flow demonstrated").
- [ ] No partners, customers, adoption or savings claims without evidence.

## Application materials
- [ ] Problem statement and market evidence (real, cited).
- [ ] Budget, milestones and deliverables per programme template (rules to be confirmed).
- [ ] Team and execution evidence (repository history, CI, reports).
- [ ] Open-source licence and contribution policy (present: Apache-2.0, `CONTRIBUTING.md`).
- [ ] Independent review plan (none yet).

## Release gates still unverified
`release/RELEASE-GATES.json`: G04 and G10 BLOCKED; E01 to E05 NOT VERIFIED; P01 to P05 BLOCKED or NOT VERIFIED.
