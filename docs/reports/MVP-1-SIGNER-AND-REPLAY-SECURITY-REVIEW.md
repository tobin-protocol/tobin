# Tobin MVP-1: security review of the local authorization signer and failed-transaction authorization reuse

> **Reading note (added for publication, 2026-10-27).** Sections 1 to 8 are the original review of 2026-10-26. Statements in them that something was open, undecided or not authorized (for example the maximum authorization lifetime, blind signing, or network and testnet work) describe the state at that date and are preserved. The founder decisions, the implementations that followed, the independent known-answer vectors and the co-signer handling are recorded in sections 9 to 14, which govern where they differ. This remains a same-author review, not an independent audit. `DB-nn` and `EQ-nn` identify decisions and open questions recorded in internal, unpublished design records; sections 9 and later state the resulting behaviour.

Audit and recommendation only. Nothing was run, built, installed, signed or changed to produce this review (read-only source inspection on 2026-10-26). It is **not** an independent review: the reviewer is the implementing author, who also wrote the signer, its tests and the Stage B experiments.

Evidence labels: **[V]** verified by reading source now; **[R]** reported by `MVP-1-MILESTONE-8-STAGE-B-REPORT.md` (observed in Stage B, not re-run, its raw logs were deleted); **[I]** technical inference; **[U]** unverified or open.

## 1. Executive summary

**Overall risk: LOW for the intended scope (a local, disposable-key, single-operator experiment); MEDIUM if the signer or the retained-envelope pattern were carried toward real users. No contract defect was established.**

1. The signing construction matches the host's verifier for the tested path **[V]**: one SHA-256 of the XDR of `HashIdPreimage::SorobanAuthorization{network_id, nonce, signature_expiration_ledger, invocation}`, ed25519 over those 32 bytes, signature argument `Vec[Map{public_key, signature}]`. A real protocol-29 node accepted it **[R]**.
2. The "authorization of a failed transaction stays reusable" behavior is **expected Soroban semantics**, not a Stellar or contract defect **[V]**: the nonce is consumed by a ledger write that rolls back with a failed transaction (`auth.rs:2958-3010`, comment at `2843`). It is an **application-level exposure window** equal to the signature's expiration, which MVP-1 does not yet constrain (and founder item **EQ-20 is still OPEN**).
3. The signer is a **blind signer** (it signs whatever invocation tree simulation returned) and supports only the legacy `Address` credential type although the protocol-29 host also defines `AddressV2` and `AddressWithDelegates` with a different, address-bound preimage. Both are acceptable for a local tool and must be closed before any use beyond it.
4. Recommended path: **D + A + C** (document the semantics as accepted risk; enforce a short, bounded expiration in the tooling; retry with fresh authorization). A contract-level one-time marker (B) would **not** address the failed-transaction case, because every state write rolls back with the failure.

## 2. Scope and exclusions

In scope: `core/clearing/signer/mod.rs`, `core/clearing/examples/authsign.rs`, `core/clearing/tests/authsigner.rs` and `signed.rs`, the contract's authorization sites, the host source in the offline cargo cache, and the Stage B observations B6 to B8. Excluded: the contracts' business logic beyond authorization, the TypeScript SDK/Console, wallets, any network behavior not visible in local source, and anything requiring a network, a node, keys or accounts (none were used). `~/.config/stellar` was not touched. Git: `tobin-clearing` main 952fac4 (pre-existing `README.md` change, untracked `CONTRIBUTING.md`), `tobin-landing` main 941352d (pre-existing `README.md` change); both unchanged. Note: the CLI wrapper is at `tobin-mvp-1/core/clearing/examples/authsign.rs` (not `tobin-mvp-1/examples/`).

## 3. Reviewed

- `core/clearing/signer/mod.rs` (219 lines), `examples/authsign.rs` (54), `tests/authsigner.rs` (8 tests, g0 to g7), `tests/signed.rs` (s0 to s7).
- Contract authorization sites: `core/clearing/src/lib.rs` lines 279, 309-310, 351, 381, 409, 448 (`require_auth`) and 530 (`payer.require_auth_for_args([session_id, digest, total])`), `settle` at 470.
- Host: `soroban-env-host-29.0.0` `auth.rs` (credential kinds 592-594, nonce 2586-2623, preimage 2631-2662, rollback comment 2835-2850, `consume_nonce` 2958-3010), `builtin_contracts/account_contract.rs` (~195-250); `stellar-xdr-28.0.0` `generated/soroban_credentials.rs:32-37`.
- Documents listed in the task, notably the ABI reference (line 70, evidence for network/expiry/nonce is host-level) and the internal, unpublished founder decision record (EQ-20 and EQ-05 rows).

## 4. Signing-format findings (Audit A)

