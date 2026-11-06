# Non-signing validation (T1, T2, T15)

Written 2026-11-03. No wallet, network or transaction was used. Packages were downloaded with `npm pack` into a scratch directory outside the repository and unpacked for reading; nothing was installed and no dependency was added.

## T1. Offline authorization-entry validation

**Method.** Ran the existing offline suites that exercise the signer and the SDK intent builder, with `CARGO_NET_OFFLINE=true`, `-j 2`, native target.

Commands and results:

| Command | Result |
|---|---|
| `cargo test --offline -p tobin-clearing-v1 --test authintents --test authsigner --test authcosigners` (from `contracts/`) | `authcosigners` 4 passed; `authintents` 1 passed; `authsigner` 19 passed; 0 failed |
| `node --test test/intent.test.ts test/interop.test.ts test/primitives.test.ts` (from `packages/mvp1-sdk/`) | 18 tests: 15 passed, 0 failed, **3 skipped** |

Skipped tests: the known-answer intent fixture ("known-answer fixtures are not part of this publication (attribution review pending)") and two real-contract digest tests that need `TOBIN_BRIDGE_EXE`. The cross-implementation test file `tests/authvectors.rs` and its fixture `auth-vectors.json`, cited in earlier documents, are **absent from this checkout**; the Phase 2B test plan's T1 relied on them and cannot run as written. This is a finding, not a pass.

| Aspect required | Covered by (test names) | Result |
|---|---|---|
| Entry parsing and malformed input | `g6_malformed_envelopes_and_entries_are_refused_without_partial_changes`, `h4_input_limits_…` | Pass |
| Invocation-tree inspection, nested invocations | `h0_the_good_settlement_tree_is_signed`, `h1_any_deviation_of_the_settlement_tree_from_the_expected_intent_is_refused`, `p0_every_supported_call_…` | Pass |
| Account identity extraction and wrong signer | `g2_a_wrong_signer_is_refused_…`, `h2_entry_set_errors_wrong_debtor_unexpected_missing_duplicate_and_unsigned_requirements` | Pass |
| Contract/method identification, argument validation (deployment record) | `p0_…`, `h6_the_deployment_record_is_validated_strictly_and_holds_no_secrets`, `h5_the_intent_itself_is_validated_strictly` | Pass |
| Nonce handling | Entries carry the nonce; replay behaviour is in Phase E evidence, not in these tests. Nonce *rollback on failure* was not re-tested | Partial |
| Expiration handling | `g5_an_entry_signed_inside_the_policy_window_expires_at_the_host_after_its_ledger`, `g8_the_expiry_policy_boundaries_and_checked_arithmetic`, `g9_a_rejected_expiry_never_produces_output_…` | Pass |
| Expected-intent comparison and atomicity | `h3_a_late_mismatch_after_earlier_valid_entries_leaves_no_partial_output` | Pass |
| Serialization/XDR and network passphrase | `g4_a_network_passphrase_mismatch_is_rejected_…`, `g3_a_tampered_payload_is_rejected` | Pass |
| Two debtors through the signer | `g1_…two_distinct_signers…`, `g7_two_debtors_sign_one_settlement_through_the_signer` | Pass |
| Unsupported credential kinds fail closed | `g10_…` | Pass |
| Co-signer entries | `authcosigners` c0 to c3 | Pass |

**Status: PASS for the offline signer and intent validation as exercised by the existing suites; PARTIAL for the cross-implementation known-answer check (fixtures absent).** Same-author tests, a local host, no wallet.

**Remaining uncertainty.** The browser-side adapter does not exist, so nothing here shows that bytes a wallet signs equal the bytes the signer signs. The 3 skipped tests were not run.

## T2. Stellar SDK and Freighter API inspection

**Method.** Read the `.d.ts` files of the unpacked packages. Not installed in the repository (`node_modules/@stellar` is absent); no dependency was added.

| Item | Exact finding | Source |
|---|---|---|
| `@stellar/freighter-api` 6.0.1 `signAuthEntry` | `(entryXdr: string, opts?: { networkPassphrase?: string; address?: string }) => Promise<{ signedAuthEntry: string \| null; signerAddress: string } & { error?: FreighterApiError }>` | `build/@stellar/freighter-api/src/signAuthEntry.d.ts` |
| Freighter `signMessage` | `(message: string, opts?: { networkPassphrase?; address? }) => Promise<SignMessageV3Response \| SignMessageV4Response>`; V3 returns `signedMessage: Buffer \| null`, V4 `string \| null`; both with `signerAddress` and optional `error` | `signMessage.d.ts` |
| Other Freighter exports | `getAddress, addToken, signTransaction, isConnected, getNetwork, getNetworkDetails, isAllowed, setAllowed, requestAccess, WatchWalletChanges` | `index.d.ts` |
| What `entryXdr` must hold, what the signature covers | **Not stated in the typings.** The package forwards to the extension; the contract is defined by the extension and its documentation, which was not fetched | Unverified |
| `@stellar/stellar-sdk` 17.4.0 | `authorizeEntry(entry, signer: Keypair \| SigningCallback, validUntilLedgerSeq: number, networkPassphrase: string, forAddress?)`; `SigningCallback = (preimage: HashIdPreimage, payload: Uint8Array) => Promise<Uint8Array \| {signature, publicKey} \| {signatureScVal, address?}>`; also `buildAuthorizationEntryPreimage`, `inspectAuthEntry`, `checkAuthEntryReadiness(entry, currentLedgerSeq)`, `authorizeInvocation`, and V2/delegates builders | `lib/esm/base/auth.d.ts` |
| Wallets Kit 2.8.0 `signAuthEntry` | `static signAuthEntry(authEntry: string, opts?: { networkPassphrase?; address?; path? }) => Promise<{ signedAuthEntry: string; signerAddress?: string }>` | `esm/sdk/kit.d.ts` |
| Repository `Transport` | Interface in `packages/mvp1-sdk/src/sdk/transport.ts`; the only network implementation is `NetworkTransportNotAuthorized`, which refuses every call. There is no wallet adapter interface in the repository | Source |

Fit analysis (inference, not verified): a wallet adapter can implement `SigningCallback` by passing the preimage or payload to `signAuthEntry` and returning the signature with the public key; whether Freighter's `entryXdr` is the preimage, and whether `signedAuthEntry` is a signature or a full entry, is exactly what T3 must establish.

**Status: PASS for "API surface recorded"; compatibility with Tobin entries remains UNVERIFIED.**

## T15. Albedo and Ledger inspection

Method: read the kit's module code (`esm/sdk/modules/*.module.js`).

| Wallet | Actual result | Category |
|---|---|---|
| Albedo | `signAuthEntry()` throws `{code: -3, message: 'Albedo does not support the "signAuthEntry" function'}`; `signMessage` also throws (a comment says Albedo's own message method is not SEP-0043 compatible) | **Unsupported by the current integration (kit module)**. Albedo's own API: not tested |
| Ledger | `signAuthEntry()` throws `{code: -3, message: 'Ledger Wallets do not support the "signAuthEntry" function'}` | **Unsupported by the current integration (kit module)**. The Ledger Stellar app and direct integration: not tested; no claim that the hardware cannot |
| Kit overall | Unsupported modules: albedo, bitget, fordefi, ledger, lobstr, rabet, trezor, xbull. Modules with an implementation present: cactuslink, dcent, ghostsig, hana, hotwallet, klever, onekey, scopuly, varial, wallet-connect (not tested). metamask: none | Code inspection only |

**Status: PASS (inspection complete). No wallet is Supported and experimentally verified.**
