# Tobin MVP-1: implementation-aligned ABI and authorization reference

Written 2026-10-26 (Milestone 8, Stage A) from the current sources: `core/clearing/src/lib.rs` (`TobinClearingV1`), `core/token/src/lib.rs` (`TobinTestToken`), `ts/src/sdk/{abi,errors,prepare,client,transport}.ts`, and the tests named below. It describes what the code **does**, not a design. It supersedes the logical ABI of the earlier, internal and unpublished design records for implementation purposes; those records stay as history.

Evidence labels: **[T]** proven by a named test, executed in the Soroban test host (soroban-env-host 29.0.0), which is *not* a network; **[S]** read from source only; **[W]** needs a real signer or wallet experiment (nothing here establishes it); **[?]** unknown or not implemented. Last full runs of the Rust and TypeScript suites are in `MVP-1-MILESTONE-7-READINESS.md` (Rust: Milestone 6, historical; TypeScript and browser: Milestone 7). Nothing in this document was inferred from the ABI into a wallet-signing sequence.

## 1. Founder decision: token policy

No token allow-list for MVP-1. A session may name any token contract; the creator is responsible for choosing a compatible one; arbitrary token contracts are not trusted by the contract; initial integration experiments use `TobinTestToken` and test accounts. This is a scope decision, not a claim that arbitrary tokens are safe. No allow-list and no privileged token administrator are introduced. Recorded in an internal, unpublished decision record (decision date not specified). What the code does: `create_session` accepts any **contract-kind** address as the token and rejects a classic account address with `BadAddressKind` [T: `create_rejects_bad_inputs`]; it never inspects the token's code or interface [S]. The SDK states the token to the user and binds it into both digests [T: `every_bound_field_changes_the_commitment`].

## 2. Data types (clearing contract)

| Type | Fields |
|---|---|
| `State` | integer enum: Open 1, Committed 2, Approved 3, Settled 4 |
| `Obligation` | `id: BytesN<32>`, `debtor: Address`, `creditor: Address`, `amount: i128` |
| `Instruction` | `payer: Address`, `payee: Address`, `amount: i128` |
| `Session` | `creator`, `token`, `max_participants: u32`, `max_obligations: u32`, `state: State`, `participants: Vec<Address>` (admission order, creator first), `obligation_commitment: Option<BytesN<32>>` |
| `Proposal` | `digest: BytesN<32>`, `instructions: Vec<Instruction>`, `proposer: Address`, `revision: u32` |
| `Approval` | `participant: Address`, `digest: BytesN<32>` |
| `SettlementResult` | `digest`, `ledger_sequence: u32`, `total_moved: i128`, `instruction_count: u32` |
| `Config` | `version: u32 = 1`, `participant_ceiling = 4`, `obligation_ceiling = 16`, `instruction_ceiling = 16` (compile-time constants; provisional targets) |

Addresses are accounts (G...) or contracts (C...) only [T: address-kind tests]. Storage: `Session`, `Obligations`, `Proposal`, `Approvals`, `Settlement` per session in persistent storage; no temporary storage; lifetime constants are unmeasured placeholders [S].

## 3. Clearing contract entry points

"Checks" are listed in code order; **validation runs before the authorization call** in each function (an unauthorized caller can learn a contract error before the host rejects the missing authorization) [S]. "Auth" is what the contract requests from the host. Host authorization failures are `Error(Auth, InvalidAction)`, not contract errors [T].

