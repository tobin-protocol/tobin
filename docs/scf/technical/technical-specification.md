# Tobin technical specification 

Status: technical document of the SCF Build Award (Open Track) submission package, 2026-11-09. Describes the rules the code implements today, not a design. Our own recommended documentation.
Evidence basis: `contracts/clearing/src/lib.rs` (read line by line), `contracts/token/src/lib.rs`, `packages/mvp1-sdk/src/{engine,digest.ts,sdk/prepare.ts}`, `apps/web-console/lib/{registry,auth,stellar,db,server}`. Constants are quoted from the files named. Same-author; tests exist but were not run for this document.

Related: [architecture.md](architecture.md), [stellar-integration.md](stellar-integration.md), [api-reference.md](api-reference.md).

## 1. Scope

Stellar Testnet only. The application records and prepares; the contract validates and executes; separate owner-run tools sign, submit and read back (see architecture section 4). Nothing here describes Mainnet behaviour.

## 2. Obligations and amounts

Application (`apps/web-console/lib/registry/clearing.ts`, `service.ts`):

- Amount: a canonical decimal string `^[1-9][0-9]{0,38}$`, at most `2^127 - 1` (`clearing.ts:19-20`). Whole base units, no decimals, never rounded. Arithmetic uses `BigInt`.
- Parties: debtor and creditor must be different, active participants of the session (`service.ts:348-350`). Participants must be members of the same organization (`service.ts:288`): a session is single-organization at the application level.
- Asset: once any asset is configured as supported, an obligation must name a canonical asset identity (`tobin-asset/v1`: `testnet:native`, `testnet:CODE:ISSUER`, `testnet:contract:C...`); a code alone is refused (`service.ts:339`). One asset identity per session; different assets are never netted (`service.ts:355-357`).
- Reference: free text, at most 200 characters. Obligation id: 32 random bytes as 64 hex characters.
- Edit and void create a new `revision`; a voided obligation cannot change. Writes need the `admin` role and a session in workflow state `configuring` (`#editable`, `service.ts:271`).

Contract (`lib.rs:345-395`): `amount > 0` (`BadAmount`), debtor differs from creditor (`SameParty`), both admitted (`UnknownParty`), unique id (`DuplicateObligation`), at most `max_obligations` (`TooManyObligations`, capacity 1 to 16), and recomputing all nets with checked arithmetic must succeed (`Overflow`). The debtor must authorize the whole call (`lib.rs:384`).

## 3. Netting and the engine

Definition: `net = outgoing - incoming`; positive means net debtor (`packages/mvp1-sdk/src/engine/net.ts:1`, `lib.rs:864`). Participants with zero net transfer nothing.

The engine is deterministic and a convenience (`engine/propose.ts:1-3`): debtors and creditors are sorted by amount descending, ties by address bytes; the first debtor pays the first creditor `min(remaining)`; the result is sorted by (payer, payee) bytes, which is the contract's order. At most `debtors + creditors - 1` instructions. The application batch records the algorithm label `tobin-mvp1-default-proposal/greedy-largest-first` (`settlement.ts:11`). The output is one valid plan; it is not claimed to be minimal or unique, and the contract does not require it (section 8).

In the application each participant is mapped to a bookkeeping handle derived from the session and user ids (`clearing.ts:32`); it is not a wallet.

## 4. Digests (version 2)

Two SHA-256 digests, identical in Rust (`lib.rs:1003-1110`) and TypeScript (`packages/mvp1-sdk/src/digest.ts`); the Rust constants are `DIGEST_VERSION = 2`, domain tags `TOBIN-MVP1/OBLIGATIONS/v2` and `TOBIN-MVP1/SETTLEMENT/v2` (`lib.rs:34,40-41`). Integers are big-endian, `i128` is 16 bytes, an address is one length byte plus the XDR of the address.

| Digest | Bound content |
|---|---|
| Obligation commitment | domain tag, version, network id, clearing contract id, session id, token contract id, participants (ascending by XDR bytes), obligations (ascending by id: id, debtor, creditor, amount) |
| Proposal digest | the same header, the obligation commitment, the proposal revision (u32), the instruction count and each instruction (payer, payee, amount) exactly as submitted |