| # | Question | Finding |
|---|---|---|
| 1 | Preimage and hash | `payload()` (`mod.rs:102-111`) builds `HashIdPreimage::SorobanAuthorization` and SHA-256s its XDR once; ed25519 signs those 32 bytes (`mod.rs:138`). Host verifier computes the same preimage then `metered_hash_xdr` (`auth.rs:2653-2661`) **[V]** |
| 2 | Network passphrase | `network_id = SHA-256(passphrase)` (`mod.rs:41-43`); host uses `li.network_id` (`auth.rs:2640`). The passphrase is accepted unvalidated (any string, `authsign.rs:28`); a wrong one yields a valid-looking signature that the network rejects. Network rejection observed for a wrong passphrase **[R]**, and in the host test g4 **[V]** |
| 3 | Nonce, expiration, credentials, tree | Nonce copied from the recorded entry, never altered (`mod.rs:105`); expiration overwritten with the caller value **before** hashing (`mod.rs:136-137`), so the signed value is the submitted value; the tree is cloned from the entry (`mod.rs:129`) and hashed unchanged **[V]** |
| 4 | Double hashing | No: hashed once (`mod.rs:110`); the byte string signed is the 32-byte digest, which is what the host verifies **[V]** |
| 5 | Signature structure | `Vec[Map{"public_key": Bytes32, "signature": Bytes64}]` (`mod.rs:113-122`). Map keys are in sorted order (p < s). The host requires one signature element per signer, ordered by increasing public key, verifies each and rejects unknown signers (`account_contract.rs:~200-235`). A single signer per account only; multi-signer (multisig) accounts and thresholds above one are **not supported and not tested [U]** |
| 6 | Signed entry equals submitted entry | In the signer: yes, entries are mutated in a cloned envelope and the same clone is written (`mod.rs:145`, `206-208`). Between signer and network: the pipeline re-simulates (enforce mode) and re-signs the envelope with the CLI; that the CLI preserves the signed entries byte for byte was **only observed indirectly** (decoded final envelopes showed signed entries and the transactions succeeded) **[R]**; a byte-comparison was never done **[U]** |
| 7 | Signer selection | Explicit (`mod.rs:21-27`). `ByAddress` signs **every** unsigned entry for that address with the same expiration (`mod.rs:173-181`); a key owning none is an error (`182-184`); duplicate selectors fail on the second pass (already signed, `133-135`); `AtIndex` can sign with a mismatched key by design (reported, `186-195`) **[V]** |
| 8 | Envelope unchanged on error | The envelope is cloned (`mod.rs:145`) and only overwritten at the end (`208`); the CLI prints nothing to stdout unless everything succeeded (`authsign.rs:47-53`). Test g6 checks several mid-way failures **[V]**. A panic on a closed stdout (`authsign.rs:53`) is the only non-atomic path and leaves nothing written |
| 9 | Expiration and nonce validation | Expiration: non-zero only (`mod.rs:126`); no upper bound, no comparison with the current ledger. The network rejects an expired signature (`ledger_seq > live_until`, `auth.rs:2589-2599`) and one beyond the maximum (`live_until > max_live_until_ledger`, `2603-2612`); the configured maximum on the local node was never read **[U]**. Nonce: copied, not validated; two entries of one address with equal nonces are not detected (the network would reject the second, `auth.rs:2975-2992`) |
| 10 | Overflow, conversion, canonicalization, ordering | `i64`/`u32` values are copied, no arithmetic. Map entry order is correct. XDR is produced by the `stellar-xdr` serializer (canonical for these types). `Limits::none()` on untrusted input (`mod.rs:214`) allows memory exhaustion from a crafted envelope [low]. Strkey parsing accumulates in a `u64` that discards high bits correctly; 56 base32 characters make exactly 35 bytes with no padding bits **[V]** |

### Credential kinds (important)

`SorobanCredentials` has four variants: `SourceAccount`, `Address`, `AddressV2`, `AddressWithDelegates` (`stellar-xdr soroban_credentials.rs:32-37`). The host uses a **different preimage that includes the signer's address** (`HashIdPreimageSorobanAuthorizationWithAddress`) for `AddressV2` and `AddressWithDelegates` (`auth.rs:592-594`, `2642-2652`). The signer handles only `Address` (`mod.rs:130-132` rejects others; they are reported as untouched). Stage B simulation returned `Address` entries **[R]**. **[I]** If a future RPC or CLI records `AddressV2`, the tool will produce no signature for them (safe, but the flow breaks).

## 5. Failed-transaction authorization reuse (Audit B)

Observed **[R]**: a used minter entry replayed in a new transaction was refused ("nonce already exists for address"); the entries of a failed B7 settlement, resubmitted in a new transaction (new sequence number, fresh relayer signature), succeeded and settled the session.