| Entry point (args) -> return | Who may call | Authorization requested | Reads / changes | Expected contract errors | Evidence |
|---|---|---|---|---|---|
| `config()` -> `Config` | anyone | none | constants | none | [S] |
| `create_session(creator, session_id: BytesN<32>, token, max_participants, max_obligations)` | anyone naming themselves creator | `creator.require_auth()` on the whole call | writes `Session` (state Open, participants `[creator]`); events `SessionCreated`, `ParticipantJoined` | `SessionExists`(2), `BadAddressKind`(12: creator not account/contract, or token not a contract), `BadCapacity`(13: participants outside 2..4 or obligations outside 1..16) | [T] `create_admits_the_creator_and_fixes_the_terms`, `create_rejects_bad_inputs`, `create_needs_the_creators_own_authorization`, `each_session_keeps_its_own_token_and_capacities` |
| `join_session(session_id, participant)` | anyone | **two** `require_auth` on the same call arguments: `participant` and the session `creator` | appends to `participants` (Open only); event `ParticipantJoined` | `SessionNotFound`(1), `WrongState`(3), `BadAddressKind`, `ParticipantExists`(11, includes the creator), `TooManyParticipants`(10) | [T] `joining_needs_the_joiners_and_the_creators_authorization`, `an_authorization_for_one_joiner_or_session_does_not_carry_to_another`, `joining_rules`; signed.rs s1/s2 (real ed25519); [W] wallet signing of two authorizations |
| `submit_obligation(session_id, obligation)` | admitted debtor | `obligation.debtor.require_auth()` on the whole call (session id and every obligation field) | inserts into the id-sorted obligation list (Open only); event `ObligationSubmitted` | `WrongState`, `UnknownParty`(24), `SameParty`(23), `BadAmount`(22), `TooManyObligations`(20), `DuplicateObligation`(21), `Overflow`(38: an outgoing or incoming sum or the grand total would leave i128) | [T] `obligation_rules`, `only_the_debtor_can_authorize_an_obligation`, `an_obligation_that_would_overflow...`, `obligations_are_kept_in_id_order...` |
| `finalize_obligations(session_id, caller)` -> obligation commitment | any admitted participant | `caller.require_auth()` | writes the commitment, state Committed; event `ObligationsFinalized`; allows all-zero nets | `WrongState`, `NotParticipant`(4), `TooFewParticipants`(30), `NoObligations`(31), `Overflow` | [T] `any_admitted_participant_may_finalize`, `finalization_rules_and_the_freeze`, `finalization_of_an_all_zero_net_set_is_allowed` |
| `propose_settlement(session_id, proposer, instructions)` -> proposal digest | any admitted participant; state Committed or Approved | `proposer.require_auth()` on the whole call (including the full instruction list) | validates the plan against the frozen obligations (any valid plan); revision = previous + 1 (checked); writes `Proposal`; **removes all stored approvals**; state Committed; event `SettlementProposed` | `WrongState`, `NotParticipant`, `TooManyInstructions`(33), `InstructionOrder`(34), `InstructionSelfPay`(35), `BadAmount`, `UnknownParty`, `FlowMismatch`(36), `OffsettingFlows`(37), `Overflow`(38; also at revision `u32::MAX`) | [T] `invalid_plans_are_rejected...`, `any_valid_plan_is_accepted...`, `a_replacement_*` (4 tests), `a_stale_approval_signed_for_revision_1...`, `an_identical_proposal_is_accepted_as_a_new_revision...`, `revision_overflow_fails_atomically...`, `a_failed_replacement_leaves...` |
| `approve_settlement(session_id, participant, digest)` -> bool (set completed) | any admitted participant; state Committed | `participant.require_auth()` on `(session_id, participant, digest)` | appends `Approval`; when every participant has an approval of the current digest, state Approved in the same call; an exact duplicate returns `false` without change; events `Approved`, `SessionApproved` | `WrongState`, `NoProposal`(5), `NotParticipant`, `DigestMismatch`(40) | [T] `approval_rules`, `every_admitted_participant_must_approve_the_current_digest`, `an_approval_for_one_revision_cannot_satisfy_another...` |
| `settle(session_id, digest)` | **any caller; no caller argument and no submitter authorization** | per distinct payer: `payer.require_auth_for_args([session_id, digest, payer_total])` (custom arguments); plus, per transfer, the token's own `from.require_auth()` for `transfer(from, to, amount)` made by this contract as a sub-invocation | checks state/digest/approvals; re-validates the stored plan and recomputes both digests; writes `Settlement` and state Settled **before** the transfers; then one `token.transfer` per instruction on the session token; event `Settled`; an empty proposal makes no token call | `SessionNotFound`, `AlreadySettled`(50), `WrongState`, `NoProposal`, `MissingApproval`(6), `DigestMismatch`, `CorruptState`(90: a stored-state integrity check failed), `Overflow`; host `Auth` errors; token errors pass through unchanged (e.g. 102 `InsufficientBalance`) | [T] `the_readme_settlement_moves_exactly_the_net_amounts_atomically`, `a_missing_or_wrong_debtor_authorization_fails...` (10 mutations), `a_later_transfer_that_fails_reverts...`, `a_failure_at_the_first_or_the_last_transfer...`, `a_session_settles_once...`, `settlement_is_bound_to_the_current_proposal`, `all_zero_nets_complete_through_the_no_transfer_path`, `corrupted_state_fails_closed`, `settle_revalidates_a_stored_proposal...`; signed.rs s3-s7; catch.rs |
| `get_session(id)`, `get_obligations(id)`, `get_obligation(id, obligation_id)`, `get_commitment(id)`, `get_proposal(id)`, `get_settlement(id)`, `get_approvals(id)`, `get_approval(id, participant)`, `commitment_bytes(id)`, `proposal_bytes(id)` | anyone | none | read-only | `SessionNotFound`; `ObligationNotFound`(25); `WrongState` (`get_commitment`, `commitment_bytes` before finalization; `get_settlement` before settlement); `NoProposal` (`get_proposal`, `proposal_bytes`) | [T] sdk.test and lifecycle tests use them; `digest.rs` reads both byte queries |

