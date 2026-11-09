# C. Feature completeness matrix

Categories: **Complete+verified**, **Complete, unverified**, **Partial**, **Mocked/fixture**, **Missing**, **Blocked**, **Decision** (needs an architectural decision). "Sandbox" = real contracts in the Soroban test host, simulated authorizations, memory only. MVP-1.6 is not defined in the brief; this audit treats it as release readiness (E2E, security review, responsive and accessibility testing, deployment, monitoring, documentation, demonstration), matching the earlier brief's workstream E.

## MVP-1.2 application experience

| Requirement | State | Evidence and notes | Mandatory for SCF MVP |
|---|---|---|---|
| 3.1 Dashboard (real persisted data) | Missing | none; `/w0` Overview is a static explainer of the signer console | Yes |
| 3.2 Organization onboarding | Missing | no registration, profile, duplicate handling | Yes |
| 3.3 Org profile, members, roles, invitations | Missing | no data model or API; backend enforcement therefore untestable | Yes |
| 3.4 Session list, search, history | Mocked | sandbox selects by typed label; no list/filter/history; session ids derive from a label (`sessionIdFromLabel`) | Yes |
| 3.5 Session creation | Mocked | sandbox `create`; contract `create_session` complete, caller-chosen ids | Yes |
| 3.6 Session workspace | Mocked | sandbox single page shows state, participants, nets, approvals | Yes |
| 3.7 Obligations (create/status) | Mocked | sandbox `obligation`; contract validates party, amount, duplicates, ceiling 16 | Yes |
| 3.7 Edit/cancel obligations | Missing (contract) | no function; obligations freeze at finalize | Decision (exclude from MVP) |
| 3.8 Activity and history (incl. tx references) | Mocked | in-page log; no persistence; on-chain events exist (8 types) but nothing reads them | Yes |

## MVP-1.3 backend, identity, persistence

| Requirement | State | Evidence and notes |
|---|---|---|
| Authentication, user accounts | Missing | only W0 development identity provider (no credentials, mock) |
| Organizations, memberships, RBAC, invitations | Missing | |
| Multi-organization users, isolation, secure invitation acceptance | Missing | |
| Session registry, obligations, activity, audit records | Missing | W0 audit/intent/preview stores are in memory and specific to the signer console |
| Database, migrations | Missing / Decision | provider undecided (C7 pending owner; repository recommends managed Postgres) |
| API contracts, validation, rate limits | Partial | W0 routes have strict validation, CSRF, rate limits (`lib/w0`); applies only to the signer console |
| Persistence across restarts | Missing | every store is in memory |
| In-memory/dev-only items found | — | W0 audit/intents/previews/sessions/limiters; sandbox singleton; development identity provider |

## MVP-1.4 Stellar integration

| Requirement | State | Evidence and notes |
|---|---|---|
| Contract interfaces, access control, state machine | Complete+verified | `contracts/clearing/src/lib.rs`; 96 Rust tests (CI); ABI test in the SDK |
| Testnet deployment of contracts | Complete+verified | three contracts and admin account confirmed read-only (report E) |
| RPC integration, simulation, transaction construction/submission/confirmation | Missing | `NetworkTransportNotAuthorized` is the only network transport |
| Authorization-entry collection and signing | Partial | offline signer for disposable keys, tested on a local network and in the host; **not** for browser wallets |
| Freighter / any wallet | Missing; Blocked | no dependency or code; validation T3 to T14 never run |
| Contract state synchronization / indexer | Missing | |
| Typed adapter isolation | Partial | `Transport` interface exists and is sound; no wallet interface; no contract-version abstraction |
| Mock vs live separation | Complete | sandbox/W0 are labelled and cannot reach a network |

## MVP-1.5 netting and settlement (16 lifecycle steps)

