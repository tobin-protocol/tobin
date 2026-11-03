# Governed Tobin test token: deployment, authorization and TTL evidence (Stellar Testnet)

Evidence for SCF deliverable 1: a Tobin token on Stellar Testnet whose mint authority is the administrative multisig. Testnet only; experimental; not audited; not production-ready. Full contract IDs and all hashes are in `contracts/deployments/testnet.json` (the one file where the release-gate scan allows contract IDs); this document uses short forms. Facts below were read from Stellar Testnet (Soroban RPC and Horizon) on 2026-11-03 and are not independent verification.

## What this proves, and what it does not

- **Proven on-chain:** a new instance of the audited token Wasm exists; its `minter` is the administrative multisig account; a mint signed with weight 6 (Founder + Security) succeeded; the same mint with weight 5 (Founder alone) and weight 3 (Technical + Security) was rejected by the network.
- **Not proven, and not claimed:** independent multi-party governance. **All three signer wallets are currently controlled by one person (the founder).** The administrative account's master key is still enabled at weight 1. The multisig governs the **mint authority of this token only**.
- **Not governed by this multisig:** the legacy token (its minter is the legacy deployer and cannot be changed) and the clearing contract (immutable, no administrator, no upgrade path). Neither was modified.

## Deployment

| Item | Value |
|---|---|
| Network | Stellar Testnet, "Test SDF Network ; September 2015" |
| Contract | governed token `CD5OK4…NOKYO` (full ID in the manifest) |
| Deployment transaction | `b9496cc94ead0f5069c291608b9821a76caebb5e08e1ac7f7d678587c1af9314`, ledger 5530094, 2026-11-03T02:48:30Z |
| Source and deployer | the administrative account `GCZD5U7…U5MJ`, signed by Founder + Security (weight 6) |
| Fee | charged 44,036 stroops (maximum 54,698; the unused resource fee was refunded) |
| Wasm hash | `ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f` (equals the local build and the legacy token's Wasm) |
| Constructor | minter = `GCZD5U7…U5MJ`, cap `10000000000000`, decimals 7, name "Tobin Test Token", symbol TTT (same values as the legacy token) |
| Supply | initial 0; now 1 base unit (after Test A) |

Transaction details: it was assembled from a simulation with a 10% instruction margin (968,446 instructions), which removed a one-stroop fee shortfall found in the first build. Every field was checked against the approved parameters before signing (`scripts/multisig/governed-token.mjs verify-deploy`).

## Governance configuration (verified on-chain, unchanged during this work)

| Signer | Weight |
|---|---:|
| Founder `GB4NFBRA…E6OL` | 5 |
| Technical `GAE67UNG…R26H` | 2 |
| Security `GATMFOGT…5AP` | 1 |
| Master key `GCZD5U7…U5MJ` (enabled) | 1 |

Thresholds: low 5, medium 6, high 7. Stellar applies these per operation type: a Soroban contract call such as `mint` is a medium operation (6); extending a ledger entry's lifetime is a low operation (5).

## Authorization tests

The same unsigned mint (1 base unit to the administrative account, sequence 23747277906509828) was signed three ways. All three envelopes have the same transaction hash `c54b4e1291540b61261af0f4dee518718a3d87e6b84f2c4cd72f7503e0621f28`, because signatures are not part of the hash. The rejected attempts were submitted first so that they were evaluated at the intended sequence.

| Test | Signers (weight) | Needed | Simulation | Network result |
|---|---|---|---|---|
| A | Founder + Security (6) | medium 6 | succeeded | **SUCCESS on-chain**, ledger 5533978, 2026-11-03T08:12:10Z, fee charged 130,150 stroops. Total supply 0 to 1, administrative balance 0 to 1 |
| B | Founder alone (5) | medium 6 | succeeded | **Rejected at submission** (`TxFailed` with `OpBadAuth`): the mint operation's signature weight 5 is below 6. Never included in a ledger |
| C | Technical + Security (3) | medium 6 | succeeded | **Rejected at submission** (`TxBadAuth`): weight 3 is below even the low threshold 5 that the transaction itself needs. Never included in a ledger |

Notes on interpretation:

- **Simulation does not test thresholds.** The mint authorizes with the transaction's source account, and simulation does not check signature weights, so simulation succeeded for B and C. The threshold is enforced when the network validates the submitted transaction. B and C were therefore submitted, and the evidence is the network's rejection, not a simulation.
- **These are network-level rejections, not contract errors.** B and C were stopped by Stellar's signature and threshold check before the contract ran. They are not errors returned by the token.
- **No state changed in B or C:** before the successful Test A the hash was NOT_FOUND on RPC and 404 on Horizon, the administrative account's sequence stayed 23747277906509827, and its balance changed only by the earlier TTL fee. Supply stayed 0 until Test A.

## TTL (storage lifetime)

At deployment the instance was live for about 7 days (observed; the minimum for a new persistent entry). The token tops its own instance up to 60 days whenever less than 30 days remain, so a mint would also have extended it. The explicit extension was made first, before the authorization tests, so that the protection does not depend on token activity and the tests do not confound the TTL observation.

| Entry | Before (ledger 5533888) | After (ledger 5533932) |
|---|---|---|
| New token instance | live until 5651053 (about 6.8 days) | live until **6570727** (about 60.0 days) |
| Token Wasm code (shared with the legacy token) | 6448014 | 6448014 (not extended) |
| Legacy token instance | 6494352 | 6494352 |
| Legacy clearing instance | 6494355 | 6494355 |
| Clearing Wasm code | 6448033 | 6448033 |

- **Extension transaction:** `9e8352978ce14c0b4b9b4b802f525cf833d51aad648e84326469debd4992c32c`, ledger 5533927, 2026-11-03T08:07:55Z, fee charged 295,210 stroops (maximum 342,773). Operation: ExtendFootprintTTL, extend to 1,036,800 ledgers (about 60 days), footprint = the new instance entry only. The network maximum is 3,110,400 ledgers, so the target is within limits.
- **Signer set:** the extension is a low-threshold operation (5), so the Founder alone is sufficient. A first attempt signed by Founder + Security was rejected with `TxBadAuthExtra` (Stellar rejects a transaction carrying a signature it does not need); nothing changed on-chain. The same, unmodified transaction signed by the Founder alone was then accepted.
- **Why 60 days:** it matches the token's own extension policy and covers the near-term MVP period. The shared Wasm code entry, which expires about 7 days earlier (ledger 6448014, about 52 days), is the real near-term limit for both tokens; extending it would also prolong the legacy token's code and was deliberately not done. It needs its own decision before about day 50.
- The balance entry created by the mint carries its own lifetime (set by the contract).

## Account snapshots (administrative account `GCZD5U7…U5MJ`, read from Horizon)

| After | Ledger | Sequence | Native balance (XLM) |
|---|---|---|---|
| Friendbot funding (`94b7456b…b7c7`; ledger and time re-read from Horizon: 2026-11-03T01:25:10Z) | 5529094 | 23747277906509824 | 10000.0000000 |
| Signer and threshold configuration (`4aeb0e00…e18e`) | 5529282 | 23747277906509825 | 9999.9999600 |
| Governed token deployment (`b9496cc9…9314`) | 5530094 | 23747277906509826 | 9999.9955564 |
| TTL extension (`9e835297…c32c`; read after the two rejected mint attempts, which changed nothing) | 5533927 | 23747277906509827 | 9999.9660354 |
| Test A mint (`c54b4e12…1f28`; read after inclusion) | 5533978 | 23747277906509828 | 9999.9530204 |

Legacy deployer `GD5ES…QNYPQ`: sequence 23439577859489795 before and after all of this work; its single signer and thresholds 0/0/0 are unchanged.

## Legacy contracts: read-back after the work (unchanged)

| Item | Value read on 2026-11-03 |
|---|---|
| Legacy token Wasm hash and minter | `ef483732…83241f`; minter `GD5ES…QNYPQ` |
| Legacy token supply, cap | 1000000000, 10000000000000 |
| Legacy token instance live until | 6494352 |
| Legacy clearing Wasm hash, instance storage | `80bea964…47e5e4`, empty (no administrator) |
| Legacy clearing config | version 1, 4 participants, 16 obligations, 16 instructions |
| Legacy clearing instance live until | 6494355 |

## Verification and test results (executed locally on 2026-11-03)

| Check | Result |
|---|---|
| Governance and release suites (`scripts/accounts`, `scripts/multisig`, `scripts/release/scan.test.mjs`) | 39 of 39 passed at the time of the work; rechecked before the commit (see the commit report) |
| Contract tests (`cargo test --offline --workspace`, contract sources unchanged) | 96 of 96 passed |
| Multisig on-chain verification (`multisig:verify`) | 7 of 7 PASS: three weights, three thresholds, no unexpected signers |
| `verify-deploy` on the two-signature deployment envelope before submission | VALID: hash, source, sequence, constructor parameters, Wasm hash, salt, footprint, authorization entry, signer set, combined weight 6 |
| Pre-submission checks for TTL extension and mint envelopes | exact operation, footprint, sequence and signer set verified for each envelope before any submission |
| Release-gate scan | 0 findings; `public-source-release`: all required gates PASS |
| Deployment manifest against its schema | valid |

Supporting records kept in the repository: `contracts/deployments/testnet.json` and its schema (identifiers and the evidence above), `accounts/evidence/testnet-admin-setup-2026-11-03.json` (account funding and configuration), `accounts/testnet-admin.json`, `accounts/signers-history.json`, and the tooling and tests under `scripts/multisig/` and `scripts/accounts/`. The signed XDR envelopes themselves were working files outside the repository.

## Outstanding operational considerations

- **Shared Wasm code TTL (decision needed).** The token Wasm code entry is shared by the legacy token and the governed token and is live until ledger 6448014 (about 52 days after 2026-11-03). The governed token's instance now lives longer (ledger 6570727), so the code entry is the near-term limit for both tokens. Extending it would also prolong the legacy token's code; it was deliberately not extended. Decide before about day 50.
- **The balance entry** created by the mint carries its own lifetime, set by the contract; it was not separately inspected.
- **Master key** of the administrative account is still enabled (weight 1); disabling it needs separate approval after a recovery review.
- **Not tested:** Founder + Technical (7), all three signers, and a high-threshold operation.

## Limitations

- The signer wallets are held by one person; the weights test the mechanics of weighted authorization, not separation of duties.
- The master key of the administrative account is enabled; it counts as an extra weight-1 signer until it is disabled, which needs separate approval after a recovery review.
- The clearing contract has no administrator and cannot be upgraded; the legacy token keeps its original minter. Neither is controlled by the multisig.
- Same-author evidence, single Testnet run; no audit; no Mainnet.