Not present, by decision: administrator, owner, upgrade, burn, abort, timeout, force-approval, default, recovery, collateral, carryover, allow-list [S: no such function; searched for `burn`, `set_minter`, `set_cap`, `upgrade`, `abort`, `timeout`].

Error codes (27): 1 SessionNotFound, 2 SessionExists, 3 WrongState, 4 NotParticipant, 5 NoProposal, 6 MissingApproval, 10 TooManyParticipants, 11 ParticipantExists, 12 BadAddressKind, 13 BadCapacity, 20 TooManyObligations, 21 DuplicateObligation, 22 BadAmount, 23 SameParty, 24 UnknownParty, 25 ObligationNotFound, 30 TooFewParticipants, 31 NoObligations, 33 TooManyInstructions, 34 InstructionOrder, 35 InstructionSelfPay, 36 FlowMismatch, 37 OffsettingFlows, 38 Overflow, 40 DigestMismatch, 50 AlreadySettled, 90 CorruptState. The SDK table equals this enum [T: `sdk-unit.test.ts`, "error tables are exactly the contracts' error enums"].

## 4. Token contract (`TobinTestToken`)

| Entry point | Who may call | Authorization | Effect / errors | Evidence |
|---|---|---|---|---|
| `__constructor(minter, cap: i128, decimals: u32, name, symbol)` | deployment | none | stores the minter and cap once; `BadCap`(105) if `cap <= 0` | [T] `a_non_positive_cap_cannot_be_constructed`; what a deployment transaction requires is [W] |
| `mint(to, amount)` | the stored minter only | `minter.require_auth()` on `(to, amount)` | `BadAmount`(101), `Overflow`(104), `CapExceeded`(103: `total + amount > cap`); checks before any write | [T] `supply_can_reach_the_cap...`, `a_mint_that_would_overflow...`, `only_the_minter_can_mint_and_only_exactly_what_it_signed`, `amounts_must_be_positive` |
| `transfer(from, to, amount)` | any holder | `from.require_auth()` on `(from, to, amount)` | `BadAmount`, `InsufficientBalance`(102), `Overflow`; a self-transfer changes nothing | [T] `a_transfer_needs_the_owners_authorization...`, `an_overdraft_fails_and_has_no_partial_effect`, `the_sum_of_balances_always_equals_the_supply...` |
| `balance(id)`, `total_supply()`, `cap()`, `minter()`, `decimals()`, `name()`, `symbol()` | anyone | none | reads | [T] `the_constructor_fixes_the_minter_the_cap_and_the_metadata` |

No burn, no allowance, no `approve`, no `transfer_from`, no minter or cap setter, so the cap and minter cannot change after construction [S]. It implements a **subset** of the standard token interface; interoperability with other tooling that expects the full interface is [?]. Token errors start at 101 so they are never confused with clearing errors.

