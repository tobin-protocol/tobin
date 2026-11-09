# Wallet compatibility (Phase 2B, Workstream B)

Written 2026-11-03. Investigation only: no wallet was used to sign anything in this phase, no transaction was submitted, no key or keystore was read. Terms follow [../README.md](../README.md). Test procedures are in [wallet-validation-test-plan.md](wallet-validation-test-plan.md).

Confidence labels: **Confirmed in source**, **Verified experimentally**, **Supported by official documentation**, **Strong inference**, **Unverified**, **Blocked**.

Five evidence levels are kept apart for every wallet:

| Level | Meaning |
|---|---|
| L1 | The function exists in the wallet API or kit |
| L2 | It works for a simple authorization entry |
| L3 | It works for Tobin's actual entries (join; settle with nested token transfers) |
| L4 | It works across independent wallets (two parties, two wallets) |
| L5 | The complete workflow succeeds on Testnet |

**No wallet has reached L2 for authorization entries in this repository's evidence.** L1 is the most that is shown, and only for Freighter and the SDK.

## B1. What Tobin requires from a signer

Source: `packages/mvp1-sdk/src/sdk/prepare.ts` (`Invocation`, `AuthRequirement`, `PreparedCall`, `prepareJoin`, `prepareSettle`) and `contracts/clearing/src/lib.rs` (`join_session`, `submit_obligation`, `finalize_obligations`, `settle`); `contracts/token/src/lib.rs` (`transfer`, `mint`). Label: **Confirmed in source**.

| Operation | Who must authorize | Mechanism in the contract | What the signer must produce |
|---|---|---|---|
| Create session | The creator | `creator.require_auth()` | If the creator is the transaction source account: covered by the envelope signature. Otherwise an authorization entry |
| Join session | **Two** parties: the joiner and the session creator, over the same call `join_session(session_id, participant)` | `participant.require_auth(); s.creator.require_auth();` | One entry per party, same invocation tree. At most one can be the transaction source |
| Submit obligation | The debtor | `obligation.debtor.require_auth()` | Envelope signature if the debtor is the source, else an entry |
| Finalize, propose, approve | The calling participant | `caller.require_auth()` | Same as above |
| Settle | **Each debtor** for its own total, plus its own token transfers | `payer.require_auth_for_args(...)` over `settle(session, digest, total)` and then `token.transfer(from=payer, ...)` calling `from.require_auth()` | One entry per debtor with the token transfers as sub-invocations (`prepareSettle` builds `subs`). Up to 4 entries |
| Mint (test setup only) | The token minter | `mint` uses the stored minter's `require_auth` | Envelope or entry; outside the product journey |

Consequences:

