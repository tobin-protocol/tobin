# MVP-1 digests: working version 2 (DB-09 technical review); the sections below up to "Revision 2" describe version 1, kept as history

Status: **working version 2: APPROVED by the founder as the working MVP-1 digest format (see the last section).** The layout, vector and verification table below are those of the superseded version 1. This documents what the code does; no digest byte was changed. Sources: `core/clearing/src/lib.rs` (`header`, `obligation_bytes`, `proposal_bytes_of`, `put_*`, `xdr_of`) and `ts/src/digest.ts`, `address.ts`, `amount.ts`. Unrelated to the provisional v0.2 `commitment_digest`.

## Layout (all multi-byte integers big-endian)

Primitives: `u32` 4 bytes unsigned; `i128` 16 bytes two's complement (amounts are positive, so top bit clear); id/hash/contract id 32 raw bytes; **address** = 1 length byte (`0x2c`=44 for an account, `0x28`=40 for a contract) then the XDR of `ScVal::Address` (`00000012 00000000 00000000`+32-byte key for an account; `00000012 00000001`+32-byte contract id for a contract); **domain tag** = 1 length byte + ASCII; **collection** = `u32` count then elements. Other address kinds are rejected. Hash: SHA-256; a digest is the 32 raw bytes (64 lower-case hex in tools).

Common header (both objects): tag, `u32 version = 1`, network id (32, `env.ledger().network_id()`), clearing contract id (32, the contract itself), session id (32), token contract id (32, the session token).

| Object | Tag | After the header |
|---|---|---|
| Obligation commitment `OC = SHA-256(obligation_bytes)` | `TOBIN-MVP1/OBLIGATIONS/v1` (25 bytes) | participants: count + addresses **ascending by XDR bytes**; obligations: count + `id(32) ‖ debtor addr ‖ creditor addr ‖ amount(16)` **strictly ascending by id** |
| Proposal digest `PD = SHA-256(proposal_bytes)` | `TOBIN-MVP1/SETTLEMENT/v1` (24 bytes) | `OC` (32); instructions: count + `payer addr ‖ payee addr ‖ amount(16)` **exactly as stored**, which the contract requires strictly ascending by (payer XDR, payee XDR) |

Ordering is unsigned lexicographic on bytes, shorter-prefix first (an account sorts before a contract). Binding: session identity, token, network and contract are in both; participants and obligations are bound through `OC`, which `PD` embeds; instructions are in `PD`. Approvals and debtor authorizations carry `PD`.

**Intentionally excluded:** nets (derived from obligations); proposer; **proposal revision**; the creator; capacities. The revision is a counter outside the digest, so identical content always has the same digest (an identical resubmission is refused as `ProposalUnchanged`).

## Representative vector (existing fixture `readme-account-addresses`, `ts/test/fixtures/digest-fixtures.json`, bytes produced by the Rust contract)