## 5. Authorization matrix

The host's `require_auth()` binds the invoked function name and all of its arguments; `require_auth_for_args` binds the function and the arguments the contract states. A signature or host grant for one argument set does not authorize another [T: every `*_for_one_*` and tamper test].

| Concept | Required of | What is signed or granted (as implemented) | Status |
|---|---|---|---|
| Transaction source account and submission | whoever pays and submits | **Nothing in the contracts depends on it.** `settle` has no caller argument; no function reads the transaction source | [T] open submission in the host (`only_the_debtors_authorize_and_the_submitter_has_no_role`); fee payer, source-account credentials and fee-bump behavior [W] |
| Contract invocation vs contract authorization | n/a | invocation is a call; authorization is each `require_auth` listed above | [S] |
| Join | joiner **and** session creator | both authorize `join_session(session_id, participant)` | [T] host; real signatures [T signed.rs]; wallet [W] |
| Obligation submission | the debtor | `submit_obligation(session_id, obligation)` | [T] |
| Finalization / proposal | the caller / proposer | the call's own arguments | [T] |
| **Proposal approval** | each admitted participant | `approve_settlement(session_id, participant, digest)`; the digest commits to session, token, frozen obligations, revision and exact instructions | [T]; a stale-revision signature fails with `DigestMismatch` [T] |
| **Debit authorization** | each debtor, for its own total | root `settle(session_id, digest, payer_total)` (custom arguments) with the debtor's own `token.transfer(payer, payee, amount)` calls as sub-invocations | [T] host and real ed25519 entries on classic accounts (signed.rs s3-s7; sdk.test necessary-and-sufficient); a wallet signing a **custom-argument root** is [W]; whether the host accepts the same tree as built by a real transaction is [W] |
| Network binding, expiry, nonce | host-level | the authorization preimage includes network id, nonce and expiration ledger | [T] wrong network, expired and altered-after-signing entries are rejected in the host (signed.rs s5, s6); a nonce being consumed on use, and replay across transactions, is [W]; replay protection beyond the digest-revision binding is [?] |
| Credential variants (classic address, `AddressV2`, delegated) | n/a | only the classic address credential has been exercised; its signing bytes also agree with an independent JavaScript implementation (`@stellar/stellar-base` 15.0.0, offline known-answer vectors; security review section 11) | [T] independent known-answer match for legacy `Address`; [?] other variants untested and refused by the signer |

**An approval is not a debit authorization, and neither substitutes for the other.** Approval states agreement with one proposal digest and moves the session to Approved; it authorizes no token movement. Debit authorization is given at settlement, per debtor, for exactly that debtor's total and transfers. A settlement with every approval but a missing debtor authorization fails [T: `an_approval_is_not_a_debit_authorization`], and a debtor authorization without a complete approval set fails with `MissingApproval` [T]. No claim is made here about wallet compatibility, transaction-envelope correctness, nonce protection or network-level replay protection.

### 5.1 Authorization lifetime and retry policy (EQ-20; founder-approved policy, partly enforced)

| Item | Founder policy (internal decision record) | What the code enforces now | Evidence |
|---|---|---|---|
| Nonce after a failed transaction | accepted as expected Soroban behavior: a failed transaction rolls back its nonce write, so its signed entries stay usable until they expire; not a contract defect | nothing to enforce (protocol behavior); the contract and ABI are unchanged | host source `auth.rs` (review); Stage B B8 observation, not re-run |
| Maximum lifetime | **10 ledgers** | the local signer (`core/clearing/signer/mod.rs`) refuses unless `current < expiration <= current + 10` (checked arithmetic; zero, past, equal-to-current, over-cap and overflow are refused; never clamped); the current ledger is **caller-supplied** (`--current-ledger`), refused when missing or zero. **Trust boundary:** the signer cannot verify it, so a stale value defeats the cap | host tests g5, g8, g9 (offline) |
| Retry | after every failed settlement attempt, discard the old signed envelope and require fresh authorization | the SDK gives each prepared settlement an `authorizationId` and refuses to send it a second time (`ReauthorizationRequired`, kind `policy`), whatever the first outcome; the Console drops a failed settlement's pending action and says re-authorization is required | unit tests (sdk-unit) and a Console test on the real contract in the local sandbox |
| Credentials | legacy `Address` only, fail closed | the signer refuses the whole envelope if any entry is `AddressV2` or `AddressWithDelegates`; source-account entries are left unsigned | host test g10 |
| Contract / ABI | out of scope | unchanged | — |

