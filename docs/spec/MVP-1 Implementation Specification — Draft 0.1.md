# Tobin Clearing Protocol
## MVP-1 Implementation Specification — Draft 0.1

**Status:** Prepared for technical review  
**Scope:** Experimental Stellar testnet MVP  
**Implementation status:** Not started by this specification  
**Approval boundary:** Design approval does not authorize repository modification, deployment, or publication.

---

## 1. Purpose

Build a working clearing application on Stellar testnet that allows a small group of participants to submit payment obligations, compute a deterministic net settlement, approve the resulting settlement, and execute actual transfers of a dedicated test token through a Soroban smart contract.

The MVP must demonstrate a complete, verifiable happy path and reject invalid or unauthorized operations.

It must not claim full conformance with Tobin Protocol v0.2 or readiness for real-value settlement.

## 2. Deliverables

1. **TobinClearingV1:** Rust/Soroban contract that enforces session lifecycle, participant membership, obligation integrity, settlement validation, authorization, token transfers, and terminal state.
2. **TobinTestToken:** A dedicated test token for testnet demonstrations. Its minting authority and supply controls must be explicit.
3. **Netting engine:** Deterministic TypeScript module that computes proposed settlement instructions from submitted obligations.
4. **TypeScript SDK:** Typed client for session creation, participation, obligations, approvals, settlement construction, transaction preparation, and queries.
5. **Tobin Console:** Web interface for participants to create or join sessions, review obligations, inspect net positions, approve settlements, and view results.
6. **Automated tests and demonstration:** Contract unit and integration tests, netting tests, SDK tests, and a reproducible testnet walkthrough.

## 3. Architecture and trust boundaries

- The **off-chain netting engine** proposes a settlement. It is not trusted to determine what the contract accepts.
- The **Soroban contract** independently validates the submitted settlement against the committed obligations and recorded approvals.
- The **test token** executes the actual transfers.
- The **SDK and console** prepare transactions and coordinate signatures. They must not have unilateral authority to move participant funds.
- A **wallet or transaction-signing integration** supplies the required account authorizations. The signing workflow must be proven before the UI is considered complete.

No backend operator may override contract validation or manufacture participant approval.

## 4. Session lifecycle

The MVP supports only:

`OPEN → COMMITTED → APPROVED → SETTLED`

### OPEN

- A session is created with a unique identifier, token contract, creator, and bounded participant and obligation capacities.
- The creator is admitted as a participant.
- Additional participants can join only while the session is open.
- Participants and the token cannot be changed after finalization.
- Only admitted participants may submit obligations.

### COMMITTED

- The obligation set is frozen.
- The contract computes or verifies the canonical obligation commitment and settlement digest.
- The committed obligation set cannot be changed.
- A proposed settlement must be derived from that exact set.

### APPROVED

- Every required participant has approved the same settlement digest.
- Duplicate approval attempts must be idempotent or rejected without changing the result.
- Any change to the settlement invalidates the prior approval set; the frozen committed data itself cannot be amended.
- Approval records are not authorization to debit tokens.

### SETTLED

- The contract has validated the instructions and obtained the required debit authorizations.
- Every transfer has succeeded within the same atomic contract invocation.
- The terminal outcome is recorded.
- A subsequent settlement attempt cannot transfer funds again.

**Excluded states:** `DEFAULTED`, `ABORTED`, and `SETTLEMENT_FAILED_NO_DEFAULT` are outside this MVP. No production recovery, collateral, or cross-session carryover behavior is implied.

## 5. Proposed contract interface

The names and signatures below are logical requirements, not finalized Rust ABI declarations.

| Function | Required behavior |
|---|---|
| `initialize` | Set immutable or explicitly governed configuration once. |
| `create_session` | Create a session and admit its creator. |
| `join_session` | Admit a participant while the session is open. |
| `submit_obligation` | Record a valid obligation from an admitted participant. |
| `finalize_obligations` | Freeze obligations and establish the canonical commitment. |
| `approve_settlement` | Record a participant's approval of the exact settlement digest. |
| `settle` | Validate the settlement, require debit authorization, transfer tokens, and record `SETTLED`. |
| `get_session` | Return session status and configuration. |
| `get_obligation` | Return a stored obligation. |
| `get_settlement` | Return the committed digest, instructions, and terminal result. |
| `get_approval` | Return a participant's recorded approval. |

The implementation may use bounded batch functions where that is more efficient, provided each obligation is validated and duplicate or omitted entries cannot bypass the rules.

## 6. Obligation model

Each obligation represents a payment owed by one admitted participant to another.

