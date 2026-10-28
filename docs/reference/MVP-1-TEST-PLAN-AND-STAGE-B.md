# Tobin MVP-1: implementation-aligned test plan and the Stage B local signing spike plan

> **Historical status note (added for publication, 2026-10-27).** This plan describes the state on 2026-10-26, before any network work: its statements that nothing has been run, that Stage B is "not run" and "not authorized", and that no existing test runs against a network or a wallet are preserved as written for that date. Stage B and a later public-testnet run were documented separately; no wallet was involved in either. This note does not claim that every planned or proposed case was later run or passed. Test counts below are those of the original date.

> **Identifier note (added for publication).** `DB-nn` and `EQ-nn` identify decisions and open questions recorded in internal, unpublished design records. Where this document relies on such a decision it states the resulting behaviour; the approved specification and the ABI reference are the public sources.

Written 2026-10-26 (Milestone 8, Stage A). **Stage A is documentation only. Nothing in section 3 has been run, and no signer flow described there is verified.** Companion: `MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md` (what each entry point requires), `MVP-1-MILESTONE-7-READINESS.md` (status and blockers).

## 1. Implementation-aligned test plan

Existing = a test that exists in the repository today (Rust: `core/clearing/tests/`, `core/token/tests/token.rs`; TypeScript: `ts/test/`; browser: `ts/test/browser/`). All existing tests run in the Soroban test host or a local Chrome against the host-backed bridge; **none runs against a network or a wallet**. Proposed = not yet written, with a proposed id. "Stage B" = needs the authorization and tooling of section 3.

