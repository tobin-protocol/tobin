# Tobin MVP-1: Milestone 7 readiness matrix and recommendation

> **Historical status note (added for publication, 2026-10-27).** This matrix describes the state on 2026-10-26, before any network, wallet or testnet work. Its statements that such work was "not authorized" or not started, that authorization was only simulated or host-signed, and that network transports, signing flows and testnet deployment were unimplemented are preserved as written for that date. Later work was documented separately (a local-network stage with a local signing tool, then a public-testnet run with disposable accounts and test assets), and the founder recorded MVP-1 as complete for its experimental scope on 2026-10-27. This note does not claim that every gate in this matrix was later passed: resource bounds, independent review and wallet signing in particular remain unverified. Test counts and tool versions below are those of the original date.

> **Identifier note (added for publication).** `DB-nn` and `EQ-nn` identify decisions and open questions recorded in internal, unpublished design records. Where this document relies on such a decision it states the resulting behaviour; the approved specification and the ABI reference are the public sources.

Written 2026-10-26 from the actual workspace. Not a security audit; not independent verification (the contracts, SDK, engine, tests and fixtures share an author). "Run in M7" means executed in Milestone 7; "historical" means reported by an earlier milestone and not re-executed here.

## 1. Recommendation

**READY WITH SPECIFIC BLOCKERS.** The local, host-level MVP-1 is implemented and consistently tested. It is **not** ready for, and has not been authorized for, any wallet, network or testnet work, and several baseline gates remain open (section 5). It is not production-ready and makes no real-value claim.

| # | Blocker for Milestone 8 (a network/wallet-facing step) | Severity | Why it matters | Smallest next action |
|---|---|---|---|---|
| B1 | No founder authorization for wallet or network work (DB-13) | **Blocking** | the baseline spike (S§9) and Phase E (S§15) need simulation, wallet signing and a deployment, all forbidden today | founder grants a written, scoped authorization (local network first, test assets only) |
| B2 | Resource measurements are host-test estimates only (S§17: OPEN) | High | no transaction size, fee, storage-rent or network-limit evidence; the 16-instruction target is not reachable with 4 participants under the validation rules | measure on a local Stellar network once B1 exists; propose revised limits before changing S§11 |
| B3 | Authorization is simulated (`mock_auths`) or signed only in the test host | High | wallet signing of custom-argument entries, transaction assembly, nonce and expiry are unestablished | run the spike in section 4 of the baseline on a local network with a real signer, after B1 |
| B4 | Same-author verification of digests, netting and tests | Medium | no independent check of the founder-approved digest bytes | have a second implementation (or reviewer) reproduce `ts/test/fixtures/digest-fixtures.json` from `ts/DB-09-DIGEST-REVIEW.md` alone |
| B5 | The internal design documents (unpublished) drift from the implementation (instruction order, `settle` re-validation, token codes, error list) | Medium | the test plan of record (the internal Phase B matrix, unpublished) no longer equals the tests that exist | produce a short implementation-aligned ABI/test list from `core/README.md` and the sources; do not rewrite the design history |
| B6 | Token acceptance policy (EQ-09 residual): any contract can be a session token | Medium | participants must read the token before approving; the contract cannot judge a token | **RESOLVED in Milestone 8 Stage A:** founder decided no allow-list (recorded internally); arbitrary-token behavior remains untested |
| B7 | Cross-browser, accessibility and mobile-device coverage absent | Low-medium | one headless Chrome only | add Edge/Firefox and an accessibility pass when the Console becomes user-facing |

## 2. DB-09 founder decision

Recorded: **APPROVED** by the founder, scope **version 2 only** (tags `TOBIN-MVP1/OBLIGATIONS/v2`, `TOBIN-MVP1/SETTLEMENT/v2`, scheme version 2, revision as big-endian `u32` in the proposal digest, advancing on every accepted proposal including identical re-proposals; supersedes version 1; v0.2 `commitment_digest` unchanged). No decision date is given (none is established in the project). It is a design decision, not independent cryptographic review and not network replay protection. Recorded in `ts/DB-09-DIGEST-REVIEW.md` (last section) and in an internal, unpublished decision record. Documentation checked against `core/clearing/src/lib.rs` (`DIGEST_VERSION = 2`, tags v2, `put_u32(&mut b, revision)`) and `ts/src/digest.ts`. No byte, tag, fixture or contract logic was changed to record it.

## 3. Requirements-to-evidence matrix