Required logical fields:

- Unique obligation identifier within the session.
- Debtor address.
- Creditor address.
- Positive integer amount in the token's smallest unit.

Validation requirements:

- Debtor and creditor must be distinct.
- Both addresses must be admitted participants.
- Amount must be greater than zero.
- Duplicate identifiers are rejected.
- Arithmetic must use checked operations; overflow causes rejection.
- No obligation may be added, removed, or modified after commitment.
- The token is fixed for the session.
- The contract must enforce the configured obligation limit.

The exact identifier type, integer representation, storage layout, and serialization remain to be finalized in the ABI design.

## 7. Deterministic netting

For participant \(i\):

\[
N_i = O_i - I_i
\]

where \(O_i\) is the sum of outgoing obligations and \(I_i\) is the sum of incoming obligations.

- \(N_i > 0\): net debtor.
- \(N_i < 0\): net creditor.
- \(N_i = 0\): no net transfer.

The engine generates transfers from net debtors to net creditors. The total debit must equal the total credit:

\[
\sum_i \max(N_i,0)
=
\sum_i \max(-N_i,0)
\]

The contract must independently establish that:

1. Each instruction uses admitted participants and a positive amount.
2. Total debits equal total credits.
3. Every participant's net debit or credit agrees with the frozen obligation set.
4. No participant pays more than their committed net debit.
5. No participant receives more than their committed net credit.
6. The instruction set is complete and does not duplicate, omit, or introduce value.

The implementation must define one canonical algorithm and instruction ordering. Where applicable, it should reuse the previously discussed `tobin-settle-v1` ordering decisions without claiming that this MVP is a complete implementation of the v0.2 protocol.

## 8. Canonical encoding and settlement digest

Before implementation, define a versioned canonical binary encoding for:

- Session identifier.
- Token contract address.
- Ordered participant set.
- Ordered obligation set and its amounts.
- Settlement instruction set.
- Encoding/version identifier.

The settlement digest must bind approvals to the exact session, committed obligations, token, and settlement instructions.

Requirements:

- No ambiguous serialization.
- Explicit integer widths and byte order.
- Explicit address encoding.
- Explicit collection ordering and length encoding.
- No reliance on JSON string formatting as the canonical representation.
- Domain separation between the MVP, digest purpose, and encoding version.
- Published test vectors for canonical bytes and resulting digest.
- Identical results across TypeScript and Rust implementations.

The digest format and hash algorithm must be selected and documented before the ABI is frozen. It must not silently reuse or redefine a provisional v0.2 digest.

## 9. Authorization and token movement

Three different concepts must remain separate:

1. **Membership:** Whether an address is admitted to a session.
2. **Settlement approval:** Whether a participant approved the settlement digest.
3. **Debit authorization:** Whether the account permits its tokens to be transferred in the actual settlement invocation.

Membership and approval must never substitute for debit authorization.

### Required settlement behavior

- Every debtor whose net debit is positive must authorize the actual transfer of the test token.
- The authorization must be bound to the intended settlement operation and amounts, not to a general unrestricted spending permission.
- The contract must reject settlement when any required authorization is absent or invalid.
- The implementation must not assume that an approval stored in contract state automatically authorizes a token transfer.
- The design must not introduce an escrow or standing allowance model without a separate design decision.

**Required technical spike:** Prove that multiple independent participant accounts can authorize the same `settle` invocation and its nested token transfers using the intended Soroban authorization model. Document the transaction simulation, authorization entries, wallet support, and signing sequence. If this cannot be achieved with the proposed direct-transfer model, stop and present alternatives for approval rather than silently changing the custody model.

## 10. Atomic settlement

The `settle` invocation must validate all instructions and required authorizations before attempting transfers wherever practical.

The entire settlement must be atomic:

- All required transfers succeed and the session becomes `SETTLED`; or
- The invocation fails and no partial token transfers or terminal-state changes persist.

This requirement must be tested with deliberately failing transfers, including a failure after an earlier transfer would otherwise have succeeded.

The implementation must verify rollback behavior using the actual contract invocation and token contract in the test environment. A passing mock-only test is insufficient.

## 11. Storage and provisional bounds

Initial design targets, pending measurement:

| Parameter | Provisional target |
|---|---:|
| Participants per session | 4 |
| Obligations per session | 16 |
| Settlement instructions | 16 |
| Tokens per session | 1 |
| Successful settlements per session | 1 |

These are **engineering targets, not approved protocol limits**.

The implementation specification must define storage keys, value schemas, authorization records, event payloads, and maximum serialized sizes. Correctness-critical state must not rely on temporary storage that can expire.