Because network, contract, session and token are inside the bytes, a digest cannot be moved to another deployment, session or asset. Because the revision is inside, a signature over one revision cannot authorize another, even with identical instructions. Limits of this claim: the encoding is the project's own; the TypeScript and Rust agreement is same-author; no independent cryptographic review exists (`packages/mvp1-sdk/DB-09-DIGEST-REVIEW.md`). The header comment of `digest.ts` still says "WORKING VERSION 1"; the code and constants are version 2.

Application hashes are separate and are not on-chain digests: the calculation `inputHash` is SHA-256 of `{v:1, asset, participants, obligations(id, revision, debtor, creditor, amount)}` (`clearing.ts:44`); the batch `instructionsHash` is SHA-256 over `{v, calculationId, assetId, instructions}` and binds the attempt number from attempt 2 on (`settlement.ts:55-56`).

## 5. Calculation immutability and the current/stale rule

A calculation is an immutable snapshot (`calculations`, update and delete blocked by trigger, `database.ts:172-173`) holding the canonical input, the positions, the gross total and `inputHash`. The server computes it from persisted rows; the client supplies no input or result (`service.ts:413`).

A calculation is `current` only while the hash of the session's present input equals its stored `inputHash` (`clearing.ts:66-70`). Any change to participants or obligations calls `#invalidate` in the same transaction (`service.ts:496`), which records an invalidation for every decision and batch of the session. A newer calculation supersedes the older one. Statuses are derived, not stored (`authorization.ts:10`, `settlement.ts:97`): defence in depth makes a decision or batch `invalidated` when the data changed even if no invalidation row exists.

## 6. Institutional authorization (who may do what)

Roles: `admin` or `member`, `active` or `suspended`; a separate reviewer grant (`org_reviewers`) that only an admin can give or revoke and that `admin` does not imply. Non-members get the same `NOT_FOUND` as for a missing organization (`service.ts:58`).

| Action | Required (as coded) | Source |
|---|---|---|
| Create or edit obligations, add or remove participants, calculate, mark ready, reopen, close | `admin`, session `configuring` (close needs an approved, eligible batch for the current calculation) | `service.ts:271,414,466,482,484` |
| Approve or reject a calculation | active member with the reviewer grant; the named calculation must be the latest and current; one decision per calculation; rejection needs a reason | `service.ts:566-587` |
| Separation of duties on a calculation | the user who ran the calculation, or created, edited or voided any obligation in its input, cannot decide, found from obligation rows and the append-only activity history | `authorization.ts:32-47` |
| Prepare a settlement batch | `admin`; the calculation must have an active approval; every participant still valid; asset canonical and supported; plan passes engine and independent integrity checks | `service.ts:646-674`, `#evaluate` |
| Approve or reject a batch | reviewer grant; must quote the batch `instructionsHash`; the batch must be `awaiting-review` and pass validation; the preparer cannot decide | `service.ts:732-753` (rule at line 746) |
| Start execution record, begin attempt, record signer set | `admin` | `service.ts:800,855,941` |

Not enforced today: that the batch reviewer differs from the person who approved the calculation (only the preparer is barred; the stricter rule is ADR-0001 BD-08, planned). An `admin` can grant themselves the reviewer capability; no rule prevents one person holding admin, reviewer and preparer roles except the per-snapshot separation above. A decision binds to one calculation id; a batch decision binds to one `instructionsHash`. An approval is a database record, not a signature.

## 7. Settlement batch and instructions

`prepareSettlementBatch` stores an immutable batch (triggers on `settlement_batches`, `settlement_instructions`, reviews, invalidations) with: calculation id, canonical asset, instruction count, total, `instructionsHash`, algorithm label, validation results, preparer and time (`service.ts:668`). Each instruction has an id, sequence, payer, payee, asset, amount, network, the approval decision id, and a per-instruction fingerprint (`settlement.ts:61-62`). Integrity checks are computed independently of the engine (`settlement.ts:65-92`): positive whole amounts, known distinct parties, unique pairs and contiguous sequence, one asset, each net debtor pays exactly its net debit and each net creditor receives exactly its net credit, and no participant both pays and receives. At most 16 instructions are supported (`INSTRUCTION_CEILING`). A further attempt on the same calculation after a rejection is numbered and binds into the hash. Batch statuses: `awaiting-review`, `approved`, `rejected`, `invalidated`, `superseded`.