Evidence names are test functions or files. "M7" = run in Milestone 7. Rust tests: `core/clearing/tests/*.rs`, `core/token/tests/token.rs`. TypeScript tests: `ts/test/*.test.ts`. Last Rust runs (native 72/72, Wasm clearing suite 63/63) are **historical (Milestone 6)**; the contract source and Rust tests were not changed in M7. TypeScript 75/75 and the browser journeys were **run in M7**.

### 3.1 Baseline requirements (S§n)

| ID | Expected behavior | Implementation | Evidence | Status | Gap |
|---|---|---|---|---|---|
| S§4 lifecycle | OPEN, COMMITTED, APPROVED, SETTLED only | `State`, `create_session`..`settle` | `lifecycle.rs` (all), `settlement.rs::a_session_settles_once_and_cannot_be_reopened`; sdk.test lifecycle (M7) | VERIFIED (host) | network not shown |
| S§4 creator and joining | creator admitted; join only while OPEN | `create_session`, `join_session` | `create_admits_the_creator...`, `joining_rules`, `joining_needs_the_joiners_and_the_creators_authorization`; signed.rs s1/s2; journey step 2 (M7) | VERIFIED (host) | wallet signing of two authorizations unshown |
| S§6 obligations | distinct parties, admitted, positive, unique id, checked, limit, immutable | `submit_obligation` | `obligation_rules`, `an_obligation_that_would_overflow...`, `obligations_are_kept_in_id_order...` | VERIFIED (host) | n/a |
| S§4/S§6 freeze | no change after finalization | `finalize_obligations` | `finalization_rules_and_the_freeze`, `a_replacement_never_touches_the_frozen_data` | VERIFIED (host) | n/a |
| S§7 netting | N = outgoing − incoming; debit = max(0,N), credit = max(0,−N) | `compute_nets`, `validate_plan` | `the_readme_example_has_the_expected_nets...`, `invalid_plans_are_rejected...`, property.rs; TS engine.test (M7) | VERIFIED (host); oracle same author | algorithm for engine default is an engineering choice |
| S§7 canonical algorithm and ordering | one canonical algorithm and ordering | engine default (TS) + contract order rule | engine.test "pinned ordering"; contract accepts any valid plan (founder EQ-02) | PARTIAL | the baseline's "one canonical algorithm" is satisfied by the engine's default plus the contract ordering rule, not by contract enforcement of one list (founder EQ-02); tobin-settle-v1 reuse is an adaptation, not conformance |
| S§8 digest | versioned, domain-separated, explicit widths, vectors, same in TS and Rust | `obligation_bytes`, `proposal_bytes_of`; `ts/src/digest.ts` | `digest.rs` (6), `digest.test.ts` (fixtures for revisions 1-3, field-sensitivity), `interop.test.ts` (40 live sessions); fixtures regenerate byte-identical (M6) | PARTIAL | format founder-approved (DB-09); vectors same-author; real network id never exercised (all-zero test-host id) |
| S§9 membership/approval/debit separation | three separate concepts | contract + SDK `prepare*` | `an_approval_is_not_a_debit_authorization`; sdk-unit tests; journey step 9-10 (M7) | VERIFIED (host) | n/a |
| S§9 debtor authorization | each debtor authorizes own transfers, bound to operation and amounts | `settle`: `require_auth_for_args(session, digest, total)` + token `from.require_auth` | `a_missing_or_wrong_debtor_authorization_fails...` (10 mutations), signed.rs s3-s7 (real ed25519), sdk.test necessary-and-sufficient (M7) | VERIFIED (host) | real wallet signing OPEN |
| S§9 spike (simulation, entries, wallet, signing sequence) | documented as results | Phase A + bridge | Phase A report; host-level only | OPEN | simulation, wallet support, signing sequence unestablished |
| S§10 atomic settlement | all transfers or none; no partial state | `settle` (marker before transfers, no swallowed error) | `a_later_transfer_that_fails_reverts...`, `a_failure_at_the_first_or_the_last_transfer...`, catch.rs (ignore vs catch vs propagate), journey step 10 (M7) | VERIFIED (host) | network-level rollback not shown |
| S§10 real token contract | not mock-only | `TobinTestToken` registered natively and as Wasm | settlement.rs, signed.rs use the real custom token; Wasm run (M6) | VERIFIED (host) | n/a |
| S§11 bounds | 4 / 16 / 16 / 1 / 1 as provisional targets | ceilings in lib.rs | `resources.rs` (4 participants, 16 obligations, 4 instructions) | PARTIAL | 16 instructions unreachable with 4 participants under the rules; targets remain provisional |
| S§11 storage not temporary | persistent/instance only | `Key` enum | source inspection | VERIFIED (inspection) | archival/lifetime values are unmeasured placeholders |
| S§12 errors | stable codes for the listed conditions | `Error` enum; SDK table checked against Rust source | `sdk-unit.test.ts::...error tables are exactly the contracts' error enums` | PARTIAL | "unauthorized caller" and "missing debit authorization" are host `Auth` errors, not contract codes (documented); token failure passes through |
| S§12 events | creation, admission, obligation, commitment, approval, settlement | `contractevent` structs | `a_failed_settlement_emits_no_event...`, resources tests count events | PARTIAL | event payload schemas not separately tested for stability |
| S§13 items 1-12 | acceptance tests | see rows above | `lifecycle.rs`, `proposal.rs`, `settlement.rs`, `signed.rs`, `catch.rs` | VERIFIED (host) | item 5 oracle same author |
| S§13 item 13 | cross-language vectors | fixtures | `digest.test.ts` | PARTIAL | same author |
| S§13 item 14 | worst-case resources | `resources.rs` | host estimates (historical M1: Wasm settle 5.6M CPU, 3.2 MB at 4 transfers) | PARTIAL | no network limits, fees, transaction size |
| S§13 item 15 | integration with the actual token | custom token | settlement.rs | VERIFIED (host) | n/a |
| S§13 property tests | conservation, determinism, net correctness | property.rs, engine.test (2000 sessions) | executed M6/M7 | VERIFIED (host); same author | n/a |
| S§14 SDK | typed methods for the interface, netting, digest, preparation, queries | `ts/src/sdk` | sdk.test (6), sdk-unit (13) (M7) | VERIFIED (host) | no network or wallet transport (`NetworkTransportNotAuthorized`) |
| S§14 console | status, obligations, nets, instructions and digest before approval, who must approve/authorize, submission vs confirmation, final balances | `ts/console` | console.test (5), console-view (15), journey (M7) | PARTIAL | submission-versus-confirmation distinction is moot locally (no network); real-browser coverage is one headless Chrome |
| S§14 no "settled" from submission | page confirms from contract state | `view.ts` | console-view "settled appears only when the contract reports Settled" (M7) | VERIFIED | n/a |
| S§15 phases A-D | spike, core, engine/SDK, console | all present | see above | PARTIAL | Phase A spike incomplete (wallet/simulation); Phase E (testnet) not started and not authorized |
| S§16 exclusions | no default/abort/collateral/multi-token/carryover | no such method | `grep` of the contract: no burn, set_minter, set_cap, upgrade, abort, timeout; ABI list | VERIFIED (inspection) | n/a |

