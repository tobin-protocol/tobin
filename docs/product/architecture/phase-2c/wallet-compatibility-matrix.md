# Wallet compatibility matrix (Phase 2C)

Written 2026-11-03. Evidence levels: L1 function exists; L2 works for a simple entry; L3 works for Tobin's entries; L4 works across independent wallets; L5 full workflow on Testnet. Statuses: Verified, Supported by documentation, Unsupported, Unverified, Not applicable.

Package versions inspected (downloaded to a scratch directory outside the repository, not installed): `@stellar/freighter-api` 6.0.1, `@stellar/stellar-sdk` 17.4.0, `@creit.tech/stellar-wallets-kit` 2.8.0.

| Wallet / path | API (version) | Message signing | Envelope signing | Auth-entry signing | Join | Settlement | Evidence level | Limitations |
|---|---|---|---|---|---|---|---|---|
| Freighter, direct API | `@stellar/freighter-api` 6.0.1 | `signMessage(message, {networkPassphrase?, address?})` exists in typings (L1); behavior Unverified | `signTransaction` Verified experimentally for envelopes (governed-token work, Phase 2B) | `signAuthEntry(entryXdr: string, {networkPassphrase?, address?})` returns `{signedAuthEntry: string \| null, signerAddress, error?}`. L1 only. What `entryXdr` must contain (preimage vs entry) and what is returned are defined by the extension, not the package: Unverified | Unverified | Unverified | **L1** | Extension behavior and display untested; no L2 |
| Albedo via kit 2.8.0 | module code | module throws "does not support signMessage" | Not examined | Module throws `code -3`, "Albedo does not support the \"signAuthEntry\" function" | Unsupported through the kit | Unsupported through the kit | Not applicable | **Unsupported by the current integration.** Whether Albedo's own API could sign entries was not tested |
| Ledger via kit 2.8.0 | module code | module throws "do not support signMessage" | Not examined | Module throws `code -3`, "Ledger Wallets do not support the \"signAuthEntry\" function" | Unsupported through the kit | Unsupported through the kit | Not applicable | **Unsupported by the current integration.** Not shown to be unsupported by the Ledger Stellar app or hardware; not tested |
| Other kit modules | kit 2.8.0 | varies | varies | Not implementing: bitget, fordefi, lobstr, rabet, trezor, xbull throw "does not support". Implementing (code present, behavior untested): cactuslink, dcent, ghostsig, hana, hotwallet, klever, onekey, scopuly, varial, wallet-connect. metamask: no implementation | Unverified | Unverified | L1 (code present) | Presence of code is not evidence of working entry signing |
| Local custom signer (`contracts/clearing/signer`) | n/a | n/a | n/a | Signs legacy `Address` entries locally | Verified experimentally (Stage B, Phase E; same author) | Verified experimentally (Phase E, one run) | L5 for the local signer only | **Not a wallet**; no wallet compatibility conclusion follows |

## SDK helpers relevant to a wallet adapter (stellar-sdk 17.4.0, `lib/esm/base/auth.d.ts`)

- `authorizeEntry(entry, signer: Keypair | SigningCallback, validUntilLedgerSeq, networkPassphrase, forAddress?)`.
- `SigningCallback = (preimage: HashIdPreimage, payload: Uint8Array) => Promise<Uint8Array | {signature, publicKey} | {signatureScVal, address?}>`: this is the natural place to plug a wallet; `payload` is the hash to sign.
- `buildAuthorizationEntryPreimage`, `inspectAuthEntry`, `checkAuthEntryReadiness(entry, currentLedgerSeq)` (expiry and unsigned signers) and a V2/delegates form (`AddressV2`, `AddressWithDelegates`), which Tobin's signer deliberately rejects.

These show the SDK can *build and inspect* entries; they say nothing about whether a wallet returns a signature over the right bytes.