Limits to keep in mind: 10 ledgers is the approved policy, not a measured or optimal value, and it was not compared with any network's configured maximum. The local sandbox has no signed envelopes, sequence numbers or expiry, so "fresh authorization" there means a newly prepared settlement with grants given again; a hand-built call without an `authorizationId` bypasses the SDK guard, and real signed-envelope freshness (new nonce, new expiry, new signatures from a new simulation) can only be enforced by a network transport, which does not exist. Network behavior was not re-verified in this phase.

### 5.2 Expected intent for signing (F2; founder-approved policy, enforced by the local signer, tested offline)

| Item | Policy | Enforcement and evidence |
|---|---|---|
| Intent | mandatory: the signer signs an authorization entry only if its whole invocation tree equals a tree in a separately supplied, typed, versioned expected intent | `signer/mod.rs` `sign_envelope`; no mode without an intent; tests `authsigner.rs` h0 to h6 |
| Provenance | the TypeScript SDK builds the intent from the digest the debtor approved plus settlement state that must recompute that digest under DB-09 v2 with the pinned network, clearing and token; other calls from the user's own request | `ts/src/sdk/intent.ts` (`settlementIntent`, `intentFromRequirements`, `TobinClient.settlementIntent`); `ts/test/intent.test.ts` |
| Pinned record | network passphrase, clearing contract, session token contract; no secrets; a trust anchor, not proof of honest contracts | `parse_deployment` and `parseDeploymentRecord`; test fixture `deployment.TEST-ONLY.json` is synthetic |
| Shapes per call | create_session, join_session, submit_obligation, finalize_obligations, propose_settlement, approve_settlement, settle (root `settle(session, digest, total)` with one `token.transfer(from, to, amount)` per instruction in ascending payee order), mint | `tests/authintents.rs` replays all eight against the real contracts in the Soroban host: the host-recorded trees equal the TypeScript intents |
| Limits | envelope 128 KiB, XDR depth 200, 32 entries, tree depth 6, 40 nodes, JSON 256 KiB | `read_envelope`, `sign_envelope`, `parse_intent`; tests h4, h5 |
| Still open | the current ledger is caller-supplied; the approved digest must come from the debtor's own record; no wallet or network acceptance | security review section 12 |

### 5.3 Preserved co-signer entries (Option A, founder-approved direction; tested in the test host)

| Question | Answer | Evidence |
|---|---|---|
| Which entries does the signer sign? | only entries whose account belongs to a supplied key, and only after the whole envelope matches the expected intent | `signer/mod.rs` steps 1 to 4; `authsigner.rs` h0 to h4 |
| What happens to other expected entries? | carried through the typed-XDR decode/encode path unchanged (byte equality expected for canonical input and asserted); no local signature verification; a pre-signed entry is not rejected | `authcosigners.rs` c0 to c2 |
| Who checks their validity? | the Soroban host at execution: signature validity against network, nonce, expiration and tree; signer membership and weight; nonce use; expiry; match with the invocation | `auth.rs:2586-2662`, `account_contract.rs:195-250`; the test host rejects every invalid payload form in c1 |
| Does the 10-ledger cap apply? | to entries this tool signs; **not** to preserved co-signer entries | c2 |
| Atomicity | missing, duplicate, unexpected or mismatched entries (even pre-signed) fail the whole call with the envelope unchanged | c3 |
| Unverified | real wallets, multisig thresholds, non-canonical XDR, unused entries, entry order, real network | no test |

## 6. Known source/documentation conflicts

None found between this reference and the sources. Differences from the historical Phase B design are listed in `MVP-1-TEST-PLAN-AND-STAGE-B.md` section 2.