Measure instruction count, CPU, memory, transaction size, storage reads/writes, and fees using worst-case valid inputs. If the targets exceed practical resource limits, report measured results and propose revised limits before changing them.

## 12. Errors, events, and queries

Define stable error codes for at least:

- Unauthorized caller.
- Participant not admitted.
- Session not in the required state.
- Invalid or duplicate obligation.
- Capacity exceeded.
- Invalid settlement digest.
- Missing approval.
- Missing debit authorization.
- Invalid or unbalanced settlement.
- Arithmetic overflow.
- Token transfer failure.
- Session already settled.

Events should identify session creation, participant admission, obligation submission, commitment, approval, and settlement. Events are observability records; they must not replace authoritative contract storage.

Error and event schemas must be documented and tested before the SDK treats them as stable.

## 13. Acceptance-test requirements

The MVP cannot be considered implementation-ready until the test plan covers:

1. Valid session creation and participant admission.
2. Rejection of non-admitted callers.
3. Zero amounts, self-payments, duplicate IDs, and arithmetic overflow.
4. Capacity limits and post-finalization mutation attempts.
5. Deterministic netting against independently calculated expected results.
6. Rejection of incorrect, incomplete, duplicated, or unbalanced settlement instructions.
7. Approval binding to the exact digest and rejection of mismatched approvals.
8. Missing or invalid debit authorization.
9. Successful settlement with actual test-token balance changes.
10. Insufficient debtor balance.
11. Failure of a later transfer with verification that earlier transfers and state changes roll back.
12. Duplicate settlement and attempted reopening.
13. Cross-language digest and canonical-encoding test vectors.
14. Worst-case resource use at the proposed bounds.
15. Integration tests with the actual token contract, not only mocks.

Include property-based tests for conservation of value, deterministic output, and net-position correctness.

## 14. SDK and console requirements

The SDK must expose typed methods for the contract interface, deterministic netting, canonical digest calculation, transaction preparation, and state queries.

The console must:

- Show session status and admitted participants.
- Present obligations before commitment.
- Display the net position of each participant.
- Show the exact settlement instructions and digest before approval.
- Explain which accounts still need to approve or authorize debits.
- Show transaction submission and confirmation states separately.
- Display final token balances and the recorded outcome.

The console must not show “settled” based solely on transaction submission; it must confirm successful execution.

## 15. Build sequence

**Phase A — Authorization and atomicity spike**
- Create a minimal local contract/token experiment.
- Prove multi-account authorization for direct token transfers.
- Prove rollback when a later transfer fails.
- Record test evidence and limitations.

**Phase B — Contract core**
- Implement session lifecycle, participant membership, obligations, canonical commitment, settlement validation, and state queries.
- Add unit, authorization, and invariant tests.

**Phase C — Netting and SDK**
- Implement the deterministic TypeScript engine.
- Match Rust and TypeScript digest vectors.
- Add SDK transaction preparation and error handling.

**Phase D — Console**
- Implement the end-to-end participant flow.
- Connect wallet signing and transaction-status tracking.
- Add usable error states and settlement review.

**Phase E — Testnet demonstration**
- Deploy only after explicit authorization.
- Deploy the dedicated test token and clearing contract.
- Execute a small successful settlement with test tokens.
- Publish reproducible test evidence only after review and separate approval.

## 16. Explicit exclusions

This MVP does not implement or claim:

- Real-value settlement or production readiness.
- Collateral, default determination, recovery, or surplus allocation.
- Aborted or settlement-failure terminal branches.
- Cross-session carryover.
- Multi-token clearing.
- Full Tobin v0.2 conformance.
- Approval of unresolved v0.2 specification issues.
- Production security audit or economic guarantees.

## 17. Implementation gate

Before repository modification, resolve and document:

- [ ] Canonical encoding and digest format.
- [ ] Multi-party authorization prototype results.
- [ ] Direct token transfer and rollback proof.
- [ ] Final logical contract ABI and types.
- [ ] Storage schema and lifecycle invariants.
- [ ] Resource measurements and justified bounds.
- [ ] Acceptance-test plan and test-vector format.
- [ ] SDK and wallet integration approach.

After these are resolved, produce a repository-specific implementation plan and request separate authorization to begin coding.

**Governance boundary:** This specification is an experimental MVP artifact. It does not alter `SPECIFICATION-v0.2-DRAFT.md`, the v0.2 conformance corpus, schemas, reference models, frozen vectors, criterion evidence, or any M0 gate/status.