1. **What makes a nonce unavailable after success?** A temporary ledger entry keyed by (address, nonce) is created by `consume_nonce` (`auth.rs:2958-3010`) with a lifetime equal to the signature expiration; a second use finds it and fails with `ExistingValue` **[V]**.
2. **Why can a failed transaction leave it reusable?** The entry is an ordinary storage write; a failed transaction's writes are discarded, so the nonce never exists on the ledger. The host says so explicitly: after a failed root call "the nonce will get 'un-consumed' due to storage rollback" (`auth.rs:2843`) **[V]**. Hence entries stay valid until their expiration.
3. **What did the second transaction authorize?** The same call that was signed: `settle(session, digest, total)` plus the exact `token.transfer(from, to, amount)` sub-invocations. It re-executed the *same intended settlement*, not a different action **[V from the tree]** **[R for the outcome]**.
4. **Can the relayer change the envelope while keeping the entry?** Yes, any field the signature does not cover: source account, sequence number, fee, memo, time bounds, resource limits and footprint, other operations, and the timing of submission **[V]**: none of these is in the preimage (`mod.rs:103-108`). It cannot change what the entry authorizes: if the invoked function or arguments differ from the signed tree, the host reports an unauthorized call (observed for a changed total, N2) **[R]**.
5. **Fields bound:** network id, nonce, expiration ledger, the full invocation tree (contract address, function name, arguments, sub-invocations). For settlement that is the session id, digest, payer total and each transfer's from, to, amount. **Not bound:** payer address in the preimage of the legacy kind (see section 4, credential kinds; the address is named only inside the transfer arguments) **[V]**.
6. **State compatibility.** The entry only works while the contract accepts the same call: state APPROVED, the digest equal to the stored proposal digest (`lib.rs:470-` before `require_auth_for_args` at `530`), balances sufficient. It cannot authorize a materially different transition **[V]**. What it does allow is *deferred execution*: a relayer holding the entries can choose the moment (e.g. after a debtor is funded, as in B8c) without a fresh signature, until expiry **[R]**.
7. **Revision and DB-09 v2.** The digest commits to the proposal revision (`ts/DB-09-DIGEST-REVIEW.md`). After any replacement the digest changes, so retained entries for the old digest can no longer pass the `DigestMismatch` check, and old approvals are cleared **[V from the design, R from B5]**. Even an identical re-proposal gets a new revision and digest. The binding therefore removes cross-revision reuse; it does nothing against reuse within one revision.
8. **Short expiration.** Shrinks the exposure window and stops a stale entry from outliving the debtor's intent, at the cost of liveness: if the relayer or network is slow, the entry expires and a fresh signature is needed; a too-short value fails before inclusion. Expiry is a ledger count (about 5 seconds per ledger on public networks **[U]**, local value not measured). The expiry boundary is `ledger > expiry` = expired, so equality is still valid (`auth.rs:2589`) **[V]**.
9. **Classification.** Expected protocol semantics **plus** an MVP-1 application-level risk (consent timing, unbounded validity chosen by the caller, no policy in the tooling). **Not a contract defect:** the contract authorizes precisely what the debtor signs and re-validates state at execution. Uncertainty: the node's host/core version (quickstart v30, protocol 29) was not inspected; the claim rests on the `soroban-env-host` 29.0.0 source and the observed behavior **[U]**.

## 6. Findings (ranked)

| ID | Severity | Confidence | Finding | Evidence | Status |
|---|---|---|---|---|---|
| F1 | Medium | High | Signed entries of a failed transaction stay valid until expiry, enabling deferred execution at a time the signer did not choose. The tooling does not bound or recommend an expiration. Founder item EQ-20 remains OPEN | `auth.rs:2843, 2958-3010` [V]; B8c [R]; `authsign.rs:29,40` (any non-zero u32) | Confirmed (semantics); exposure is policy |
| F2 | Medium (low for local) | High | **Addressed offline in section 12** (mandatory typed expected intent). Original finding: blind signing: the signer signs any invocation tree returned by simulation; no check of contract id, function, arguments or total, and no display of what is being signed. A malicious or compromised RPC/relayer could substitute an entry (e.g. a token transfer to an attacker) | `mod.rs:125-140, 168-181` [V]; no policy code [V] | Confirmed by reading |
| F3 | Low-Medium | High | Only legacy `Address` credentials are signed; `AddressV2` and `AddressWithDelegates` (address-bound preimage) are refused. The legacy preimage does not contain the signer's address; the settlement tree arguments `(session, digest, total)` do not name the payer either (`lib.rs:530`), so equal payloads from one key valid for two addresses it controls are interchangeable. Practical impact unlikely (one key per account in tests) | `auth.rs:592-594, 2642-2661`; `stellar-xdr soroban_credentials.rs:32-37`; `mod.rs:130-132` [V] | Confirmed (format); impact [I] |
| F4 | Low | High | `ByAddress` signs every unsigned entry of an address with a single expiration; no way to select one tree or to require exactly N entries. `AtIndex` with a mismatched key is exposed in the production CLI (it only produces invalid signatures) | `mod.rs:173-195`, `authsign.rs:30-35` [V] | Confirmed |
| F5 | Low | Medium | No expiration sanity check against the current ledger or a policy cap; the signer cannot know the ledger. The network caps at its configured maximum (`auth.rs:2603-2612`), whose value was not read | `mod.rs:126`; [U] network config | Suspected |
| F6 | Low | Medium | Secret-handling hygiene: seed copied into a plain array (`mod.rs:85-87`); key files read with no permission check; zeroization depends on dalek features not checked; `Limits::none()` on input (`mod.rs:214`) | [V] code; features [U] | Suspected, local tool |
| F7 | Info | Medium | "Signed entry equals submitted entry" was never byte-verified across the CLI's re-simulation and envelope signing step; only indirect evidence | [R] B3; [U] | Unverified |
| F8 | Info | High | Test limits: the 8 signer tests were written with the implementation, no mutation run, no known-answer vector from an independent implementation; expiry boundary equality and "expiration too late" are not tested; only single-signer classic accounts | `authsigner.rs:244-261` tests 499 only [V] | Confirmed |
| F9 | Info | High | No contract defect established. Settlement open submission (DB-01) and debtor-signed trees behave as designed | `lib.rs:470-540` [V] | — |

