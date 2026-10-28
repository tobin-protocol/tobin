# Tobin MVP-1 core (TobinClearingV1 and TobinTestToken)

Experimental validation code for the MVP-1 milestone. **Not** Tobin v0.2 (no conformance claim, no v0.2 digest), **not** production-ready, not
independently audited, test token only, no real value, and not intended for real-value use. These contracts were exercised in the Soroban test host
(the tests in this directory), on a disposable local network and in a limited run on the Stellar public testnet with disposable accounts and test
assets (see `../docs/reports/`); they have not been tried with a wallet, and wallet work has not been authorized. Design sources: the baseline
specification `../docs/spec/MVP-1 Implementation Specification — Draft 0.1.md` and the implementation-aligned
`../docs/reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md`; the earlier design-phase records, and the `DB-nn` / `EQ-nn` decision identifiers used
below, are internal and unpublished. Phase A (`../archive/phase-a/`) is unchanged.

## Layout

| Path | Content |
|---|---|
| `token/` | `TobinTestToken`: custom Soroban token, hard supply cap |
| `clearing/` | `TobinClearingV1`: sessions, membership, obligations, finalization, settlement proposals, approvals, atomic settlement |
| `clearing/tests/` | host tests (`support/mod.rs` shared helpers) |
| `Cargo.toml`, `Cargo.lock` | workspace; soroban-sdk 29.0.0 (the Phase A version, offline in the cargo cache) |

## Run

```
export CARGO_NET_OFFLINE=true STELLAR_NO_UPDATE_CHECK=true
export CARGO_TARGET_DIR=<a directory with room: the disk this was developed on is nearly full>
cargo test --offline --workspace                          # native contracts
stellar contract build                                    # Wasm: wasm32v1-none/release/{tobin_clearing_v1,tobin_test_token}.wasm
TOBIN_CLEARING_WASM=<clearing.wasm> TOBIN_TOKEN_WASM=<token.wasm> cargo test --offline -p tobin-clearing-v1   # the same tests against the Wasm
cargo test --offline -p tobin-clearing-v1 --test resources -- --nocapture   # prints the per-operation host-test resource estimates
```

## What is implemented

**Lifecycle** `OPEN -> COMMITTED -> APPROVED -> SETTLED`, no other state. A proposal is data inside COMMITTED/APPROVED, not a state.

* `create_session(creator, session_id, token, max_participants, max_obligations)`: the creator authorizes and is admitted. One token per session,
  fixed here, immutable. No administrator, no constructor configuration: the ceilings (4 participants, 16 obligations, 16 instructions) are
  compile-time constants and **provisional engineering targets, not verified limits**.
* `join_session(session_id, participant)`: needs the joiner's own authorization **and** the creator's, two distinct `require_auth` in one
  invocation; OPEN only. The creator has no other power.
* `submit_obligation(session_id, obligation)`: the debtor authorizes. Checks parties, positive amount, unique id, capacity, and that no
  participant's outgoing or incoming sum (nor the grand total) can overflow `i128`. Stored sorted by id.
* `finalize_obligations(session_id, caller)`: any admitted participant. Freezes participants, token and obligations and stores the obligation
  commitment. All-zero nets are allowed.