### 3.2 Founder decisions

| Decision | Expected behavior | Evidence | Status | Gap |
|---|---|---|---|---|
| DB-14 custom capped-supply token | cap hard, minter fixed | `core/token/tests/token.rs::supply_can_reach_the_cap...`, `a_mint_that_would_overflow...`, `only_the_minter_can_mint...`, mutants T01-T05 (historical M1) | VERIFIED (host) | minting policy is an engineering choice |
| EQ-09 one immutable token per session | fixed at creation | `each_session_keeps_its_own_token_and_capacities`; no mutator exists | VERIFIED (host/inspection) | acceptance policy open (B6) |
| DB-16 / EQ-19 no admin; creator = membership only | no privileged role | no admin method (inspection); `an_authorization_for_one_joiner_or_session_does_not_carry_to_another`, `joining_needs_the_joiners_and_the_creators_authorization` | VERIFIED | n/a |
| DB-04/EQ-03 any admitted participant finalizes and proposes | | `any_admitted_participant_may_finalize`, `proposing_requires_an_admitted_...` | VERIFIED (host) | n/a |
| DB-15/EQ-04 replaceable proposal, replacement clears approvals | | `a_replacement_invalidates_every_earlier_approval`, `..._from_approved_returns_the_session_to_committed`, `a_replacement_that_fails_validation_changes_nothing`; journey 6, 7b (M7) | VERIFIED (host) | atomicity is single-invocation in the host |
| DB-02 all admitted participants approve | | `every_admitted_participant_must_approve_the_current_digest`, mutants M05/M19 | VERIFIED (host) | liveness stall accepted (DB-06) |
| DB-01 open submission | any caller; no bypass | `only_the_debtors_authorize_and_the_submitter_has_no_role`, `settle` has no caller argument | VERIFIED (host) | transaction-source and fee-payer behavior unestablished |
| DB-05 debtor submits, creditor approves | | `only_the_debtor_can_authorize_an_obligation` | VERIFIED (host) | n/a |
| EQ-02 any valid plan accepted | | `any_valid_plan_is_accepted_not_only_one_canonical_output`, interop (66 alternatives) | VERIFIED (host) | n/a |
| EQ-15 all-zero path | empty proposal, approvals, no token call | `all_zero_nets_complete_through_the_no_transfer_path`, journey 12 (M7) | VERIFIED (host) | n/a |
| EQ-05 revision-bound approvals | stale approval rejected | `a_stale_approval_signed_for_revision_1...`, `revision_overflow_fails_atomically...`, SDK/Console/browser A, B, A (M7) | VERIFIED (host) | no wallet/network replay evidence |
| DB-06 indefinite stalls accepted | no timeout/abort | console-view "does not complete by itself"; no such method | VERIFIED | n/a |
| DB-09 digest version 2 | approved | section 2 | founder decision recorded | not independent review |
| DB-13 separate authorization for wallet/network | none given | n/a | NOT APPLICABLE to MVP-1 as built | blocks B1-B3 |