Participants A,B,C (classic accounts, in the fixture's admission order); three obligations with amounts 70, 100 and 80 (README-style cycle: nets A +30, B -20, C -10); plan = two instructions with amounts 10 and 20, ascending by (payer, payee).

```
obligation_bytes (715 bytes) begins:
 19                                           tag length (25)
 544f42494e2d4d5650312f4f424c49474154494f4e532f7631   "TOBIN-MVP1/OBLIGATIONS/v1"
 00000001                                     version
 00..00 (32)                                  network id (all zero in the Soroban test host)
 00..03 (32)  clearing id    0202..02 (32) session id    00..02 (32) token id
 00000003                                     3 participants, then 3 x (2c ‖ 44-byte XDR) ascending
 ...                                          3 obligations ascending by id
OC = 0861bfc006f8b26bd120c59a97b9c2a14994053aee2ae041c0ebc5fe983a63d7
proposal_bytes (405 bytes): 18 "TOBIN-MVP1/SETTLEMENT/v1" 00000001 <header> OC 00000002 <2 instructions>
PD = 6ab36e5eed6694aee08fcf1cd87340b359cb39e0e42a543a8622dab8162d76d6
```
Full bytes for this and six other cases (contract, mixed, empty proposal, 2^100 amounts, 16 obligations) are in the fixture file.

## What was verified, and how

| Property | Evidence |
|---|---|
| Rust and TypeScript give identical bytes and hashes | **Executed:** 7 Rust-produced fixtures reproduced exactly by TS; live TS-predicted digests equalled the contract's for 40 random sessions (`digest.test.ts`, `interop.test.ts`) |
| Each bound field changes the digest | **Executed:** TS test over network, contract, session, token, participants, obligation id/debtor/creditor/amount, commitment, instruction amount/payee/order/count; Rust `every_bound_field_changes_the_commitment`; mutation M17 (token unbound) and D1-D4 killed |
| Equivalent canonical inputs are identical | **Executed:** participant and obligation order shuffled (TS); Rust join/submit orders (`admission_order_and_submission_order...`) |
| Replacement invalidates approvals | **Executed:** Rust `proposal.rs`, TS `sdk.test.ts`, browser journey |
| No dependence on object iteration order or unsafe number conversion | **Source inspection** of `digest.ts`/`amount.ts`: fields are written in explicit sequence; amounts are `bigint`; the only `Number()` is on a masked byte (`& 0xff`) and `u32` lengths are range-checked. Not separately fuzzed |
| Distinct tags/domain separation | Executed (tag test) |

Both implementations share an author: this is cross-language agreement, **not independent verification**. The `network id` in all fixtures is the all-zero id of the test host, so a real network id has never been exercised.

## Revision 2 of the format: revision-bound approvals (EQ-05), implemented on the founder's authorization

**Status: version 2 is implemented and locally tested; the founder has since approved it (DB-09, last section). Passing tests were not the approval.** Same-author Rust/TypeScript only.

What changed from version 1 (history kept here): the scheme version is now `u32 = 2`; the tags are `TOBIN-MVP1/OBLIGATIONS/v2` and `TOBIN-MVP1/SETTLEMENT/v2` (version-1 bytes and fixtures are superseded and are not accepted by any code or test); the proposal bytes gain one field, the **proposal revision** (`u32`, big-endian), placed after the obligation commitment and before the instruction count:

```
proposal_bytes = len(24) "TOBIN-MVP1/SETTLEMENT/v2" | 00000002 | network id (32) | clearing id (32) | session id (32) | token id (32)
                 | OC (32) | revision u32 | instruction count u32 | instructions...
```
The obligation commitment layout is unchanged except for the tag and version (`v2`, `00000002`). The revision starts at 1, increases by exactly one on every accepted proposal (including a proposal identical to an earlier one), is computed with checked arithmetic, and at `u32::MAX` a further replacement fails with `Overflow` before any write. `approve_settlement` still authorizes `(session, participant, digest)`; the digest already commits to the revision, so no separate argument was added. `settle` recomputes the digest from the stored revision. The error `ProposalUnchanged` was removed (identical re-proposals are now accepted as a new revision).

**How a stale signature is stopped:** at revision 3, plan A has a different digest than at revision 1, so a signature over `approve(session, Alice, digest-of-revision-1)` no longer matches the current digest: the contract returns `DigestMismatch`, stores nothing, and the session stays COMMITTED. Stored approvals are also cleared on every replacement.

**Evidence (executed, same author):** before the fix the Rust test `a_stale_approval_signed_for_revision_1_cannot_count_at_revision_3_after_a_b_a` FAILED (the revision-3 digest equalled the revision-1 digest); after it, it passes natively and against the compiled Wasm. Also: identical re-proposal advances the revision; an approval for one revision cannot satisfy another; settlement needs current-revision approvals; revision overflow leaves proposal, revision and approvals untouched; a failed replacement changes nothing; TypeScript reproduces Rust-generated fixtures for revisions 1, 2 and 3 of the same instructions (three different digests per case); the SDK, a Console test and the real-browser journey exercise A, B, A.

**Remaining limitation:** a signature is bound to the revision only through the digest. A participant who signs an approval for a digest is bound to exactly that revision's content; nothing here addresses wallets, network replay or expiry (undemonstrated).

## DB-09 founder decision: version 2 APPROVED as the working MVP-1 digest format

**Decision: APPROVED by the founder.** Decision date: not specified (no reliable dated source exists in the project; none is invented).

Scope: the working Tobin MVP-1 digest format, **version 2 only**.
- Obligation tag `TOBIN-MVP1/OBLIGATIONS/v2`; settlement tag `TOBIN-MVP1/SETTLEMENT/v2`; scheme version `u32 = 2`.
- The proposal revision is included in the proposal digest as a big-endian `u32`, after the obligation commitment and before the instruction count.
- The revision advances for every successfully accepted proposal, including an identical re-proposal.
- Version 2 supersedes version 1 for the working MVP-1 implementation. Version 1 bytes and fixtures are history only.
- The v0.2 protocol and its provisional `commitment_digest` are unchanged and remain unrelated to this format.

What this approval is not: it is a founder design decision. It is **not** evidence of independent cryptographic review (the Rust and TypeScript implementations and their tests share an author) and **not** evidence of network-level replay protection, nonce or expiry behavior, which are undemonstrated. Passing tests did not constitute the approval; the founder's explicit decision did. Approving the format does not authorize wallet or network work (DB-13 stands).

Recording this decision changed no digest byte, tag, encoding, fixture, contract logic or v0.2 artifact. Check performed when recording: the layout in the section above matches `core/clearing/src/lib.rs` (`DIGEST_VERSION = 2`, `DOMAIN_OBLIGATIONS`/`DOMAIN_SETTLEMENT` tags v2, `put_u32(&mut b, revision)` in `proposal_bytes_of`) and `ts/src/digest.ts`.