| Area | Case | Existing coverage | Status |
|---|---|---|---|
| Session creation, immutable token | create; token and capacities fixed; no mutator; classic-address token refused; two sessions keep their own tokens | `lifecycle.rs`: `create_admits_the_creator_and_fixes_the_terms`, `create_rejects_bad_inputs`, `each_session_keeps_its_own_token_and_capacities`; `ts/test/sdk.test.ts` | covered (host) |
| Join | joiner and creator both authorize; one alone fails; authorization does not carry to another joiner or session | `joining_needs_the_joiners_and_the_creators_authorization`, `an_authorization_for_one_joiner_or_session_does_not_carry_to_another`, `joining_rules`; `signed.rs` s1, s2 (real ed25519 on classic accounts) | covered (host); wallet = Stage B |
| Obligation authorization and validation | debtor only; zero, negative, self, unknown, duplicate, capacity, overflow | `obligation_rules`, `only_the_debtor_can_authorize_an_obligation`, `an_obligation_that_would_overflow_a_sum_is_rejected_at_submission` | covered (host) |
| Finalization, proposal validity | any participant finalizes; freeze; any valid plan accepted; each invalid class rejected; engine default is advisory | `any_admitted_participant_may_finalize`, `finalization_rules_and_the_freeze`, `invalid_plans_are_rejected_with_specific_errors_and_change_nothing`, `any_valid_plan_is_accepted_not_only_one_canonical_output`, `property.rs`; `ts/test/engine.test.ts`, `interop.test.ts` | covered (host); oracle same author |
| Version-2 digest parity, revision binding | Rust bytes = TS bytes for revisions 1-3; each bound field changes the digest | `digest.rs`; `ts/test/digest.test.ts` (7 Rust-generated fixtures), `interop.test.ts` (40 live sessions) | covered (host); same author |
| Replacement, approval invalidation | clears approvals; APPROVED returns to COMMITTED; failed replacement changes nothing; A, B, A stale approval refused; overflow atomic | `a_replacement_invalidates_every_earlier_approval`, `a_replacement_from_approved_returns_the_session_to_committed`, `a_failed_replacement_leaves_the_proposal_revision_and_approvals_unchanged`, `a_stale_approval_signed_for_revision_1_cannot_count_at_revision_3_after_a_b_a`, `revision_overflow_fails_atomically...`; `sdk.test.ts` (EQ-05), `console.test.ts` (A, B, A), browser step 7b | covered (host/browser) |
| Debtor authorization, exact amounts and destinations | missing, wrong total, wrong digest, larger or smaller transfer, other payee, omitted transfer, bystander signer | `a_missing_or_wrong_debtor_authorization_fails_and_changes_nothing` (10 mutations); `signed.rs` s3-s5; `sdk.test.ts` necessary-and-sufficient | covered (host); real wallet = Stage B |
| Tampered, expired, wrong-network authorization | altered tree after signing; entry for another network; expired entry | `signed.rs`: `s5_bad_signatures_and_tampering_are_rejected...`, `s6_an_expired_entry_is_rejected_and_a_fresh_one_settles` | covered (host); network-level behavior = Stage B |
| Malformed authorization (garbled credential bytes, wrong credential type) | not exercised beyond wrong key | none | **proposed** T-AUTH-M1 (Stage B) |
| Insufficient balance, transfer failure | token error passes through; whole settlement reverted | `a_later_transfer_that_fails_reverts_the_earlier_transfers_the_state_and_the_event`, `a_failure_at_the_first_or_the_last_transfer_also_reverts_everything`; `sdk.test.ts` | covered (host) |
| Atomic rollback after a later failure | earlier transfers, marker, event all revert; caught error returned by a contract also rolls back; swallowed error does not | same plus `catch.rs` (4 tests) | covered (host); network-level rollback = Stage B |
| Multi-debtor settlement | two debtors, four transfers | `settlement.rs` four-participant cases; `signed.rs` s4; browser journey step 11 | covered (host) |
| All-zero settlement | empty proposal, approvals still required, no token call, once | `all_zero_nets_complete_through_the_no_transfer_path`; browser step 12 | covered (host) |
| Repeat settlement, stale Console state | `AlreadySettled`; stale tab refreshes to the true state | `a_session_settles_once_and_cannot_be_reopened`; browser step 11 | covered (host/browser) |
| Token cap and authority | cap reachable, never exceeded, overflow safe, only minter mints, no burn/setter | `core/token/tests/token.rs` (9 tests) | covered (host) |
| Error handling, expected state after failure | typed errors; state unchanged | SDK `sdk-unit.test.ts` (tables equal the Rust enums), `sdk.test.ts` typed-errors test | covered (host) |
| Resource measurement | per-operation CPU/memory/entries | `resources.rs` (host estimates, native or Wasm) | partial; network = Stage B |
| Console honesty, layout, badge | sandbox wording, no overflow at 420 and 1200px, badge pinned | `console-view.test.ts`, browser journeys, `badge.mjs` | covered (one browser) |
| Fee-payer / transaction-source independence | a relayer with no role submits | host only (`only_the_debtors_authorize_and_the_submitter_has_no_role`) | Stage B (T-SRC-1) |
| Nonce consumption and replay of a signed entry | replaying a used entry; replaying across transactions | none | **proposed**, Stage B (T-REPLAY-1, T-REPLAY-2) |

## 2. Historical Phase B plan versus the implementation

The internal Phase B test matrix (unpublished; 167 planned tests, none implemented as written) is **superseded by section 1 for implementation purposes and kept internally as history** (a status note was added at its top; no row was rewritten). Differences:

