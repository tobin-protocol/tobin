# W2 evidence (sanitized, interim)

Written 2026-11-06. Public data only; no keys, seeds or tokens exist in the scratch environment or here.

## Packages (downloaded to a scratch directory outside the repository, `--ignore-scripts`, exact versions)
| Package | Version | npm integrity (sha512) |
|---|---|---|
| `@stellar/freighter-api` | 6.0.1 | `sha512-eqwakEqSg+zoLuPpSbKyrX0pG8DQFzL/J5GtbfuMCmJI+h+oiC9pQ5C6QLc80xopZQKdGt8dUAFCmDMNdAG95w==` |
| `@stellar/stellar-sdk` | 17.4.0 | `sha512-IX6gi62yWQ+6Oz56LsVEEeSViSOWJL3BkttftwVmVsu+62nLTWNVsCmTWEzwgNLT/q5HGP25OnlU+hhy2E4wwA==` |

47 packages in total (lockfile). No package in the lockfile declares an install script (checked via `hasInstallScript`); no script was run. Lockfile sha256 `65a40d46e550e8477318ad2c65fb2dab80a36a4a3d1372154699f2f97212922`.
Served browser bundles (vendored, no CDN): `freighter-api/build/index.min.js` sha256 `d797429cf97f9a67f1999910830a89dc01d565aedebafb651a11b1ed003a7e9d`; `stellar-sdk/dist/stellar-sdk.min.js` sha256 `8937f0b2426a895c35dc0a0865b2995816470d44a1885d184fb4027602d3e7ac`.
No dependency, lockfile or workspace file of the Tobin repository was changed.

## Helper
Source copied to `docs/product/architecture/w2/helper/` (no `node_modules`). File hashes at the checkpoint: `server.mjs` 23baeef0…, `core.js` a01c3cab…, `app.js` 9f8c0ac4…, `index.html` 72b44270… (sha256 prefixes; the copies are authoritative).
Properties tested: binds 127.0.0.1 only (listener seen as `127.0.0.1:8799`); foreign Host rejected (403), foreign Origin rejected (403), non-JSON POST rejected (415); RPC allow-list (any method outside the list: 403); unknown operation refused (400, only `create`, `join_B`, `join_C`); `sendTransaction` refused (403) without owner authorization; no external scripts or fonts (Content-Security-Policy `default-src 'self'`).

## Versions observed
- Node 24.14.0; Chrome (headless, installed) used only for loading the helper; **Freighter version and the owner's browser: not observed** (NOT RUN).
- Testnet RPC `30.0.0`, protocol 30, network passphrase as above (`getVersionInfo`, 2026-11-06).

## Real read-only Testnet observations
- A, B, C, E: 10,000 XLM each, single signer, thresholds 0 (Horizon). `evidence/horizon-balances.txt`.
- T-1 simulation at ledger 5592181: success; entries 1 (signer A, AddressV2); min resource fee 558,331; assembled fee 559,331; instructions 1,687,060; disk read 144 B; write 528 B (`evidence/sim-create.json`).
- `join_session(S, B)` simulation: `Error(Contract, #1)` = `SessionNotFound` (`evidence/sim-join_B.json`).
- The RPC request log (`evidence/rpc-log.jsonl`) contains only getLedgerEntries, getLatestLedger and simulateTransaction calls and one blocked sendTransaction test.

## Tests executed (exact results)
| Suite | Result |
|---|---|
| W2 helper tests (`tests.mjs`) | 7 tests, 7 pass, 0 fail (expiry rule, wallet states, confirmation classifier, intent match, tamper cases, mock-wallet round trip with throwaway key [SIMULATED], server gating) |
| Rust signer suite `authsigner` (cargo, offline, `-j 2`) | 19 passed, 0 failed |
| `packages/mvp1-sdk` unit tests (primitives, engine, digest, sdk-unit, intent) | 56 tests: 55 pass, 0 fail, 1 skipped |
| Real-browser load of the helper (headless Chrome, no extension) | state `FREIGHTER_UNAVAILABLE` logged; found and fixed missing `core.js` include |

## Transactions
**None submitted.** No transaction hash or ledger of inclusion exists. No wallet signature has been requested.

## Not collected (NOT RUN)
Freighter and browser versions; wallet prompts and displays; real signatures; any on-chain result; independent explorer verification.