1. Joining and settling need **entries for accounts that are not the submitter**. A wallet that can only sign a whole transaction envelope (`signTransaction`) cannot provide them. Entry signing (`signAuthEntry` in Freighter's API; `authorizeEntry` in the SDK) is therefore a hard requirement for any flow with more than one signer.
2. A single-signer path exists: if the acting account is the transaction source, no separate entry is needed. A join still needs the creator's authorization, so joining always involves two accounts unless one wallet controls both.
3. Classic multisig thresholds apply to the **transaction** (medium 6 for Soroban invocations in the governed Testnet setup; an unneeded extra signature is rejected with `TxBadAuthExtra`). They do not replace entry signing. Evidence: `docs/governance/governed-token-evidence.md`.
4. Each entry binds a nonce and an expiration ledger. A failed transaction rolls the nonce back, so the signed entry stays reusable until expiry (founder record, EQ-20). Tobin's policy is a fresh authorization after any failed settlement.

## B2. Freighter

| Question | Finding | Label |
|---|---|---|
| Does the API expose entry signing? | `@stellar/freighter-api` 6.0.1 exports `signAuthEntry`. The package is **not** a dependency of this repository; it was inspected as a downloaded package copy outside the repository earlier in the engagement (Phase 2A) | Confirmed in source of that copy (L1); not re-inspected in Phase 2B |
| What does it take and return? | Takes an authorization-entry preimage (base64 XDR) and returns a signature and signer address. The exact contract (hash or raw preimage, encoding) was not checked against the official documentation in this phase | Unverified |
| Does it sign for an account that is not the one connected? | Not shown. The user must be connected as that account; a second party signs in its own browser profile | Unverified |
| Does it work for Tobin's join and settle entries? | Not shown | Unverified (L3) |
| Does `signTransaction` work for envelope signing? | Yes: used with a temporary localhost helper for the governed-token activation and the TTL extension on Testnet; helpers were deleted | Verified experimentally (envelope only, not entries) |
| Does Freighter display Soroban authorization contents so the user can review them? | Unknown. Whether an opaque preimage or a decoded tree is shown determines blind-signing risk (see [security-model.md](security-model.md)) | Unverified |
| Mobile or other browsers? | Not examined | Unverified |

The Stage B signer in `contracts/clearing/signer/` and the Phase E run signed entries with a **local, custom signer**, not a wallet. That shows the protocol accepts correctly formed signed entries (Verified experimentally on local network and public Testnet, same-author evidence). It says nothing about any wallet.

## B3. Compatibility matrix

| Wallet | L1 function exists | L2 simple entry | L3 Tobin entries | L4 across wallets | L5 Testnet workflow | Status |
|---|---|---|---|---|---|---|
| Freighter (API 6.0.1) | Yes (source) | Unverified | Unverified | Unverified | Unverified | **Unverified**: candidate for the spike |
| Albedo (via Stellar Wallets Kit 2.8.0) | The kit module states it does not support `signAuthEntry` | Not applicable | Not applicable | Not applicable | Not applicable | **Unsupported** (Confirmed in source, kit module code; documentation not re-checked) |
| Ledger (via Stellar Wallets Kit 2.8.0) | The kit module states it does not support `signAuthEntry` | Not applicable | Not applicable | Not applicable | Not applicable | **Unsupported through the kit**. Whether the Ledger Stellar app can sign Soroban authorization preimages directly was not established |
| Stellar Wallets Kit as an abstraction | Exposes a common interface; entry signing depends on the module | Unverified | Unverified | Unverified | Unverified | **Unverified** |
| Local custom signer (`contracts/clearing/signer`) | Yes | Yes | Yes (Stage B, Phase E) | Not applicable | Yes (Phase E, one run) | Verified experimentally, but it is not a wallet |

Statuses use: Verified, Supported by documentation, Unsupported, Unverified, Not applicable. None of the wallet rows is "Verified" for entry signing.

## B4. Authorization-entry expiration

Two different limits exist and must not be conflated.

| Limit | Value | Source | Label |
|---|---|---|---|
| Tobin signer policy | `current < expiration <= current + 10` ledgers | `MAX_AUTH_LIFETIME_LEDGERS: u32 = 10` and `check_expiry` in `contracts/clearing/signer/mod.rs`; founder record, EQ-20. Policy, not protocol, not network-validated | Confirmed in source |
| Protocol ceiling | An entry whose `signature_expiration_ledger` exceeds `host.max_live_until_ledger()` is rejected with "signature expiration is too late"; an entry at or below the current ledger is rejected as expired | `soroban-env-host` 29.0.0, `src/auth.rs` (the two checks around the nonce consumption); `max_live_until_ledger_checked` in `src/ledger_info.rs` computes `sequence_number + max_entry_ttl - 1` | Confirmed in source |
| Network parameter feeding the ceiling | `max_entry_ttl` of the Testnet network. A value of 3,110,400 ledgers was read from the Testnet earlier in this engagement | Earlier read-only RPC query; not re-queried in Phase 2B | Verified experimentally (earlier), may change with network upgrades |

Conclusions:

- The 10-ledger value is a **repository policy** chosen to shorten the replay window. It is **not** the protocol limit. Phase 2A's `integration-readiness.md` and the Phase 1 readiness report describe it as the signer policy, which is correct; they do not claim it is a network limit, so no correction is needed. This document pins the protocol ceiling separately.
- At roughly 5 seconds per ledger, 10 ledgers is about 50 seconds. **This is the main usability risk for wallet signing**: collecting a second party's signature in a different browser, reviewing and approving it must fit that window, with the current ledger read before signing. Whether Freighter's approval latency fits was not measured.
- The window must **not** be increased in this phase (instruction). If the experiments show 10 ledgers is unworkable for human-in-the-loop signing, that is a founder decision to be taken with the replay analysis in `MVP-1-SIGNER-AND-REPLAY-SECURITY-REVIEW.md`; options are recorded as decision W3 in [phase-2b-decision-register.md](phase-2b-decision-register.md).
- Status: policy source **established**; the *adequacy* of 10 ledgers for wallet round trips is **unresolved**.

## Unresolved wallet questions

1. Exact input and output format of Freighter `signAuthEntry`, and whether the user sees the invocation tree.
2. Whether it signs for an account other than the transaction source and how it behaves across two profiles.
3. Whether the signature verifies against the preimage Tobin's SDK builds (network id, nonce, expiration, tree).
4. Round-trip time against the 10-ledger policy.
5. Whether the Ledger Stellar app can sign Soroban authorization preimages directly, outside the kit.
6. How expired, partial or rejected signatures are surfaced by the wallet.
7. Whether credentials other than legacy `Address` are produced by wallets (the signer fails closed on `AddressV2`).
