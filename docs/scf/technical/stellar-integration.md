# Stellar integration

Status: technical document of the SCF Build Award (Open Track) submission package, 2026-11-09. Responds to Open Track point 2 (on-chain integration plan specific to the Stellar stack) and point 10 (use of the network's latest strengths); both are guidance, not a verified checklist. Our own recommended documentation.
Evidence basis: `contracts/`, `contracts/deployments/testnet.json`, `packages/mvp1-sdk`, `apps/web-console/lib/stellar`, `docs/product/architecture/mvp-1.5/` (closure, Testnet verification, evidence files), and the Stellar developer documentation pages fetched on 2026-11-09 (section 10). All Testnet evidence is same-author and from one run; no independent security review has been performed.

Related: [architecture.md](architecture.md), [technical-specification.md](technical-specification.md).

## 1. Soroban contracts

Source of the ids: `contracts/deployments/testnet.json` (network `testnet`, passphrase `Test SDF Network ; September 2015`, RPC `https://soroban-testnet.stellar.org`). Public identifiers only.

| Contract | Id | Wasm hash | Role |
|---|---|---|---|
| `tobin_clearing_v1` | `CCV3E…Y4DT` | `80bea964...e5e4` | Clearing sessions. No constructor, administrator or upgrade path. Deploy tx `0b620e91...5c112` |
| `tobin_test_token_governed` | `CD5OK…OKYO` | `ef483732...241f` | The token the recorded settlement used. Minter is the administrative multisig account. Deploy tx `b9496cc9...9314`, ledger 5530094 |
| `tobin_test_token` (legacy) | `CD7HO…UC4O` | same as governed | Earlier demonstration token; minter is the legacy deployer; no longer the intended token |

The two token entries share one Wasm build artifact and differ in constructor input (the minter). The Wasm is the build artifact deployed on Testnet (its hash is recorded in the manifest; the MVP-1.5 closure records a read-only check that the deployed hashes equal the manifest, and a reproducible-build comparison across hosted runners, `ci/wasm-hashes-*.txt`, has not been recorded: gate E04 not verified). No independent security audit of any contract is claimed. The manifest wording about an "audited" build is being corrected separately.

Clearing contract: Soroban SDK 29.0.0, Rust 1.96.0 (see `AGENTS.md` section 4). Its behaviour is specified in [technical-specification.md](technical-specification.md) section 8. Ceilings 4 participants, 16 obligations, 16 instructions; read back from the network through `config()` in the MVP-1.5 preflight.

## 2. The custom capped test token

`contracts/token/src/lib.rs`: constructor fixes the minter and a cap; the governed instance has cap `10000000000000`, 7 decimals, name "Tobin Test Token", symbol `TTT` (manifest). `mint` checks the cap before any write; no burn, no allowance, no `transfer_from`. It implements `mint`, `transfer`, `balance`, `total_supply`, `cap`, `minter`, `decimals`, `name`, `symbol`: a subset of SEP-41, not the full interface, so other tooling that expects `approve`, `allowance`, `burn` or `transfer_from` will not work with it. Total supply of the governed token is 1 base unit (manifest `supply.current: "1"` as of ledger 5533978; mint of 1 unit by Founder + Security, tx `c54b4e12...1f28`). The clearing contract itself accepts any contract address as session token, so the application's asset registry (not the contract) decides which token is used.

## 3. SDK and transaction building

- `packages/mvp1-sdk` (private package, version 0.1.0): encodes the contract ABI, builds **prepared calls**, each stating as data the exact authorization every signer must give (`sdk/prepare.ts`). It performs no signing or network access; its only network transport is a stub that refuses (`NetworkTransportNotAuthorized`, `sdk/transport.ts:34`).
- `apps/web-console` uses `@stellar/stellar-sdk` **17.4.0** and `@stellar/freighter-api` **6.0.1** (exact pins, `apps/web-console/package.json`); `apps/web` pins `@stellar/freighter-api` 6.0.1.
- `lib/stellar/execution-plan.ts` maps an approved batch to the on-chain call sequence (create, join per participant, submit per obligation, finalize, propose, approve per participant, settle) with each step's signers; `lib/stellar/rpc.ts` builds the **unsigned** transaction from a real source account and sequence number (fee `100` base, `setTimeout(300)`), simulates it, assembles the resource footprint and fee from the simulation, and returns nothing to sign if simulation fails. Resource fees are taken from simulation; none are invented.
- Hard-coded in the code: Testnet only (plan builder and every network function reject others), the RPC URL (`rpc.ts:12`), the Horizon URL (`live.ts:115`), the Testnet passphrase, the deployment record path `contracts/deployments/testnet.json` read by the owner tool.

## 4. Freighter signing flows

| Flow | Where | What the wallet signs | What the server holds |
|---|---|---|---|
| Wallet sign-in | `apps/web` and `apps/web-console` | a server-issued challenge text (domain, network, key, nonce, validity 5 minutes) with `signMessage`; scheme `sep-53` from `apps/web` | the public key, the challenge row, a session token hash. No key, no transaction signed |
| Ownership proof for an organization | console `wallet-challenges` routes | a challenge bound to organization, user, network and key; single use | the verification record; it grants no role |
| Authorization entries | owner tools only (`/wallet-check`, `/settle-run`) | the entry preimage via the SDK `authorizeEntry` callback and `signAuthEntry` | nothing; the signed entry is returned to the server only to be placed in the prepared transaction and re-simulated |
| Transaction envelope | owner tools only | the prepared transaction with `signTransaction` (twice, by Founder and Security, for the multisig source) | the signed envelope in memory until submission, which needs the typed confirmation |

The server never receives a secret key or seed phrase; signature verification of the sign-in and ownership messages is done with Node's `crypto` against the public key (`wallet-proof.ts`). The sign-in message scheme is SEP-53 (verified against the specification, section 10); the evidence record notes that the exact scheme used in the ownership proof of the second account was the owner's recollection to be confirmed. Real Freighter validation: signing of an authorization entry (including the newer `AddressV2` credential type returned by protocol 30 simulation) and a transaction passed six checks in Edge on 2026-11-07 (`evidence/owner-freighter-validation-2026-11-07.json`); Edge and Freighter versions were not recorded, and the reject, wrong-network, locked and disconnect variants were not run. Wallet-first sign-in in `apps/web` is tested with a protocol-compatible stand-in; validation with the real extension is outstanding (`AGENTS.md` section 13).

## 5. RPC and Horizon reads

| Read | Code | Notes |
|---|---|---|
| Contract getters through `simulateTransaction` (`get_session`, `get_obligations`, `get_proposal`, `get_approvals`, `get_settlement`, token `balance`, `total_supply`) | `rpc.ts:74-112` | A zero-sequence source is used; no state change |
| Transaction by hash | `rpc.ts:120` | `NOT_FOUND` and unreadable are `UNAVAILABLE`/unknown, never failed or confirmed |
| Account ledger entry and signer set | `live.ts:117`, `signer-set.ts` | Horizon and RPC must agree; a disagreement or an unsupported signer type fails closed |
| Single provider | | One RPC provider and one Horizon host; no fallback (closure limitation) |

## 6. The owner-run settlement tool

`lib/stellar/run.ts`, API `POST /api/stellar/run`, page `/settle-run`. Available only on a local console (a hosted console 404s it), and only to a signed-in user whose verified wallet is a signer of the administrative account, the administrative account, or the configured second account (`owner-access.ts`).

What it does: re-observes the chain before every action; derives which of the eight steps are done from observed state only; prepares and simulates the next step; accepts the owner's signed authorization entry and re-simulates; verifies the envelope signatures against the live signer set; re-simulates the signed transaction; submits once after the exact confirmation `I CONFIRM SUBMIT STEP n`; polls the original hash; appends public identifiers to a local log.

Limits, stated plainly:

- The scenario is hard-coded: batch id `bat_mvp15_oneunit_01`, two synthetic users, one obligation of 1 base unit, one instruction (`run.ts:32-38`). It is not driven by a database batch.
- The amount is capped at 1 base unit (`MAX_UNITS`), and a gate requires the governed token's total supply to equal 1 and the administrative balance to equal 1 before settlement (`run.ts:88-95`); it cannot run any other amount or token.
- Attempt state is an in-memory map (`ATTEMPTS`); it is lost on restart. Outcomes are appended to a local file, not to the database.
- No automatic retry. An attempt that is accepted, pending or unknown blocks the step until the original hash is read with `resolve`; a `NOT_FOUND` stays unknown.
- Each step is a separate transaction signed and confirmed by a person; the run in the evidence took about two hours of wall-clock time across eight steps (log timestamps 12:20 to 14:14 UTC).
- Not reachable in the hosted deployment; adding owner tools or an equivalent to the hosted app is planned (P8, not approved), not done.

## 7. Signer sets and multisig

Administrative account (read from the network on 2026-11-07, `evidence/multisig-live-audit-2026-11-07.json`): thresholds low 5, medium 6, high 7; signers Founder weight 5, Technical weight 2, Security weight 1, and the bootstrap master key still enabled at weight 1. Horizon and the RPC returned the same set fingerprint. The three signer wallets are controlled by one person, so this is not independent multi-party governance (manifest note).

Verified, with the narrow scope of one account: Founder + Security (weight 6) satisfied the medium threshold in a real submission of the settlement steps; Founder alone (5) and Technical + Security (3) were rejected at submission in the governed-token mint tests (manifest `authorizationTests`, B and C: "rejected at submission, never included in a ledger"). The application verifies envelope signatures against the live set and a fingerprint before submitting (`signer-set.ts`), and records signer-set snapshots (immutable) when an admin asks.

Not verified: a second wallet or a hardware wallet; thresholds changed after the fact; wallet behaviour for custom-argument authorization roots beyond what Freighter did in the run; account recovery or key rotation procedures; multisig participation of any institution other than the owner's own accounts. The application cannot prove control of a multisig account by one key signature; the signer-set aware approach is used instead (closure, blocker 3).

## 8. Read-back and reconciliation

`compareWithPlan` (`lib/stellar/compare.ts`) compares the observed contract state with the plan: creator, token, capacities, participants, each obligation, the obligation commitment, net positions recomputed from what is on chain, proposal revision, instruction order and digest, approvals, and the settlement result. Any difference means stop. The tool additionally reads token balances and total supply (gates in `run.ts`). `verifyChainOutcome` (`settlement-state.ts:43`) compares a transaction's transfers with the approved batch as a multiset. Neither writes to the application database.

## 9. Testnet evidence that exists

All items are in `docs/product/architecture/mvp-1.5/` and its `evidence/` folder. Same-author, one run, Testnet, one base unit, governed token, Freighter in Edge.

| Evidence | File | Content |
|---|---|---|
| Read-only preflight and simulation | `evidence/preflight-readonly.json`, `simulation-readonly.json`, `simulation-oneunit-2026-11-07.json` | protocol 30; Wasm hashes equal the manifest; ceilings 4/16/16; simulations of calls |
| Freighter validation | `evidence/owner-freighter-validation-2026-11-07.json` | six PASS; versions not recorded |
| Multisig audit | `evidence/multisig-live-audit-2026-11-07.json` | signer set as in section 7 |
| Co-signing (nothing submitted) | `evidence/cosign-owner-run-2026-11-07.json` | Founder and Security signatures verified, weight 6 of 6 |
| Second account check | `evidence/second-account-check-2026-11-07.json` | distinct single-key account |
| Settlement run log | `evidence/settlement-run-2026-11-07.jsonl` | 16 lines: submit and outcome per step |
| Read-back | `evidence/settlement-reconciliation-2026-11-07.json` | RPC and Horizon agree; comparison `ok: true`, progress `settled` |

The eight transactions (session id `a053fd42...bd8c`, digest `d5e052c5...eb34e`):

| Step | Call | Ledger | Transaction hash |
|---|---|---|---|
| 1 | `create_session` | 5606084 | `a86fdd0f79ad2ba968e183f60808dc3e474a478c4e3b769b3516cdbbc65ffe8b` |
| 2 | `join_session` | 5606163 | `4b7350e8cd3338c91d8f5284942a69dd3efedd26b8a982ebf7eb97c2b3113644` |
| 3 | `submit_obligation` | 5606308 | `87873dffe08c463d0e770590ee287e46eca334e77a463e867e7a1ff60194a074` |
| 4 | `finalize_obligations` | 5606388 | `33623a3394d8f9877bc7e45c59476535eacc71c29697611149975f67f0e29ca1` |
| 5 | `propose_settlement` | 5606444 | `d9591044b3664e8cd5e5320f9090826a064e4c4b256835ca8a7f24185c4aeaeb` |
| 6 | `approve_settlement` (second account) | 5606525 | `a1bc02c161712c10d2a2ab0eb11c7cd517ad8e429e75d516f9e327d64e3b789e` |
| 7 | `approve_settlement` (administrative account) | 5607401 | `0bee25b75e0068b396a69c4644fa4c23685c52533c49510ec2b09401024a0370` |
| 8 | `settle` | 5607448 | `002fff31c93233d4d9529f8447699870bb9c5ff056b5ad0eec2a9943e183daee` |

Result recorded: administrative account balance 1 to 0, second account 0 to 1, total supply unchanged at 1; settlement record digest equals the digest computed from the plan, total moved 1, one instruction. Fees: `feeCharged` per transaction is in the reconciliation file; their sum is 1,920,200 stroops (our arithmetic); the fee is not decomposed into resource and inclusion parts. Resource use was simulated or declared, not measured. This run did not exercise failure or unknown-outcome paths on the network (those were tested with mocks), did not use a participant set larger than two, and did not test the all-zero or maximum-size paths. We did not re-read these transactions from the network for this document.

## 10. Using the network's latest strengths

Open Track guidance point 10 (guidance, not a verified checklist). Sources fetched from `developers.stellar.org` and the SEP repository on **2026-11-09**; only what the fetched page stated is claimed. "Uses today / plans / does not" is our own statement about Tobin.

| Capability | What the source says | Tobin | Source |
|---|---|---|---|
| Soroban authorization framework: `require_auth`, `require_auth_for_args`, authorization entries, per-signature nonce and expiration | The host collects authorization entries (signed credentials plus invocation trees); each `require_auth` must match a node; each signature has a unique nonce and an expiration; expired signatures are invalid | **Uses today.** Every contract call states its authorization; `settle` uses `require_auth_for_args` with custom arguments; the owner tool signs entries with an expiration | https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization |
| Custom accounts (`__check_auth`) and account abstraction | A contract implementing `CustomAccountInterface` can verify signatures and apply policies such as weighted signatures or spending limits | **Does not use.** Participants are classic accounts (one a classic multisig). Contract accounts for institutions are a possibility, not planned work in the milestone plan | same page |
| Contract accounts, passkeys (WebAuthn) as one custom-authentication example | The page says contract accounts suit custom authentication, hardware keys or on-chain rules, notes that they cannot pay their own fees and that exchanges do not currently support transfers from them | **Does not use** | https://developers.stellar.org/docs/build/guides/contract-accounts |
| Resource model and fees | The fetched page states that current limits are shown in Stellar Lab's Network Limits page and via `stellar network settings`; it lists no numbers | **Uses simulation fees only**; resource use is not measured and the contract's ceilings are provisional. Measured resources and fees are a roadmap deliverable (D1.6-7 in [../product/roadmap.md](../product/roadmap.md)), not done | https://developers.stellar.org/docs/networks/resource-limits-fees |
| State archival and TTL (persistent, instance, temporary storage; `extend_ttl`; automatic restore since protocol 23) | Persistent and instance entries are archived at TTL 0 and restorable; entries in a transaction's restore list are restored automatically; simulation usually fills the list | **Uses persistent and instance storage** with placeholder TTL constants (30/60 days of ledgers); one instance TTL extension was done for the governed token (manifest). Archival behaviour of clearing sessions is untested | https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival |
| SEP-53, signing arbitrary messages with ed25519 | Prefix `Stellar Signed Message:\n`, one SHA-256, ed25519; status Final 1.0.0 | **Uses today** for wallet sign-in and ownership proof (the console also accepts a `raw` scheme) | https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md |
| SEP-41 token interface | Draft 0.5.2; `balance`, `decimals`, `name`, `symbol`, `transfer`, `transfer_from`, `approve`, `allowance`, `burn`, `burn_from`; no `mint` | **Partly.** The test token implements a subset and is not SEP-41 compliant | https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md |
| Anchor Platform and SEPs (SEP-1, 6, 10, 12, 24, 31, 38, 45) | The page describes the Anchor Platform as tools and APIs for on- and off-ramp services, and lists these SEPs | **Does not use.** Tobin is not an anchor. Settling in assets issued by anchors is a possible future direction; no anchor integration exists or is promised here | https://developers.stellar.org/docs/platforms/anchor-platform |
| Stellar Asset Contract (classic assets as Soroban tokens) | Not fetched | Not claimed. The application can name classic assets in its registry, but the on-chain plan builder accepts only a Soroban token contract identity | n/a |
| Passkey or multi-signature signing | Passkeys appear on the fetched pages only as a custom-authentication example | Classic multisig is used and tested once; passkeys are not used or planned | see above |

Pages that returned no usable content (the smart-accounts guide URL tried returned 404) are not relied on.
