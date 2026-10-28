# Tobin MVP-1, Milestone 8, Stage B: local-network authorization experiments: report

**Verdict: COMPLETE WITH LIMITATIONS (2026-10-26).** B0 to B10 all ran on a disposable local protocol-29 node with disposable keys, using a purpose-built local signer that the founder approved after the first attempt was BLOCKED (Stellar CLI 28.0.0 can record but not sign authorization entries for non-source accounts). Every result below is **local-network evidence produced with a custom signer**. It says nothing about wallet compatibility, the public testnet, or real limits and fees.

History: attempt 1 stopped at preflight (Docker down, C: nearly full). Attempt 2 reached B1 and was BLOCKED at B2 by the CLI signing gap (details in section 3). Attempt 3 (this report) added the signer and ran B2 to B10.

> **Policy update (after this report).** The founder later decided (recorded internally) on a 10-ledger maximum authorization lifetime and fresh authorization after every failed settlement. The Stage B runs below were made **before** that policy: the pipeline script (not kept in the repository) used expirations 100 to 300 ledgers ahead, and the signer then had no cap. The signer now has a `--current-ledger` argument and enforces `current < expiration <= current + 10`; those later changes were tested offline only. No Stage B experiment was re-run, so none of the observations below was re-verified under the new rules. The signer interface described in section 2 is also historical: it has since become intent-mandatory (`--deployment` and `--intent` replace `--passphrase` and `--entry`; see the security review section 12), and the Stage B runs used the earlier blind-signing interface.

## 1. Environment (verified)

| Item | Observation |
|---|---|
| Tools | Stellar CLI 28.0.0, Docker 27.2.0 (started by the founder), Rust 1.96.0, soroban-sdk 29.0.0, `stellar-xdr` 28.0.0 (the version the SDK resolves) |
| Node | `stellar/quickstart:latest` (1.71 GB) container, node v30.0.0 started with `--protocol-version 29` (default start gave protocol 28, which rejects the contracts; contracts declare env-meta protocol v29). Passphrase `Standalone Network ; February 2017`, RPC `localhost:8000`. Public networks were never contacted |
| Isolation | CLI run with `--config-dir` in the session scratch area; `~/.config/stellar` was not read, listed or used. Fresh disposable keys (minter, relayer, alice, bob, carol, dave, mallory), funded by the local friendbot. Secret seeds were written to key files in that scratch area (never printed) and the area was deleted afterwards |
| Contract artifacts | `stellar contract build` of the unchanged `tobin-test-token` (4,965 bytes) and `tobin-clearing-v1` (25,796 bytes); no contract source was changed |

## 2. The signer (design and format references)

Files: `core/clearing/signer/mod.rs` (logic), `core/clearing/examples/authsign.rs` (command line), `core/clearing/tests/authsigner.rs` (tests); `sha2 = "0.10.9"` added as a **dev-dependency** of `tobin-clearing-v1` (already in the lockfile; `Cargo.lock` gained only that edge). `ed25519-dalek` and `soroban_sdk::xdr` (= `stellar-xdr` 28.0.0) were already used by `tests/signed.rs`.