| Phase B design or plan | Implementation |
|---|---|
| T-Q-10: an identical resubmission is refused (`ProposalUnchanged`, error 41) | **Changed by EQ-05**: accepted as a new revision with a new digest; error 41 removed [T] |
| Digest version 1 layout and tags `.../v1` without a revision | version 2: tags `.../v2`, scheme version 2, revision in the proposal digest (founder-approved DB-09) |
| `NothingToSettle`(32), `NotCanonical`(39), `NoInstructions`(42) | retired; all-zero sets finalize, an empty plan is valid exactly when every net is zero, a wrong plan is `FlowMismatch` |
| Instruction ordering and the validation algorithm open (EQ-01) | chosen: strictly ascending (payer, payee) by XDR bytes; rules in `validate_plan` (engineering choice, reviewable) |
| `get_settlement` returns proposal and result together | split: `get_proposal` and `get_settlement` (result only) |
| `__constructor(config)` for the clearing contract | none; ceilings are compile-time constants; no administrator |
| Token tests T-T planned against any custom token policy; trustline/freeze tests for classic assets | one fixed minter and cap, no burn; trustline and freeze tests do not apply to a contract-storage token |
| Levels N (network) and W (wallet) tests | none exist (not authorized) |
| TypeScript engine, SDK and Console tests were "planned groups" | exist (`ts/test/`, 75 tests) plus browser journeys |
| T-S-17 catch-and-return variant | implemented as `catch.rs` |

The plan is **not** claimed fully current beyond the rows above; it was reconciled against the sources and tests listed, not against every historical row.

## 3. Stage B: bounded local signing spike (PLAN ONLY; not run, not authorized)

**Purpose:** establish, on a local Stellar network with disposable keys, what the host-level tests cannot: real authorization entries signed by distinct keys, transaction assembly and submission, source-account versus contract authorization, nonce/expiry/network behavior, rollback with real balances, and resource figures. It requires a separate written founder authorization (DB-13) that names local-network use; no part of it has been started.

### 3.1 Tooling inspected on 2026-10-26 (verified by `--help` or version output)

| Item | Finding |
|---|---|
| Stellar CLI | 28.0.0. `stellar contract invoke` has `--build-only`, `--send`, `--sign-with-key`, `--sign-with-lab`, `--sign-with-ledger`, `--auto-sign`, `--auth-mode {enforce,root,non-root}`, `--instructions`, `--instruction-leeway`, `--resource-fee`, `--inclusion-fee`, `--rpc-url`, `--network-passphrase`. `stellar tx` has `simulate`, `sign` (`--sign-with-key`, `--hd-path`, lab, ledger), `send`, `decode`, `encode`, `hash`, `new`, `operation`, `update`, `fetch`. `stellar keys generate/add/public-key/fund/secret` exist. |
| Local network | `stellar container start|stop|logs|use` ("Start a container running a Stellar node, RPC, API, and friendbot"). Note: `stellar network container` does **not** exist in this version. |
| Docker | CLI 27.2.0 present; **the daemon was not running when this was written**. Starting a container would need Docker Desktop running and would pull a Stellar quickstart image from a registry (network access), which Stage A does not authorize. Whether the image is already cached locally is unknown (daemon down). |
| Node / Rust | Node 24.14.0; Rust 1.96.0; soroban-sdk 29.0.0; `stellar-xdr` 28.0.0 and `ed25519-dalek` in the offline cargo cache. |
| JavaScript Stellar SDK | **not installed** (no `@stellar` package in any `node_modules` of this workspace); installing one needs network access and authorization. |
| Existing CLI config | Any existing user-level CLI configuration (identities, networks, contract ids) **must not be read**. Stage B must use an isolated `--config-dir` and must never read, list or print existing identities. |

### 3.2 Unverified assumptions (to be checked at the start of Stage B, not asserted now)

1. That `stellar container start` brings up a working local RPC and friendbot with the installed CLI and a locally available image.
2. That `stellar contract invoke --build-only` plus `stellar tx simulate` returns unsigned authorization entries for **non-source** accounts, including the custom-argument root `settle(session_id, digest, payer_total)` and its `token.transfer` sub-invocations. This is the central unknown: `--auth-mode` values suggest recording is supported, but how the entries are returned, and whether `stellar tx sign` signs address-credential entries for accounts other than the source, is **not established**.
3. That the CLI can sign such entries at all. If it cannot, a small purpose-built signer (for example a Rust binary using `stellar-xdr` and `ed25519-dalek`, as `signed.rs` already does in the host) is the fallback; writing it needs separate approval. No claim is made that this reproduces what a real wallet does.
4. That a real wallet (Freighter-class) signs custom-argument authorization entries. Not tested; a wallet pass is a later stage, not Stage B.