No finding rated High or Critical. No secrets are present in the reviewed files (secret-shape scan from Stage B; not re-run).

## 7. Mitigation comparison and recommendation

| Option | Benefit and residual risk | Contract, storage, resources | Wallet/UX and relayer | Scope / founder decision | Tests |
|---|---|---|---|---|---|
| **A. Short expirations** | Bounds deferred execution to the window; residual risk inside the window; liveness cost | None | Wallet sets expiry; user may have to re-sign after a slow relay | Needs a policy value (EQ-20) | Unit: reject over-cap; local: expired entry rejected; boundary equality |
| **B. App-level one-time state** | **Cannot stop failed-transaction reuse**: any "used" marker written by a failed transaction rolls back too; it only duplicates the nonce for the success case | Extra storage per authorization, ABI/state change | Extra data in signatures | **Changes MVP-1 scope and the ABI; founder decision** | Contract tests |
| **C. Retry with fresh authorization** | Removes retained signed entries; each attempt needs consent; residual: the signer must discard failed envelopes | None | More signing prompts; relayers must not keep signed entries | Process/policy, SDK/Console behavior | Local: failed tx then retry with new nonce succeeds; old entry rejected after success |
| **D. Document, accept** | Honest for a disposable local experiment; leaves F1 open for any real use | None | None | Founder acceptance | Documentation review |

**Recommendation: D now, A and C as policy and tooling, no B.** Record the semantics in the ABI reference ("a signed debtor authorization can be executed by any submitter, once, at any time before its expiry, with exactly the signed arguments; a failed attempt does not consume it"), cap the expiration in the signer (and any future SDK) with a small default window, discard failed signed envelopes and re-sign for retries. This needs no contract change and no change to DB-09 v2. Close F2 (expected-call check) and F3 (version-bound credential handling) before the signer is used with anything other than the local RPC.

## 8. Regression-test plan (not implemented)

**Pure unit/host tests (no node):**
1. Known-answer payload vector: fixed network id, nonce, expiry, tree bytes, expected SHA-256 and signature from an **independent** implementation (see below); assert `payload()` and the signature equal it.
2. Expiry boundary: signing at `expiry == ledger` accepted, `ledger-1` rejected, `u32::MAX` handled; "expiration too late" with a configured maximum in the host test ledger.
3. Wrong network id, wrong signer, altered tree (each field), tampered nonce/expiry: extend g2 to g4 with per-field tables.
4. Envelope immutability when signing fails on the second of several entries (compare serialized bytes before and after); duplicate selectors; two entries with one address; mismatched `AtIndex`.
5. Credential kinds: `AddressV2` and `AddressWithDelegates` entries are refused with a clear error and left byte-identical.
6. Failed transaction then retry in the **host**: a settle that fails (insufficient funds) followed by a funded retry with the same entries succeeds (the host rolls the nonce back); the same entries after a success fail with `ExistingValue`.
7. Reuse after a proposal revision change: entries signed for revision N rejected after a replacement (digest mismatch) in the host.
8. Source-account entry (`SourceAccount`) is never signed; the subtree of an entry cannot be replayed as a root (call `token.transfer` directly with the settle tree) **[U]** expected rejection.