What is signed (the construction of the SDKs' `authorizeEntry`, already used by `signed.rs`):
- payload = SHA-256 of the XDR of `HashIdPreimage::SorobanAuthorization { network_id, nonce, signature_expiration_ledger, invocation }`, with `network_id` = SHA-256 of the network passphrase;
- signature = ed25519 over those 32 bytes;
- written into the entry's `SorobanCredentials::Address`: `signature_expiration_ledger` (caller-supplied, must be non-zero) and `signature` = `Vec[Map{"public_key": Bytes(32), "signature": Bytes(64)}]`. The recorded `nonce` and the `invocation` tree are never rewritten.

Narrow by construction:
- It signs **authorization entries only**; it never signs the transaction envelope (the source account signs that separately with `stellar tx sign`, after the entries are signed). It refuses an envelope that already carries signatures, a non-v1 envelope, anything but exactly one `InvokeHostFunction` operation, an already-signed entry and a non-address credential.
- Signers are explicit: `--key FILE` signs the entries owning that key's address (an error if none does); `--entry INDEX:FILE` signs one named entry even with a non-matching key (reported as MISMATCHED; used only for negative tests). Nothing is inferred. The report lists signed, left-unsigned, mismatched and untouched entries. All-or-nothing: on any error the envelope is unchanged.
- Secret seeds are read from files, decoded with a checksum-verified strkey parser, and never printed or included in an error message.

Per-experiment flow: `contract invoke --build-only` → `tx simulate` (records the unsigned address-credential entries) → `authsign` → `tx simulate` again (enforce mode, fresh resources) → `tx sign` by the relayer (source) → `tx send`. For on-chain negatives the second simulation is skipped so the transaction is actually submitted.

## 3. Focused signer tests (host)

Command (offline): `cargo test --offline -j 2 -p tobin-clearing-v1 --test authsigner`, then `cargo test --offline -j 2 --workspace` (everything passes; 72 prior tests plus these 8). In the Soroban test host, `set_auths` verifies each signature against the classic account entry, so acceptance is the host's own check.

| Test | Shows |
|---|---|
| g0 | strkey parser round trip (independent encoder), rejects bad checksum, prefix, length and characters, errors never echo the input |
| g1 | two distinct signers on one join are accepted; nonce, tree and transaction preserved; no envelope signature added; base64 round trip |
| g2 | wrong signer rejected and reported MISMATCHED; a key owning no entry is an error and leaves the envelope unchanged |
| g3 | tampering after signing (swapped joiner, changed nonce, changed expiration) rejected; untouched entries still accepted |
| g4 | signing for another network passphrase rejected |
| g5 | zero expiration refused; an already-expired entry rejected; a fresh one accepted |
| g6 | malformed input refused without partial changes: re-signing, out-of-range index, envelope with signatures, no invoke operation, v0 envelope, source-account credential untouched and unsignable, partly-signed entries stay unsigned and are rejected, garbage XDR |
| g7 | two debtors sign one settlement (custom-argument `settle` root plus their own token transfers) and the token moves |

Same-author tests; no mutation run was done for the signer.

## 4. Experiment results (local network, custom signer)

Contracts deployed: token and clearing; the first and second runs used different ids (ids are gone with the container).

| Id | Result | Evidence (observed) |
|---|---|---|
| B0 start network, info, fund | **PASS** | RPC healthy; `getNetwork` protocol 29; friendbot funded all seven accounts |
| B1 deploy, create session, mint, non-minter mint | **PASS** | Both contracts deployed; the minter minted 1000 to alice and bob (balances read back); `create_session` by alice emitted `SessionCreated` and `ParticipantJoined`. **Non-minter mint now reached the contract:** source mallory, the minter's entry signed with mallory's key (`--entry`), submitted on-chain without re-simulation. The transaction failed **inside the token's `mint` at `require_auth`**: "signer does not belong to account", then "failed account authentication", then the VM trap; mallory's balance stayed 0. It is a host-level authorization failure (Error(Auth, InvalidAction)), not a contract error code. The earlier CLI refusal remains a client-side refusal and is not counted |
| B2 join with joiner and creator signing, relayer as source | **PASS** | bob (joiner) and alice (creator) signed; relayer submitted; bob admitted. With only the joiner's entry signed: refused in simulation and, submitted on-chain, the transaction failed in `require_auth` for alice ("failed account authentication", value unexpected_type) |
| B3 envelope inspection | **PASS (observation)** | Decoded submitted envelopes: source = relayer, **one envelope signature**; every authorization entry has an **address** credential (join: joiner and creator; settle: both debtors), each with a nonce and expiration ledger. Settle entries have root `settle` with 3 custom arguments (session, digest, payer total) and one `transfer` sub-invocation per transfer, exactly as recorded by simulation. The debtors' signatures are entry signatures; the relayer's is the envelope signature. The envelope-signature hint was not independently matched to the relayer key |
| B4 full multi-signer settlement | **PASS** | 4 participants; obligations alice→carol 10, bob→dave 10; finalized; proposal revision 1; four approvals; `settle` signed by both debtors with the relayer as source: state SETTLED, balances moved exactly (alice and bob −10, carol and dave +10) |
| B5 A, B, A replacement and stale approval | **PASS** | Revisions 1 (plan A), 2 (plan B), 3 (plan A again): digests differ at every revision (rev 1 `cf4163df…`, rev 3 `ef9c283e…`); alice's revision-1 approval was cleared (approvals empty); a revision-1 digest approval at revision 3 was refused with contract error **#40** (digest mismatch) at **simulation**, not submitted; approvals stayed empty, state COMMITTED |
| B6 settlement negatives | **PASS**, all seven rejected on-chain with distinct reasons; balances and state unchanged after the set | N1 mallory signs alice's entry: "signer does not belong to account"; N2 total changed 10→11 after signing: "Unauthorized function call for address" (`require_auth_for_args`); N3 transfer amount changed after signing, N4 transfer payee changed after signing, N5 signed for another passphrase: "failed ED25519 verification"; N6 expired (expiration 2): "signature has expired"; N7 alice's entry unsigned: "failed account authentication". **Procedure note:** my first N2 to N7 run reused a stale envelope and failed with `TxBadSeq`, which proved nothing; it was discarded and rerun with a fresh sequence number each time (the table is the rerun) |
| B7 insufficient balance and rollback | **PASS** | Alice (second payer) drained to 0 after the signed transaction was prepared; submission failed with **token error 102** in her `transfer`, trapped in `settle`; bob and dave balances identical before and after (990 and 10), session still APPROVED, no settlement record. The simulation-time error text was not captured |
| B8 replay | **PASS with an important note** | (a) The minter's used signed entry in a **new** transaction (fresh sequence and relayer signature) was refused: **"nonce already exists for address"**; balance unchanged. (b) Resending the identical envelope: `TxBadSeq`. (c) **Entries of a FAILED transaction are reusable:** the B7 failed settle's two entries, resubmitted in a new transaction after alice was funded, **succeeded** and settled the session (nonces are only consumed by a successful transaction; expiration ledger 790 had not passed). So a signed debtor authorization stays usable by anyone, for exactly the signed arguments, until it expires or is used |
| B9 all-zero and repeat | **PASS** | alice→bob 10 and bob→alice 10; finalize (`all_nets_zero`), empty proposal, two approvals, `settle` with no transfer authorization: SETTLED, `total_moved` 0, `instruction_count` 0; events of that ledger come only from the clearing contract (and the native fee contract); **no token-contract event**. Repeat `settle`: contract error **#50** (already settled) |
| B10 resources | **MEASURED** (one run each) | Table below |

B10 figures (default local standalone network; from the final envelope and `getTransaction`; fee charged in stroops):

| Call | Instructions | Disk read B | Write B | Footprint RO/RW | Resource fee | Envelope B | Fee charged |
|---|---|---|---|---|---|---|---|
| create_session | 816,483 | 0 | 452 | 2/1 | 456,762 | 801 | 389,929 |
| join_session (2 signers) | 1,863,313 | 288 | 648 | 4/3 | 79,156 | 1,488 | 63,160 |
| submit_obligation #1 | 1,499,732 | 144 | 436 | 4/2 | 378,162 | 1,494 | 322,573 |
| submit_obligation #16 | 2,438,247 | 144 | 3,736 | 4/2 | 244,543 | 1,494 | 206,836 |
| finalize_obligations (16 obligations) | 3,326,090 | 144 | 696 | 4/2 | 64,725 | 1,140 | 50,014 |
| propose_settlement (4 instructions) | 2,988,565 | 144 | 1,676 | 4/4 | 984,944 | 2,736 | 851,844 |
| approve_settlement | 1,489,556 | 144 | 348 | 5/2 | 292,643 | 1,332 | 248,108 |
| settle (4 transfers, 2 debtors) | 7,511,046 | 288 | 1,668 | 9/8 | 360,861 | 3,186 | 311,347 |

The resource fee varies a lot between similar calls (it includes ledger-write and rent components that depend on the entries created), so the fee column is not a price list. These figures are from this local network's default limits and fee settings only; they were not compared against testnet limits or the earlier host estimates in the readiness document.

## 5. What each kind of evidence shows

- **Custom-signer local-network evidence (this stage):** the authorization-entry format the signer writes is accepted by a real protocol-29 node; the custom-argument `settle` root and per-transfer sub-invocations are recorded by `simulate` and authorized by the debtors' entry signatures; source-account and entry signatures are distinct; wrong signer, tampering, wrong network, expiry and missing entries are all rejected; revision-bound approvals refuse a stale digest; token failure rolls the whole settlement back; used entries cannot be replayed but entries of a failed transaction can; the all-zero path works.
- **Host/Wasm tests:** unchanged from earlier milestones (72 Rust tests plus the 8 signer tests all pass in this session's environment).
- **Not shown:** real wallet behavior (the signer is not a wallet; assumption 4 of the plan remains untested), the public testnet, real limits and fees, storage archival, behavior of other CLI or SDK versions, a mutation run of the signer.
- **Independence:** the author of the signer, tests and experiments is the same; the network's signature verification is the only independent check of the byte format.

## 6. Defects, changes, limits

- No contract defect found; no contract, test (other than the new file), fixture or digest changed. `Cargo.lock` and `clearing/Cargo.toml` changed only by the `sha2` dev-dependency.
- Observations for the founder: start the local node with `--protocol-version 29`; a signed debtor authorization survives a failed transaction until expiry, so choose short expirations (see B8c); the CLI 28.0.0 cannot sign non-source entries, so a wallet or SDK is still needed for any real user flow.

## 7. Cleanup (verified)

Container stopped and gone; the scratch area with all keys, key files and exported XDR was deleted; a scan for secret-key-shaped strings (`S` plus 55 base32 characters) over `tobin-mvp-1`, the workspace-level instruction file (which is not part of this repository), `tobin-clearing` and `tobin-landing` found nothing. The 1.71 GB quickstart image stays cached; the Wasm build output stays in the session scratch target directory. `tobin-clearing` main 952fac4 (pre-existing `README.md` change and untracked `CONTRIBUTING.md`), `tobin-landing` main 941352d (pre-existing `README.md` change); nothing committed or pushed.