| Step | State |
|---|---|
| 1 Create session | Complete+verified (host tests; Testnet `create_session` recorded and confirmed once) |
| 2 Multi-organization participation (join) | Complete in contract (verified in host); cross-organization signing flow Missing |
| 3 Submit obligations | Complete in contract (host); app Mocked |
| 4 Validate obligations | Complete+verified (contract and engine mirror each other) |
| 5 Gross obligations | Partial: engine computes totals internally but does not expose gross value or savings |
| 6 Net positions | Complete+verified (engine and contract recompute) |
| 7 Debtors/creditors | Complete+verified (sign of net) |
| 8 Settlement requirements (plan) | Complete+verified (default proposal; contract accepts any valid plan) |
| 9 Review of netting | Mocked (sandbox UI) |
| 10 Participant approval | Complete in contract (host); wallet path Missing |
| 11 Multi-debtor authorization | Complete in contract with real ed25519 entries in the host; browser-wallet path Missing/Blocked |
| 12 Settlement preparation | Partial: SDK prepares calls; no transaction assembly/fees/resources for the network |
| 13 Settlement submission | Missing (no transport); Testnet settlement evidence for the deployed instance not in repo |
| 14 Confirmation | Missing |
| 15 Final status | Complete in contract (`SETTLED`, `get_settlement`); no app display |
| 16 Reconciliation and audit history | Missing |

## MVP-1.6 release readiness
E2E on Testnet: Missing. Security review: internal only. Responsive/accessibility: partial (W0 journey at 1200 and 420 px, structural checks; no scanner, no screen reader testing). Deployment: landing only. Monitoring: Missing. Documentation: deep but not product/developer facing. Demonstration: Missing.

## Netting correctness assessment (engine `packages/mvp1-sdk/src/engine`, contract `compute_nets`/`validate_plan`)

| Property | Finding |
|---|---|
| Mathematical definition | net = outgoing − incoming per participant; positive = debtor; sum of nets is zero by construction (VERIFIED by source and tests) |
| Precision | integers only (base units, i128 range checked on every add/subtract in both engine and contract); the engine rejects JavaScript numbers; **no decimal display or conversion exists in the application** (amounts are base units; the token has 7 decimals) |
| Rounding | none, none needed; the default proposal splits exactly (min of remaining) |
| Conservation | contract `validate_plan` requires per-participant debit = max(0, net) and credit = max(0, −net), no omitted or introduced value, no payer that is also a payee (`OffsettingFlows`), strict ordering |
| Zero nets | supported end to end (empty proposal, settle moves nothing) |
| Duplicates | duplicate obligation ids rejected by both; duplicate participants rejected in the engine |
| Invalid participants | unknown party, self-obligation, non-positive amounts rejected |
| Assets | one token per session fixed at creation; obligations carry no asset, so "unequal assets" is unrepresentable (correct, but multi-asset netting is out of scope) |
| Cancelled obligations | not representable (no cancel) |
| Scale | contract ceilings 4 participants, 16 obligations, 16 instructions (provisional targets, resource use unmeasured); the engine itself has no ceiling |
| Determinism | tie-breaking by address XDR bytes; cross-language digest fixtures agree (same-author) |
| Cycles | handled implicitly: a pure cycle yields all-zero nets |
| Off-chain/on-chain mismatch | the contract does **not** require the plan to equal the engine's output and does not require it to be minimal; any valid plan can be proposed; therefore "the engine's result is the only valid one" and "minimal transfers are enforced" must not be claimed |
| Claims supportable | atomic all-or-nothing token settlement in one invocation (tested in host and recorded on a local network); on-chain verification that a plan conserves value against stored obligations. Not supportable: "fully on-chain netting", "trustless" beyond the contract rules, production safety |

Recommended validation cases (to implement later): (1) the README triangle (A→B 100, B→C 80, C→A 70 gives A pays 30, B receives 20, C receives 10, gross 250 versus 30 moved); (2) pure cycle gives all-zero nets and an empty proposal; (3) fan-in/fan-out with 4 participants; (4) single bilateral pair; (5) maximum size (16 obligations, 4 participants) in the host; (6) amount extremes near i128 max and overflow rejection; (7) duplicate id, self-obligation, zero and negative amounts, unknown party; (8) many obligations between the same pair; (9) equal-amount ties (deterministic ordering); (10) property test (one exists, `contracts/clearing/tests/property.rs`; extend it): for random sets, sum of nets is zero and the default proposal passes the contract validator; (11) cross-implementation: TypeScript nets equal contract nets on random sets; (12) a valid but non-minimal plan is accepted by the contract and a plan with one wrong unit is rejected.