**Need a local network or an independent signer:** exact payload and signature compatibility with another implementation (Stellar JS SDK `authorizeEntry`, Python or Go SDK); byte-for-byte equality of entries before signing and in the submitted envelope; real expiry in ledgers (retry timing, relayer delay); the configured maximum entry TTL; failed-then-retry on the node; protocol-29/30 node behavior of `AddressV2`.

**Independent validation of the signer (practical):** (1) generate known-answer vectors with a second SDK in a throwaway directory (needs a network install, so a separate authorization) and compare payload and signature bytes; (2) run a hand-seeded mutation campaign on `signer/mod.rs` as was done for the contracts (drop the expiry write before hashing, double-hash, swap map key order, skip the already-signed check, mutate the network-id step) and require every mutant to be killed; (3) have a person who did not write it read `mod.rs` against the XDR definitions.

## 9. Questions for the founder: decided

All six questions were decided by the founder; the authoritative record is an internal, unpublished decision record (section 9, Update 5). Summary only (that record governs):

1. EQ-20 semantics: **accepted** (failed-transaction nonce rollback is expected Soroban behavior), mitigated by bounded expiry and fresh-authorization retries.
2. Maximum authorization lifetime: **10 ledgers** (policy; not enforced by the signer today, not validated against a network maximum, not claimed optimal).
3. Retry rule: **discard the old signed envelope and require fresh authorization after every failed settlement attempt.**
4. Contract and ABI changes (option B): **out of scope** for MVP-1.
5. Credentials: **legacy `Address` only, fail closed** on other types.
6. Second SDK for known-answer vectors: **authorized** (network access for the download only); not yet obtained; no network experiments are authorized by it.