Execution preconditions (`startSettlementExecution`, `service.ts:800`): the batch must be approved and valid, have at least one instruction, and every payer and payee must have exactly one verified Stellar account on the batch network. The execution row snapshots the accounts and is immutable; its first event is `awaiting-signer`.

## 8. On-chain session lifecycle

States: `Open = 1`, `Committed = 2`, `Approved = 3`, `Settled = 4` (`lib.rs:80-85`). A proposal is data, not a state. Ceilings are compile-time constants: 4 participants, 16 obligations, 16 instructions (`lib.rs:30-32`); there is no constructor, administrator or upgrade path.

| Call | State | Checks, in code order | Authorization |
|---|---|---|---|
| `create_session` | none to Open | id unused; creator is an account or contract address; token is a **contract** address; capacities 2..4 participants and 1..16 obligations | creator |
| `join_session` | Open | not already member; capacity | joiner and creator, both for the same call |
| `submit_obligation` | Open | section 2 | debtor |
| `finalize_obligations` | Open to Committed | caller admitted; at least 2 participants; at least 1 obligation; nets computable; stores the obligation commitment; all-zero nets allowed | caller |
| `propose_settlement` | Committed or Approved to Committed | proposer admitted; `validate_plan`; revision = previous + 1 (checked); deletes all approvals | proposer |
| `approve_settlement` | Committed (to Approved when all admitted participants have approved this digest) | proposal exists; participant admitted; digest equals current; duplicate is a no-op | participant |
| `settle` | Approved to Settled | state; digest equals current; every participant has an approval of this digest; obligation commitment recomputed and equal; plan re-validated; proposal digest recomputed and equal; per distinct payer `require_auth_for_args(session, digest, payer_total)`; result and state written; then one `token.transfer` per instruction | each debtor, plus the token's own authorization of each transfer; any caller may submit |

### 8.1 What `validate_plan` verifies (`lib.rs:921-996`)

At most 16 instructions; each amount positive; payer differs from payee; both are participants; instructions strictly ascending by (payer XDR, payee XDR), so a repeated ordered pair is impossible; per-participant debit and credit sums use checked addition; no participant both pays and receives (`OffsettingFlows`); for every participant `debit = max(0, net)` and `credit = max(0, -net)` (`FlowMismatch`). The empty list is valid exactly when every net is zero. The nets come from the frozen on-chain obligations, not from the caller.

### 8.2 What `settle` verifies

Section 8 table row above (`lib.rs:555-665`). The state and result record are written before the transfers on purpose so that a failing transfer reverts them (`lib.rs:640-641`); a token error propagates (`lib.rs:652`). With an empty proposal no token call is made. A second call fails with `AlreadySettled`.

### 8.3 Events

`SessionCreated`, `ParticipantJoined`, `ObligationSubmitted`, `ObligationsFinalized`, `SettlementProposed`, `Approved`, `SessionApproved`, `Settled`. Observability only (`lib.rs:168`).

### 8.4 What the contract does not guarantee

- It does not require or compare the engine's output, and it does not require a minimal number of transfers or a globally optimal plan. Any plan satisfying section 8.1 is accepted, including a different one proposed by any admitted participant.
- It does not check that the session token is a well-behaved token, a particular token, or the application's asset; any contract address is accepted (`lib.rs:277`). The token is not checked for balances before `settle`.
- It does not bind a session to an institution, a legal entity, or an application record. Admission is by Stellar address; the application's participant-to-account mapping is outside the contract.
- It does not verify solvency before settlement: a debtor without enough balance makes `settle` fail and revert; nothing reserves funds in advance.
- No timeouts, abort, default handling, collateral or recovery: a session can stall forever; there is no administrator who can unstick it (`lib.rs:20`).
- It does not enforce authorization-entry lifetime, nonce policy beyond the host's, or fee payment; those belong to the transaction layer.
- Ceilings are provisional engineering targets, not measured capacity; storage lifetime constants (30 and 60 days of ledgers, `lib.rs:37-38`) are unmeasured placeholders; resource use on the network is not measured.
- In several functions (for example `join_session`, `submit_obligation`, `approve_settlement`) validation runs before the authorization call (`lib.rs:321-333`, `350-384`, `505-520`), so a caller without authorization can observe a contract error before the host rejects the missing authorization.
- No independent security review, no fuzzing; the contract tests are same-author host tests (soroban-env-host 29).