* `propose_settlement(session_id, proposer, instructions)`: any admitted participant. Validates the plan against the frozen obligations
  **before** it becomes current and accepts **any** valid plan (it never compares with an off-chain engine's output). Replaceable in COMMITTED
  or APPROVED; a replacement clears every approval and leaves the session COMMITTED, in the same invocation.
* `approve_settlement(session_id, participant, digest)`: every admitted participant must approve the current digest; stale digests are
  rejected and never counted.
* `settle(session_id, digest)`: **no caller restriction and no caller argument**. Needs APPROVED, the current digest, every participant's
  approval, a successful re-validation, and each debtor's authorization `(session, digest, own total)` plus the token's own authorization of each
  transfer. All-or-nothing.
* Queries: `config`, `get_session`, `get_obligations`, `get_obligation`, `get_commitment`, `get_proposal`, `get_settlement`, `get_approvals`,
  `get_approval`, `commitment_bytes`, `proposal_bytes`.

**Validation rules** (`validate_plan`): all parties admitted, `payer != payee`, positive amounts, at most 16 instructions; net
`N = outgoing - incoming` (positive = debtor); `debit[p] = max(0, N_p)` and `credit[p] = max(0, -N_p)` for every participant (conservation and
completeness follow: nothing omitted, duplicated or introduced; nobody pays more than the net debit or receives more than the net credit);
checked arithmetic throughout; instructions strictly ascending by (payer, payee) XDR bytes. The empty list is valid exactly when every net is zero.

**All-zero nets**: finalize; propose the empty list; every admitted participant approves; `settle` makes no token call and records SETTLED with
zero value and zero instructions; a second call fails `AlreadySettled`. No extra state.

**Digests** (working version 2 since EQ-05; version 1 is superseded; **the bytes are the working MVP-1 format approved by the founder, DB-09: a design decision, not independent cryptographic review**): `OC = SHA-256` of a length-prefixed domain tag
`TOBIN-MVP1/OBLIGATIONS/v2`, version (u32 = 2), network id, clearing contract id, session id, token id, participants (ascending by XDR bytes) and
obligations (ascending by id); `PD = SHA-256` of `TOBIN-MVP1/SETTLEMENT/v2`, version, network id, contract id, session id, token id, `OC`, the proposal **revision** (u32) and the
instructions as submitted. Integers big-endian; `i128` 16 bytes; address = one length byte plus the XDR of `ScVal::Address`. Unrelated to the v0.2
`commitment_digest`. No published vectors exist: `tests/digest.rs` compares the contract's bytes with a same-author hand-written encoder.

**TobinTestToken** (policy chosen here; DB-14 fixed only "custom, capped supply"): one minter fixed at construction (cannot be changed,
transferred, revoked or restored); one strictly positive cap fixed at construction; `mint` checks `total + amount <= cap` with checked arithmetic
before any write; no burn (so no re-mint after burn); no allowance, `approve` or `transfer_from`; all arithmetic checked; amounts must be positive;
`transfer` requires the owner's authorization of exactly `(from, to, amount)`. It implements a **subset** of the standard token interface
(`mint`, `transfer`, `balance`, `total_supply`, `cap`, `minter`, `decimals`, `name`, `symbol`), not SEP-41 in full. Error codes start at 101 so a
token error passed through `settle` never reads as a clearing error.

## Engineering choices made while implementing (each is open to founder review; none changes a founder decision)

1. Ceilings are compile-time constants; there is no constructor, owner or upgrade path (EQ-19, EQ-10).
2. Any contract address may be named as a session's token; there is no allowlist (the residual of EQ-09 stays open).
3. Instruction ordering rule: strictly ascending by (payer, payee) XDR bytes (EQ-01); a repeated ordered pair is therefore impossible.
4. Overflow is prevented at obligation submission, so a frozen set is always netable (EQ-12).
5. `settle` re-validates the stored plan and recomputes both digests; any difference is `CorruptState` (EQ-11).
6. A duplicate approval of the current digest is idempotent and returns `false`. **EQ-05 (founder-authorized fix):** the proposal revision (starts at 1, +1 per accepted proposal, checked; at `u32::MAX` a further replacement fails with `Overflow` before anything is written) is part of the proposal digest, so a signature for one revision can never authorize another, including A, then B, then A again. An identical re-proposal is accepted as a new revision with a new digest (the error `ProposalUnchanged` was removed). The approval's authorized arguments are unchanged: the digest already commits to the revision.
7. `settle` lets a transfer failure propagate. Host test `catch.rs` shows a contract that catches the error and returns its own error does roll
   back, but a catch **also swallows a missing authorization** inside the caught call, which would merge two failures that S12 wants distinct
   (EQ-16). So there is no contract-level `TransferFailed`.
8. Debtor authorization shape S1: root `settle(session, digest, payer_total)` with the debtor's own `transfer` sub-invocations (EQ-13).
9. Storage lifetime constants (30 and 60 days of ledgers) are placeholders, not measurements.

## Development bridge (milestone 2)

`clearing/examples/bridge.rs` is a dev-only example (not a contract, not deployable): it hosts the real contracts in the Soroban test host and speaks
JSON lines, so the TypeScript engine, SDK and Console in `../ts/` exercise the real code. It applies the authorization trees a caller states with
`mock_auths` (simulated, unsigned grants that the contract still enforces). It invokes without `try_` and reads the real host error from the panic
text, because `try_invoke_contract` and the host's `try_call` narrow every non-contract error to `Context/InvalidAction`.

## Local authorization signer (Milestone 8, Stage B)

`signer/mod.rs` and `examples/authsign.rs` sign Soroban authorization entries with disposable test keys for local-network experiments (SHA-256 of the `HashIdPreimage::SorobanAuthorization` XDR, ed25519, written as `Vec[Map{public_key, signature}]`); they never sign the transaction envelope and are not a wallet. The signer REQUIRES an expected intent (no blind-signing mode): `authsign --deployment D.json --intent I.json --current-ledger N --expiration-ledger N --key K... < unsigned.b64`; the intent and the pinned deployment record are separate files built by the TypeScript SDK (`ts/src/sdk/intent.ts`), validated strictly, and compared with the envelope as typed XDR. Fixtures: `tests/fixtures/{deployment.TEST-ONLY,auth-intent-v1,intents-all-calls-v1}.json`, regenerated with `node test/fixtures/generate-intents.ts` from `ts/`. Independent known-answer vectors (`tests/fixtures/auth-vectors.json`, `tests/authvectors.rs`; **not included in this publication while their attribution is under review**) come from `@stellar/stellar-base` 15.0.0, generated outside the repository; the signer matches them byte for byte (security review section 11). Policy (EQ-20, recorded in the internal decision record): `--current-ledger N` is required and the expiration must satisfy `current < expiration <= current + 10`; only legacy `Address` credentials are signed and other kinds fail the whole call. Usage and format are in `../docs/reports/MVP-1-MILESTONE-8-STAGE-B-REPORT.md` section 2; tests are `tests/authsigner.rs`.

## What the tests demonstrate (and do not)

101 tests at the last full run of the complete local tree (offline acceptance report, gate 1; 96 without the 5 known-answer tests whose fixture is not published here), all host-level (soroban-env-host 29.0.0), in `clearing/tests` and `token/tests`. Authorization tests use explicit `MockAuth` trees
(contract-kind test addresses); `signed.rs` uses classic accounts and real ed25519 signatures over the authorization preimage. They run against
native code and against the compiled Wasm.

**A caveat about the Rust tests' error classification.** `support::classify` recognizes a host authorization failure by reading the host's whole
diagnostic log, and the host does not record repeated identical failures again. In a test with several failing calls, `is_host_auth()` can therefore be
satisfied by an earlier event. Each rejection is also checked by the unchanged state and balances, and the mutation run still kills every authorization
mutant, but the exact error type of a repeated failure is established precisely only by the TypeScript tests (`ts/test/sdk.test.ts`), whose bridge reads
the real error for every call and which prove each authorization requirement necessary one signer at a time.

**Not demonstrated by these host tests, and not claimed here** (the separate local-network and public-testnet runs are described in `../docs/reports/`): wallet signing; a transaction envelope, transaction source, fee payer or fee-bump; simulation; any network
behavior (nonce consumption, expiry on a network, rollback on a network, ordering inside a ledger); fees; transaction size; production
authorization or replay protection; archival and restore behavior; independent (third-party) agreement of the digests; the standard token
interface in full; any security review. The property test and the digest encoder are same-author.