Findings F1 to F8 above describe the code **as reviewed**, before implementation. Implementation status afterwards (offline tests only; the review itself was not redone and is still not independent):
- F1 / decisions 2 and 3: the signer now enforces `current < expiration <= current + 10` with a caller-supplied `--current-ledger` (trust boundary: unverifiable offline); the SDK refuses a second send of the same settlement authorization round and the Console drops a failed settlement's pending action. Limits: the cap is not checked against a network maximum; the sandbox has no real signed envelopes; a hand-built call bypasses the SDK guard.
- F3 / decision 5: the signer now fails the whole envelope on `AddressV2` and `AddressWithDelegates` entries (previously: left unsigned and reported).
- F2 (blind signing), F4 to F8: **not addressed** by this work (F5's missing upper bound is now covered by the cap when the current ledger is trustworthy).
- Decision 6 (second SDK, known-answer vectors): not started when this list was written; carried out afterwards, see section 11.

## 10. Limitations and what was not verified

- Nothing was executed: no tests, no builds, no node. All Stage B observations are **[R]**; the raw logs were deleted with the scratch area.
- The host source reviewed is `soroban-env-host` 29.0.0 from the offline cache, which is the test host; the quickstart node reported core v30.0.0 at protocol 29. That the node's embedded host behaves identically is inferred from the observed outcomes, not verified.
- `stellar-core`, the JS/Go/Python SDKs and the official CAP/SEP texts were not consulted (no network); references to check later: the Soroban authorization-entry preimage definition in the XDR `Stellar-transaction.x`, CAP-46-xx authorization, and each SDK's `authorizeEntry`.
- The configured maximum signature lifetime, ledger close time and fee behavior of the networks were not read.
- Same-author review; no mutation testing of the signer; multisig and non-ed25519 signers, contract accounts and delegated credentials are untested.
- This review does not alter any founder decision, DB-09 v2, the contracts or the protocol documents.
- Update (F2): section 12 describes the mandatory-intent implementation and what it does not cover.
- Update: the "no known-answer vector from an independent implementation" limitation is addressed for the tested inputs by section 11.

## 11. Independent known-answer vectors (added after the review)

**Result: no discrepancy.** The Rust signer's output equals the output of a second, independent implementation on every compared value. This addresses the review's limitation F8 (no independent known-answer vector) for the tested inputs only.

- **Second SDK:** `@stellar/stellar-base` 15.0.0 (JavaScript; Apache-2.0; npm registry; published 2026-03-30; deprecated in favor of `@stellar/stellar-sdk`, which carries the same code). Installed with install scripts disabled in an isolated directory outside both Git repositories (`<session scratchpad>/kat-js`, about 11 MB, 39 packages). Its transitive pieces differ from the Rust path: `@stellar/js-xdr` 4.0.0 (XDR codec), `sha.js` 2.4.12 (SHA-256), `@noble/curves` 1.9.7 (ed25519).
- **Independence, and its limit:** a different language and a different XDR codec, hash and ed25519 implementation, so a bug in `stellar-xdr`, `sha2` or `ed25519-dalek` usage would show up. It is not independent of the Stellar XDR definitions (both derive from the same `.x` files) or of the same author's reading of the protocol: the vector inputs and the policy statement were written by the implementing author. The SDK's own `authorizeEntry` was used as a cross-check against a by-hand construction inside the generator (both identical).
- **Generator:** `kat-js/gen.mjs` (outside the repositories), deterministic (two runs produce byte-identical output, sha256 prefix `c734a62b…`), no network use after installation, no randomness. Synthetic TEST-ONLY seeds (published on purpose in the fixture as hex) and fixed inputs: passphrase `Standalone Network ; February 2017`, current ledger 1000, expiration 1010 (the accepted maximum), legacy `Address` credentials, `settle(session, digest, total)` with one nested `token.transfer` sub-invocation, two signers (alice, bob).
- **Fixture and test:** `core/clearing/tests/fixtures/auth-vectors.json` and `core/clearing/tests/authvectors.rs` (5 tests). The Rust side builds trees, entries and keys from the fixture's structured inputs and treats the JavaScript outputs only as expected values.
- **Independently verified (equal byte for byte):** network id from the passphrase (both passphrases); invocation tree XDR (three trees, including the nested sub-invocation); preimage XDR; SHA-256 digest; ed25519 signature; the whole signed `SorobanAuthorizationEntry` XDR, which covers the signature-argument structure `Vec[Map{public_key, signature}]` and credential encoding; two entries with distinct signers in one envelope; wrong-network signature (differs, fails under the intended digest, valid under its own); tampered transfer amount (different digest; the original signature fails); expiry policy cases (current+10 accepted; +11, equal, past rejected) against an independent statement, and the signature of an expired entry is still cryptographically valid (policy and signature validity are separate).
- **Not independently verified:** that a network or wallet accepts these bytes (no transaction was submitted; Stage B remains the only acceptance evidence and was not re-run); the `current_ledger` trust boundary; blind signing (F2 stays an open follow-up and was not touched); `AddressV2`/delegated credentials (the SDK version has no such XDR types, so there is nothing to compare); multisig accounts.
- **Mutation sensitivity of the new tests:** three seeded signer mutants (signature-map key order, double-hashed network id, hash-of-hash signing payload) each made the vector tests fail; the signer was restored byte-identical. Offline results: Rust workspace 88 passed, 0 failed.
- **Sandbox:** the install used the network for npm only. No Stellar network (public or local), no Docker, no transaction, no account or existing key, no `~/.config/stellar`.

## 12. F2 blind-signing protection: implemented (offline) after the analysis

**Founder-approved policy** (approved in the task that authorized the implementation; recorded as Update 6, section 10, of the internal, unpublished decision record on 2026-10-27, which is authoritative): the expected intent is mandatory, no production blind-signing mode; a pinned deployment record supplies the network passphrase and the clearing and token contract ids; the TypeScript SDK is the intent builder and the Rust signer is a strict independent verifier; any mismatched-key testing affordance is test-only; intents are generic invocation trees for all supported signing calls, settlement validated first; the caller-supplied current-ledger boundary is unchanged.

**Implemented validation** (`core/clearing/signer/mod.rs`, `examples/authsign.rs`, `ts/src/sdk/intent.ts`):
- `authsign --deployment D.json --intent I.json --current-ledger N --expiration-ledger N --key K...`: the intent is a required, separate input; `--passphrase` and `--entry` no longer exist. The test-only unchecked signing function is compiled only in test builds.
- Order: limits, expiry policy (unchanged: `current < expiration <= current + 10`), envelope shape (v1, one InvokeHostFunction, no envelope signatures), credential kinds (legacy `Address` only; `AddressV2`, `AddressWithDelegates` and `SourceAccount` fail the whole call), then matching of every envelope entry to exactly one expected (signer, tree) pair, then signing of a working copy. Nothing is signed before everything is validated; the caller's envelope is replaced only on full success.
- Matching is on typed XDR structures (decoded `SorobanAuthorizedInvocation`), never strings: wrong contract, function, any argument, nested transfer source, destination, amount, token, count or order, extra or missing entries, duplicates, entries for accounts the intent does not list, and a requested key with no expected entry are all refused. Expected co-signer entries are preserved unchanged only when explicitly expected.
- The intent is validated before use: version 1 only, exact fields (unknown fields rejected), supported argument types only, every contract inside the pinned record, the passphrase equal to the record's, and per-call semantics (for settlement: payer is the signer, positive amounts, total equals the sum of the transfers, distinct payees in the contract's ascending order, token transfers only).
- Limits (conservative local limits, not network limits): envelope 128 KiB, XDR depth 200, 32 entries, tree depth 6, 40 nodes per tree, intent and deployment files 256 KiB.