The test token (`contracts/token/src/lib.rs`): constructor fixes one minter and one strictly positive cap; `mint` checks `total + amount <= cap` with checked arithmetic; no burn, no allowance, no `transfer_from`; `transfer` needs the sender's authorization of exactly `(from, to, amount)`, rejects non-positive amounts and insufficient balance. Errors 101 to 105. A subset of the standard token interface.

## 9. Authorization-entry lifetime policy and where it is enforced

Policy: an authorization entry should live at most 10 ledgers (ADR-0001 BD-07).

| Place | Enforcement |
|---|---|
| Contract and token | None |
| Offline Rust signer (`contracts/clearing/signer/mod.rs:41,58-78`) | Requires `current < expiration <= current + 10`, with the current ledger supplied by the caller (so unverifiable); only legacy `Address` credentials are signed |
| Owner-run web tool (`lib/stellar/run.ts:19,117`) | `ENTRY_LIFETIME_LEDGERS = 10` sets the `entryValidUntil` value the server returns and the page passes to `authorizeEntry` (`components/settle-run.tsx`). The server's `attachEntry` (`run.ts:121`) checks that the signed entry authorizes the prepared invocation and that simulation accepts it; it does not check the entry's expiration ledger. A test asserts the constant (`test/entry-lifetime-policy.test.ts`) |
| The recorded Testnet run | Used 30 ledgers for the second account's entry by an interactive owner decision (MVP-1.5 verification, Stage 5 log); the 10-ledger value was set in code afterwards and has not been exercised in an attended interactive session (`run.ts:18` comment) |
| SDK | Each prepared settlement gets an `authorizationId` that the client attempts once; a retry needs a newly prepared call (`prepare.ts:131-144`) |

## 10. Execution state machine

States (`lib/registry/settlement-state.ts:8`): `awaiting-signer`, `signing`, `signed`, `submission-pending`, `submitted`, `confirmed`, `reconciled`, `failed`, `expired`, `unknown-outcome`, `reconciliation-required`. Transitions (`settlement-state.ts:11-22`):

| From | To |
|---|---|
| awaiting-signer | signing |
| signing | signed, awaiting-signer, failed |
| signed | submission-pending, expired |
| submission-pending | submitted, failed, expired, unknown-outcome |
| submitted | confirmed, failed, expired, unknown-outcome |
| unknown-outcome | confirmed, failed, expired, unknown-outcome |
| confirmed | reconciled, reconciliation-required |
| reconciliation-required | reconciled |
| reconciled, failed, expired | terminal |

Evidence gates in `advanceExecutionAttempt` (`service.ts:894-923`): `submission-pending` requires a transaction hash and step, recorded before sending, unique per hash and per attempt step; `confirmed` requires an independent network read of a recorded hash reporting SUCCESS; a failure after signing requires a network read reporting FAILED or evidence of rejection before inclusion; `expired` from `unknown-outcome` requires a read finding nothing and a passed validity window; `reconciled` from `confirmed` requires a matching comparison. `verifyChainOutcome` (`settlement-state.ts:43`): NOT_FOUND or UNAVAILABLE is `unknown-outcome` (never failed, never confirmed), PENDING stays pending, FAILED is failed, SUCCESS is reconciled only if the multiset of transfers equals the approved batch exactly. Retry rules (`retry-policy.ts:85`): one live attempt; an unknown outcome blocks any new attempt; a confirmed or reconciled execution is never retried; `failed` needs an explicit review flag; `expired` allows a new attempt after revalidation.