## 4. Run in Milestone 7

| What | Result |
|---|---|
| `node --test test/*.test.ts` with the bridge (`TOBIN_BRIDGE_EXE` set) | exit 0, 75 pass, 0 fail, 0 skipped |
| `tsc --noEmit -p tsconfig.json`; console bundle build | exit 0 (run before the final test run) |
| Badge live-scroll check (`test/browser/badge.mjs`) | all 12 checks pass, exit 0 (badge pinned at the top while scrolled, topmost at its position, long banner scrolls away, no horizontal overflow; badge is 26px tall, 5% of a 500px viewport) |
| Real-browser journey at 420px (headless Chrome, bridge, real contracts) | 125 of 125 checks passed (exit 0, 0 FAIL, 0 JavaScript errors; includes 14 horizontal-overflow checks) |
| Real-browser journey at 1200px | 125 of 125 checks passed (exit 0, 0 FAIL, 0 JavaScript errors) |
| Rust suites | **not re-run in M7** (contracts and Rust tests unchanged since the M6 run: native 72/72, Wasm clearing 63/63) |

## 5. Baseline implementation gate (S§17) now

| Gate item | Status | Basis |
|---|---|---|
| Canonical encoding and digest format | PARTIAL | format founder-approved (v2); vectors same-author |
| Multi-party authorization prototype results | PARTIAL | host-level, including real ed25519 entries; wallet and simulation OPEN |
| Direct token transfer and rollback proof | PARTIAL | host-level with the custom token; network OPEN |
| Final logical ABI and types | PARTIAL | implemented and tested; the internal design documents were not realigned (B5) |
| Storage schema and lifecycle invariants | PARTIAL | implemented; lifetimes unmeasured |
| Resource measurements and justified bounds | OPEN | host estimates only |
| Acceptance-test plan and test-vector format | PARTIAL | tests exist; the plan of record is outdated (B5) |
| SDK and wallet integration approach | PARTIAL | SDK built; wallet approach undemonstrated |

## 6. Security, resources and operations: known boundaries

- Authorization is host-simulated (`mock_auths`) or signed with test keys in the Soroban test host; no wallet, transaction envelope, simulation output, signer flow, nonce, expiry or network replay protection has been demonstrated.
- No testnet deployment, no real token transfer, no network-level rollback evidence; atomicity is shown in the host only.
- No transaction size, fee, storage-rent or network-limit data; CPU/memory figures are host-test estimates.
- Same-author limitation: contracts, SDK, engine, tests, fixtures, mutation checks and the browser journey share one author; there is no independent review or audit.
- The local server (127.0.0.1 only; Host/Origin and content-type checks) is a development tool, not a hardened service.
- One browser (headless Chrome); no accessibility or cross-browser review.
- The absence of a found defect does not show the absence of vulnerabilities.

## 7. Classification

1. **Implemented and tested (host level):** lifecycle, membership, obligations, freeze, nets, validation of any valid plan, replacement and revision-bound approvals, version-2 digests, debtor authorization, atomic settlement and rollback, all-zero path, capped token, SDK, Console, local server.
2. **Implemented but incompletely verified:** digest vectors (same author), resource figures (host estimates), local-server hardening (tested only for the cases listed), Console in one browser.
3. **Unimplemented:** wallet and network transports, signing flows, testnet deployment (not authorized).
4. **Founder decisions:** those in section 3.2, DB-09 approval (section 2).
5. **Engineering assumptions (reviewable):** instruction order rule, `settle` re-validation, token minter/cap policy and error numbering, placeholder storage lifetimes, the engine's default pairing, any-contract-as-token.