**How the intent is derived without the simulation tree.** For settlement, `settlementIntent` takes the digest the debtor approved as an anchor and the settlement state (which may come from an untrusted RPC), recomputes the DB-09 v2 obligation commitment and proposal digest under the PINNED network id, clearing contract and token, and accepts the state only if it reproduces the approved digest exactly and the instructions are a valid plan; the expected `settle` tree and transfers are then derived locally. This closes the provenance gap of `verifyDigests`, which only compares recomputed values with values the same RPC reports. For other calls the intent comes from the PreparedCall the SDK built from the user's own request (`intentFromRequirements`); for `join_session` the creator is read from the session record and cannot be authenticated by this code.

**Deployment record.** `{"version":1,"network_passphrase":...,"clearing":"C...","token":"C..."}`: no secrets, strict parser, no fallback to RPC-supplied identities. It is established by the operator from the deployment they performed or independently verified, and reviewed by a second person before it is used; it is a trust anchor, not proof that the contracts are honest. The committed `deployment.TEST-ONLY.json` holds synthetic ids for tests and is not a real deployment.

**Tested offline:** 19 signer tests (authsigner.rs), 5 known-answer tests now run through the intent API (authvectors.rs, the TypeScript-built intent trees equal the JavaScript-SDK trees), 1 host parity test replaying all 8 supported calls against the real contracts (authintents.rs: the trees the host demands equal the TypeScript-built intents; the TypeScript digest equals the contract's), 8 TypeScript intent tests. Hand-seeded mutants of the critical comparisons (tree comparison, duplicate and missing entry checks, sum, ordering, contract pinning, passphrase equality, credential kinds, depth and size limits, payer check, key-without-entry, unexpected signer) were each killed; one mutant (the first already-signed check) is equivalent because `sign_entry` refuses the same condition afterwards.

**Remaining boundaries and unverified:** the current ledger is still caller-supplied (separate task); the approved digest must come from the debtor's own record; the pinned record's contracts are assumed honest; the host-replayed parity is in the test host, not on a network; no wallet or network acceptance was shown; an RPC that lies consistently about both state and digest cannot pass the digest anchor, but a debtor who approved a bad digest is not protected; blind signing remains possible by anyone who bypasses this tool.

## 13. Verification record for the F2 implementation (2026-10-27)

Re-checked from the actual files and runs, not from the earlier summary. Same author as the implementation: this is a verification, not an independent audit.

**Mutation cases (hand-seeded in `signer/mod.rs`, each run against authsigner + authvectors + authintents, file restored byte-identical afterwards):**

| # | Weakening | Result |
|---|---|---|
| M1 | match entries by signer only (tree not compared) | killed (5 tests fail) |
| M2 | allow a duplicate envelope entry | killed |
| M3 | allow a missing expected entry | killed |
| M4 | do not check that the declared total equals the sum of the transfers | killed |
| M5 | allow a duplicate payee (strictly-ascending check relaxed to non-strict) | killed |
| M6 | do not require contracts to be inside the pinned record | killed |
| M7 | do not require the intent passphrase to equal the pinned record's | killed |
| M8 | allow `AddressV2` / `AddressWithDelegates` entries | killed |
| M9 | allow `SourceAccount` entries | killed |
| M10 | disable the tree depth and node-count checks | killed |
| M11 | replace the XDR depth/size limits with unbounded parsing | killed |
| **M12** | remove the early "entry already signed" check (step 3) | **survived: equivalent mutant.** `sign_entry` refuses the same condition afterwards, on the same entries, inside the working copy, so the observable result (an error, envelope unchanged, same message text) is identical. Removing both checks (M12b) is killed (2 tests fail), so the behavior itself is tested |
| M13 | do not require a transfer's source to be the signer | killed |
| M14 | do not require a supplied key to have an expected entry | killed |
| M15 | remove the base64 size pre-check | killed |
| M16 | remove the authorization-entry count limit | killed |
| M17 | accept an entry for an account the intent does not list | killed |

Two further mutants of the intent argument encoding (struct fields not sorted; a u32 argument off by one) are killed by the host parity test `authintents.rs`. The earlier EQ-20 mutants (expiry boundary, saturating arithmetic, credential kinds, SDK guard) are in sections 11 and the EQ-20 notes.

**Known-answer tests** (`tests/authvectors.rs`, 5 tests) still compare the independent JavaScript SDK bytes: network ids, three invocation trees (base64 XDR), preimage XDR, SHA-256 digest, ed25519 signature, the complete signed entry XDR for alice, bob and the wrong-network case, and the tampered-argument digest; plus the TypeScript-built intent trees equal those JavaScript trees.

**Host parity** (`tests/authintents.rs`): after each real call (mint, create_session, join_session, submit_obligation, finalize_obligations, propose_settlement, approve_settlement, settle) the test reads `env.auths()`, converts the host-recorded authorization trees to XDR and requires, for every demanded (signer, tree), exactly one equal entry in the intent parsed by the Rust verifier from the TypeScript-generated fixture, and the same number of entries. It also checks that the TypeScript DB-09 v2 digest equals the digest the contract returned.

**No production bypass:** `sign_entry` is private; the only production signing function is `sign_envelope`, which requires an `ExpectedIntent`; the unchecked helper is `#[cfg(test)]` and the built `authsign` binary contains neither the helper nor a way to run without `--intent` (CLI smoke tests: no `--intent`, no `--deployment`, `--passphrase` and `--entry` are refused). The only callers of the signer are `authsign.rs` and the tests.

**Nothing else changed:** the contract sources, `ts/src/digest.ts` and `ts/src/sdk/abi.ts` have no edits (the contract file's timestamp is from a `touch` to force a rebuild; the SDK's function-list and error-table test against the Rust source passes); the seven DB-09 v2 digest fixtures regenerate byte-identical from the real contracts; the baseline specification and Phase A report hashes are unchanged and an internal check of a separate review corpus, which is not part of this repository, against its own SHA-256 manifest verified 351 of 351 (not publicly verifiable).

**Checks run:** Rust workspace 97 passed, 0 failed; TypeScript 88 of 88 with the bridge; `tsc` clean for the SDK and the Console; Console production build (`tsc -p console/tsconfig.json`) succeeded; real-browser journey 128 of 128 at 1200 px and 128 of 128 at 420 px; badge check passed at both widths; `cargo clippy --all-targets` reports warnings only (style: manual range checks and a doc-list indentation in code that pre-dates F2; `clone()` to `from_ref`, `try_into` to `into` in tests; one `type_complexity` on the private helper `parts` in the signer), no errors, and none was changed. No JavaScript linter is configured or installed, so none was run.

**Defect found during verification (a stale test, not an implementation defect):** the browser journey step 10 still expected a failed settlement's pending action to remain so that a grant could be toggled and resent. That is exactly what the EQ-20 policy removed (a failed settlement discards its authorization), so the journey failed 1 of 122 checks on its first run. The step was updated to assert the new policy (pending action gone, "Re-authorization is required", retry only by preparing the settlement anew, second failure also discards). No implementation was changed. This also means the earlier statement that the journey had not been re-run after EQ-20 is now resolved.

**Not run / not established:** no network, wallet or RPC behavior; no independent audit; no mutation testing of the TypeScript intent builder; the rustfmt/formatting of the new files was not checked; the verifier validates shapes and consistency of non-settlement calls but not their business meaning (for example the digest inside an `approve_settlement` intent comes from the user's request); already-signed co-signer entries are preserved without verifying their signatures.

## 14. Preserved co-signer entries: Option A chosen and tested (2026-10-27)

**Resolution (founder-approved direction for implementation: Option A).** The signer validates the complete authorization-entry set and every expected invocation tree before signing anything; it signs only the entries that belong to the keys it was given; every other expected co-signer entry is carried through unchanged, with no local verification of its signature and no rejection of a pre-signed entry. No code change was needed: this is the behavior of `sign_envelope` (steps 1 to 4); the work was to lock it with tests and to state the boundary.

What is carried and how: preserved entries pass through the typed-XDR decode and encode path. Byte equality with the input is expected for canonical input and is asserted in the tests below; non-canonical XDR input was not tested and its behavior is **unverified**.

What this signer does **not** do: it does not certify preserved signatures, nonces or expirations. The Soroban host checks, when the transaction runs: the signature against the payload it recomputes (network, nonce, expiration, tree), that each signer belongs to the account and that the weights reach the threshold, that the nonce is unused, that the entry has not expired and does not exceed the maximum lifetime, and that the entry matches the invocation actually made (`auth.rs:2586-2662`, `account_contract.rs:195-250`). The **10-ledger lifetime cap applies to the entries this tool signs; it is not enforced on preserved co-signer entries**, which can carry any expiration. Real wallets, multisig accounts with thresholds, non-canonical XDR, how the host treats entries a transaction does not use, entry order, and real-network behavior remain **unverified**.

Tests (`core/clearing/tests/authcosigners.rs`, 4 tests, Soroban test host only, no network): a valid co-signer signature is preserved and the host accepts the completed envelope; void, garbage bytes, a signature valid for another tree, a signature made under another passphrase, an altered nonce, an altered expiration, an empty vector, two signatures (one from a non-signer), valid bytes under another public key, a wrong-typed value, a non-map element and a map without a signature key are each preserved byte for byte, are never signed by this tool, and are rejected by the host; a preserved far-future expiration is carried unchanged while the tool's own entry still obeys the cap; missing, duplicate, unexpected, intent-mismatched (even pre-signed and cryptographically valid for their own tree), own-entry-already-signed, late-mismatch and unsupported-credential cases are refused with the envelope byte-identical. Hand-seeded mutants that blanked or altered preserved entries were killed.
