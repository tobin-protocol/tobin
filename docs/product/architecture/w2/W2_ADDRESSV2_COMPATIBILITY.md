# W2 AddressV2 compatibility

Written 2026-11-06 from the installed packages and real read-only Testnet simulation. Labels: CONFIRMED SUPPORTED / CONFIRMED UNSUPPORTED / NOT TESTED / SIMULATED ONLY.

## 1. RPC credential structure (observed)
Testnet RPC `30.0.0`, protocol 30. `simulateTransaction` of `create_session` returns one authorization entry whose credentials are `sorobanCredentialsAddressV2` for account A: address, nonce (random 64-bit), `signatureExpirationLedger` = 0, signature = void; root invocation = the contract function with its arguments, no sub-invocations. The Tobin contract and its Wasm are unchanged by this: the host produces V2 for account addresses by default. Policy adopted by the owner: preserve the returned credential type; never downgrade.

## 2. SDK 17.4.0 representation (inspected in the installed package)
- Plain typed objects: `entry.credentials.type`, `credentials.addressV2.{address, nonce, signatureExpirationLedger, signature}`, `entry.rootInvocation.function.contractFn.{contractAddress, functionName, args}`. The old `.credentials().address()` XDR class API does not exist.
- `authorizeEntry(entry, callback, validUntilLedgerSeq, passphrase)` handles V2: it builds the address-bound preimage (`ENVELOPE_TYPE_SOROBAN_AUTHORIZATION_WITH_ADDRESS`, CAP-71) via `buildAuthorizationEntryPreimage`, calls the callback with `(preimage, payload = sha256(preimage XDR))`, verifies a bare returned signature against the entry's address, and writes signature and expiration. CONFIRMED for a throwaway key (SIMULATED wallet): V2 entry signed, a signature by another key or over other bytes was refused.
- `authorizeEntry` defaults `authV2` to true for entries it builds, and keeps the type of an existing entry.

## 3. Transaction reconstruction (tested)
- `tx.operations[n].auth` is not write-through (assigning it does not change `toXDR()`). The helper rebuilds the transaction with `Operation.invokeHostFunction({func, auth})` (sequence, source and time bounds preserved; verified by test).
- `assembleTransaction` keeps auth entries already present on the operation and ignores those from the simulation. CONFIRMED in the SDK source; fee = base fee + `minResourceFee` (559,331 = 1,000 + 558,331, observed).
- Signed entries survive `toXDR()`/`fromXDR()` round trips (tested with a throwaway key). Re-simulation with signed entries on Testnet: NOT TESTED (needs a real signer for an existing funded account; the helper's Finalize step does exactly this).

## 4. Freighter API behavior
- `@stellar/freighter-api` 6.0.1 `signAuthEntry(entryXdr: string, {networkPassphrase?, address?}) -> {signedAuthEntry: string|null, signerAddress, error?}`. The package only posts the string to the extension (`SUBMIT_AUTH_ENTRY`); all decoding and signing happens inside the extension, so **nothing about the extension's handling of a V2 preimage can be known from the package**.
- Whether it expects the preimage or the entry, whether it hashes before signing, what it returns (signature or whole entry, encoding), what the prompt displays: **NOT TESTED**. The helper passes the base64 preimage and verifies the returned bytes as a signature over `sha256(preimage)`; any other behavior fails visibly with a precise message and a `raw-sign-result` log line (response keys, lengths).
- I did not obtain Freighter's official documentation: the docs URL redirected to a third-party domain, which I did not follow.

## 5. Result of the actual signing test
**NOT TESTED.** No real Freighter was available in this session. W-15 in `W2_WALLET_ENVIRONMENT.md` gives the owner-run procedure (sign only; no finalize, envelope signature or submission).

## 6. Compatibility limitations known
- The Rust signer (`contracts/clearing/signer`) accepts only legacy `Address` and fails closed on V2: CONFIRMED UNSUPPORTED for protocol-30 simulation output. Unchanged by policy.
- Entry checks written for the older SDK object model do not apply; the helper's check supports both `Address` and `AddressV2` and refuses every other kind, including source-account credentials.
- SDK 17 and Node/browsers: the helper uses the browser bundle; a Buffer-free encoding was needed.

## 7. Recommended minimal integration changes (if W-15 passes)
1. A wallet adapter that wraps `signAuthEntry` with the verify-before-accept step used in the helper.
2. A network transport split into prepare/collect/submit phases around the existing `prepare`/`intent` layers.
3. Add `AddressV2` handling wherever Tobin parses simulated entries (intent check). No contract, signer or policy change.
If W-15 fails: record the exact error; options are for the owner (another wallet path, or a local-signing fallback), not decided here.

## 8. Unverified
Freighter V2 signing; prompt contents; re-simulation of a wallet-signed entry; on-chain acceptance of a V2 entry for this contract (host-level behavior expected, no evidence); whether two Freighter profiles can both sign.