Which routes can reach which states: `POST .../execution/start` creates the execution record in `awaiting-signer`; `POST .../execution/attempts/begin` creates an attempt in `awaiting-signer`. No other route moves state. `advanceSettlementExecution` and `advanceExecutionAttempt` are called only from tests. The owner-run tool keeps its own in-memory map of attempts (`run.ts:58`) and does not use this module or the database; its outcomes are appended to a local JSON-lines file (`run.ts:62-63`). So in the database, execution state exists only up to `awaiting-signer`; the later states are defined and tested rules without a production caller.

## 11. Data model summary

SQLite, eight migrations (`lib/db/database.ts`): 1 users, auth sessions, organizations, memberships, org wallet claims, invitations, sessions, participants, activity; 2 obligations and calculations; 3 reviewers, decisions, invalidations; 4 supported assets, batches, instructions, batch reviews and invalidations; 5 asset identity, wallet challenges and verifications, executions and execution events; 6 attempts, attempt events, attempt transactions; 7 signer-set snapshots; 8 user wallets, auth challenges, auth audit, onboarding, institution fields, membership status.

Immutable by trigger (update and delete aborted): `activity`, `calculations`, `authorization_decisions`, `authorization_invalidations`, `settlement_batches`, `settlement_instructions`, `settlement_batch_reviews`, `settlement_batch_invalidations`, `settlement_executions`, `settlement_execution_events`, `settlement_attempts`, `settlement_attempt_events`, `settlement_attempt_transactions`, `signer_set_snapshots`, `auth_audit`; `user_wallets` cannot be deleted, its identity columns cannot change and a revoked row is final. Mutable: users, auth sessions, organizations, memberships, obligations (revisioned), participants (soft removal), invitations, challenges, supported assets, onboarding. Uniqueness enforced by schema: one decision per calculation, one execution per batch, one transaction hash per attempt step, one active wallet per network and key. Session provenance labels: `fixture`, `local-draft`, `chain-read`, `chain-confirmed`; sessions created through the API are `local-draft` only (`service.ts:225`) and no route sets the other two.

## 12. Error taxonomy

| Layer | Codes |
|---|---|
| Registry (`lib/registry/http.ts:30`) | NOT_FOUND 404, INVALID 400, FORBIDDEN 403, EXISTS 409, LAST_ADMIN 409, INVALID_STATE 409, NOT_VERIFIED 409, FIXTURE 409, INVALID_INVITATION 400, RATE_LIMITED 429, STALE 409, SEPARATION_OF_DUTIES 403, INVALID_CHALLENGE 400; others default to 400; unauthenticated 401; missing header 403; unavailable database 503; unexpected 500 |
| Auth (`lib/auth/http.ts:78`) | INVALID 400, INVALID_CREDENTIALS 401, AUTH_FAILED 401, UNAUTHENTICATED 401, RATE_LIMITED 429, REGISTRATION_FAILED 409, WALLET_UNAVAILABLE 409, LAST_METHOD 409, INVALID_STATE 409, NOT_FOUND 404 |
| Clearing contract | 27 codes: 1 SessionNotFound, 2 SessionExists, 3 WrongState, 4 NotParticipant, 5 NoProposal, 6 MissingApproval, 10 TooManyParticipants, 11 ParticipantExists, 12 BadAddressKind, 13 BadCapacity, 20 TooManyObligations, 21 DuplicateObligation, 22 BadAmount, 23 SameParty, 24 UnknownParty, 25 ObligationNotFound, 30 TooFewParticipants, 31 NoObligations, 33 TooManyInstructions, 34 InstructionOrder, 35 InstructionSelfPay, 36 FlowMismatch, 37 OffsettingFlows, 38 Overflow, 40 DigestMismatch, 50 AlreadySettled, 90 CorruptState (`lib.rs:47-75`) |
| Token contract | 101 BadAmount, 102 InsufficientBalance, 103 CapExceeded, 104 Overflow, 105 BadCap |
| Host | a missing or wrong authorization is a host authorization error, not a contract code |

## 13. Limits