### 3.3 Accounts, signers, isolation

- All keys are **disposable test keys generated into an isolated config directory outside the repository** (for example under the session scratch area); secret keys are never printed, requested, written into `tobin-protocol/`, or committed. Only public addresses appear in reports.
- Accounts: `minter` (the token's fixed minter), `relayer` (transaction source and fee payer; no role in any session), `alice` (creator and debtor), `bob` (debtor), `carol` (creditor), `dave` (creditor), `mallory` (a funded account that is not a participant; wrong-signer tests).
- Signer type: local key via `--sign-with-key <identity>` only (no Ledger, no browser lab signing, no OS secure store).
- Cleanup: stop and remove the container (`stellar container stop`), delete the isolated config directory and any exported XDR, then scan `tobin-protocol/` for strings matching `S[A-Z2-7]{55}` (secret-key shape) and report the result.

### 3.4 Stage B experiments (each states the expected result; none run)

| Id | Experiment | Expected (hypothesis to test) | Distinguishes |
|---|---|---|---|
| B0 | start the local network; fetch network info (passphrase, ledger); fund accounts | healthy RPC | environment |
| B1 | build the Wasm (`stellar contract build`); deploy `TobinTestToken` (constructor args) and `TobinClearingV1`; `create_session`; mint with the minter | success; non-minter mint fails | deployment, minter authority at network level |
| B2 | `join_session` with the joiner and the creator both signing, `relayer` as source | success; with only one entry, failure | contract authorization separate from transaction source |
| B3 | inspect each submitted envelope with `stellar tx decode`: record the credential type of each authorization entry (source-account versus address) and who the source is | debtors' entries are address credentials; `relayer`'s signature is the envelope signature only | T-SRC-1: transaction-source authorization versus contract-level authorization |
| B4 | full flow: obligations, finalize, propose (revision 1), approvals, `settle` with two debtors signing `settle(session, digest, own total)` plus their own transfers, `relayer` submitting | SETTLED; balances move exactly the net amounts | multi-signer settlement on a network |
| B5 | A, B, A replacement; submit a revision-1 approval at revision 3 | refused with `DigestMismatch`; nothing stored | revision binding on a network |
| B6 | settlement negatives: wrong signer (`mallory` signs a debtor's entry); tampered argument (changed total, amount or payee after signing); entry signed with another network passphrase; expired entry (short expiration ledger, then wait); one debtor's entry missing | each rejected; balances and session state unchanged | the auth model's constraints at network level |
| B7 | insufficient balance for the second debtor; then a token-level failure after an earlier transfer | token error, whole settlement reverted; earlier transfer not committed (read balances before and after) | network-level rollback |
| B8 | replay: resubmit a used signed entry in a new transaction; resubmit a failed transaction's entries | expected rejection (nonce); unknown until run | T-REPLAY-1/2: nonce consumption and replay |
| B9 | all-zero session end to end; repeat settlement | SETTLED with no token event; second call `AlreadySettled` | zero path on a network |
| B10 | resources: record simulation output (instructions, memory, ledger reads/writes, resource fee), envelope XDR size, and fee charged for `create_session`, `submit_obligation` (1st and 16th), `finalize` (16 obligations), `propose`, `approve`, `settle` (4 transfers) | figures to compare with the host estimates; not assumed | S§17 resource measurements |

Stop conditions: any step that would touch a public network, require a non-disposable key, or need an unlisted tool stops Stage B and is reported. Findings must be reported as observed, including failures. A Stage B result would establish only what it ran; it would not establish wallet compatibility (assumption 4).

### 3.5 What Stage B does not cover

Real wallet UI signing, hardware wallets, fee-bump behavior beyond a single source account, public testnet, storage archival and restore, and anything involving real value.
