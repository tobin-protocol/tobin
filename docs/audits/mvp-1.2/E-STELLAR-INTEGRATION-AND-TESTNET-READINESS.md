# E. Stellar integration and Testnet readiness report

Read-only checks run 2026-11-06 against the public Soroban RPC and Horizon (ledger about 5,588,051, protocol 30). No transaction was submitted; no key was used.

## 1. Contracts

| Contract | Source | Address (shortened) | Wasm hash | Status |
|---|---|---|---|---|
| `TobinClearingV1` | `contracts/clearing` | `CCV3EFEC…PY4DT` | `80bea964…47e5e4` | VERIFIED: instance exists, Wasm hash equals the manifest and `ci/wasm-hashes-recorded.txt`; deploy tx `0b620e91…` successful at ledger 5457545 (Horizon); no constructor; immutable, no admin |
| `TobinTestToken` governed | `contracts/token` | `CD5OK4ZS…VNOKYO` | `ef483732…083241f` | VERIFIED: exists, hash matches; deploy tx `b9496cc9…` SUCCESS at ledger 5530094; minter = administrative multisig |
| `TobinTestToken` legacy | same | `CD7HOXZP…UC4O` | same | VERIFIED exists; minter is the legacy single-key deployer; marked legacy |
| Administrative account | | `GCZD5U7G…U5MJ` | | VERIFIED: thresholds 5/6/7; signer weights 5, 2, 1 plus master 1 |

Full addresses and all hashes are in `contracts/deployments/testnet.json`. Governed-token mint under multisig: tx `c54b4e12…` SUCCESS at ledger 5533978; TTL extension tx `9e835297…` SUCCESS at 5533927. Instance time-to-live remaining when checked: about 906k ledgers (clearing, legacy) and 983k (governed token).

The contract surface is listed in the P0 audit and in `docs/reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md`: 7 state-changing clearing functions (`create_session`, `join_session`, `submit_obligation`, `finalize_obligations`, `propose_settlement`, `approve_settlement`, `settle`), 10 reads, 8 events, 27 error codes; token: `mint`, `transfer`, reads.

## 2. Which workflows can interact with the deployed contracts today

| Workflow | Contract capable | Test evidence | Testnet evidence in the repository | From the application |
|---|---|---|---|---|
| Create session | yes | host tests | tx `8926825a…` confirmed (ledger 5457555 via Horizon) | no |
| Join, obligations, finalize, propose, approve, settle | yes | host tests (96 in CI), local-network stage report, signed-entry tests | **none for the deployed instance**; README cites an unpublished run on a different set of accounts and tokens | no |
| Mint governed token | yes | token tests | tx `c54b4e12…` SUCCESS under multisig | via governance scripts, not the app |
| Read session state | yes | tests | not exercised in this audit (no SDK in the audit script; `simulateTransaction` reads NOT VERIFIED) | no |

## 3. Wallet readiness
No Freighter (or any wallet) dependency, detection, connection, network or account validation, entry signing, transaction signing, submission or status tracking exists. Wallet connection and signing capability are both MISSING. Validation tests T3 to T14 are defined (`phase-2b/wallet-validation-test-plan.md`, untracked planning set) and have never been run; decision W1 (wallet support) is pending; W2 (permission to run the tests) is not granted. The offline signer in `contracts/clearing/signer` signs authorization entries with disposable local keys only and is not a wallet substitute.

Integration architecture: `Transport` (`packages/mvp1-sdk/src/sdk/transport.ts`) isolates network execution and is the right seam; missing pieces: a `WalletAdapter` interface (connect, address, network passphrase, `signAuthEntry`, `signTransaction`), a Soroban RPC client (simulate, assemble, send, poll), contract-version configuration (addresses from the manifest), and fixtures-versus-live selection with a permanent "Testnet / mock" label. Mock implementations must stay visibly labelled and unable to reach a network, as they are today.

## 4. Deployment readiness, five categories
1. **Already deployed and independently verifiable:** the three contracts, the administrative account and its thresholds, their deploy/mint/extension transactions (the older ones through Horizon only: the RPC keeps about 7 days), the landing page (`tobinprotocol.xyz` answers 200).
2. **Deployed but insufficient evidence:** the clearing contract beyond `create_session` (join to settle); protocol-30 behaviour of the clearing contract; the unpublished earlier Testnet run.
3. **Implemented, not deployed:** sandbox console, W0/W1 console, SDK, netting engine, offline authorization signer, governance scripts (used, not hosted).
4. **Not implemented:** application backend, database, authentication, wallet adapter, network transport, indexer, application deployment, health checks, logging, error monitoring, rollback, automation for deployment.
5. **Blocked by an unresolved dependency:** wallet validation (owner authorization), database and identity provider (owner decisions), the `app.` subdomain and separate hosting project (not created), signature-expiry window (W3).

## 5. Recommended Testnet deployment architecture (realistic for the MVP; requires approval)
- **Frontend and server routes:** a separate Vercel project for the product app at the application subdomain (already the owner-decided layout, `phase-2c/hosting-and-domain-architecture.md`), built from a new app, not from the sandbox; Testnet-only configuration with a refusal to start on any other passphrase.
- **Database:** managed Postgres (the repository's recommendation, pending owner decision) with separate preview and production instances and migrations in version control.
- **Chain access:** public Soroban RPC for reads and submission from the browser, with a configurable fallback; the server reads for indexing only and never signs or submits for users.
- **Wallet:** Freighter first; the adapter interface permits others later.
- **Indexer/reconciler:** a scheduled and on-demand job reading contract state and events into the registry, idempotent and gap-aware, with the chain winning on conflict.
- **Operations:** health endpoint, structured logs, error monitoring and an uptime check, contract TTL extension job, documented rollback (redeploy previous build; contracts are immutable).
- **Where a step cannot safely be on-chain:** organization membership, invitations and "approval" in the application are application records, not on-chain authorization. Label them so. The on-chain approval is the wallet-signed `approve_settlement`. Where wallet signing cannot be completed live (for example validation not finished), a transparent alternative is a recorded session using the sandbox transport with an unmistakable "simulated" banner, kept separate from the live path and never presented as Testnet.