| Item | Value | Source |
|---|---|---|
| Request body (console JSON) | 4096 characters | `registry/http.ts:39` |
| Request body at the web proxy | 8 KiB | `proxy-policy.ts:8` |
| Organization name | 2 to 80 characters; description up to 500; control characters and `<`, `>` refused | `service.ts:36-41,69-70` |
| Session label | 1 to 80 | `service.ts:225` |
| Obligation reference; rejection reason; execution detail | up to 200; 1 to 500; 1 to 300 | `service.ts:358,582,838` |
| Invitee | 3 to 120 characters; token valid 7 days | `service.ts:157,30` |
| Email; display name; password | 3 to 254; 1 to 80; 12 to 128 characters (scrypt, N = 2^16) | `auth/service.ts:95,97,242` |
| Wallets per user | 5 | `auth/service.ts:45` |
| Session lifetime | cookie session 8 hours; wallet session idle 2 hours, absolute 24 hours; wallet challenge 5 minutes | `auth/service.ts:37-39`, `wallet-challenge.ts:5` |
| Per-user and per-key rate limits | login 5 failures per email per 15 minutes; invitation accept 10 failures per user per 15 minutes; wallet challenge 10 per key and 300 global per 10 minutes; wallet verify 10 failures per 15 minutes | `auth/service.ts:41-47`, `registry/http.ts:31-32` |
| Per-address limits (hosted mode only) | register 10 per hour; login 20 failures per 15 minutes; wallet challenge 30 per 10 minutes; wallet verify 20 failures per 10 minutes | `auth/http.ts:24-29` |
| Concurrent password hashes | 4 | `auth/http.ts:46` |
| Public Discover page size | 1 to 50, default 20 | `public/discover.ts:13` |
| Contract ceilings | 4 participants, 16 obligations, 16 instructions | `lib.rs:30-32` |
| Owner tool amount cap | 1 base unit | `run.ts:20` |

In the application the participant and obligation ceilings are checked only when an execution plan is built (`execution-plan.ts:92,94`); the 16-instruction ceiling is checked at batch preparation.

## 14. Requirement-to-code traceability

| Requirement | Code | Test (exists; not run here) |
|---|---|---|
| Net = outgoing - incoming | `engine/net.ts`, `lib.rs:866` | `packages/mvp1-sdk/test/engine.test.ts`, `contracts/clearing/tests/lifecycle.rs` |
| Contract accepts any valid plan | `lib.rs:921` | `contracts/clearing/tests/proposal.rs` |
| Replacement clears approvals; revision in digest | `lib.rs:458-482` | `proposal.rs`, `digest.rs` |
| Debtor authorizes own transfers | `lib.rs:631`, `sdk/prepare.ts:133` | `settlement.rs`, `signed.rs` |
| Approvals bound to one calculation | `service.ts:566-587`, `authorization.ts` | `apps/web-console/test/authorization.test.ts` |
| Stale calculation invalidates decisions and batches | `service.ts:496`, `clearing.ts:66` | `authorization-ops.test.ts`, `settlement-ops.test.ts` |
| Separation of duties (calculation; batch preparer) | `authorization.ts:32`, `service.ts:746` | `authorization.test.ts`, `settlement.test.ts` |
| History is immutable | triggers in `database.ts` | `backend-db.test.ts` |
| Wallet ownership by challenge | `wallet-proof.ts`, `auth/service.ts` | `wallet-auth.test.ts` |
| No automatic retry; unknown is unknown | `run.ts`, `rpc.ts:129-159`, `retry-policy.ts` | `run.test.ts`, `stellar-rpc.test.ts`, `attempts-ops.test.ts` |
| On-chain state equals approved plan | `compare.ts` | `stellar-plan.test.ts` |
| Hosted mode fails closed | `config.ts`, `guards.ts`, `instrumentation.ts` | `guards-hosted.test.ts`, `apps/web/test/hosting.test.ts` |
| Entry lifetime 10 ledgers | `run.ts:19`, `signer/mod.rs:41` | `entry-lifetime-policy.test.ts`, `contracts/clearing/tests/authsigner.rs` |
