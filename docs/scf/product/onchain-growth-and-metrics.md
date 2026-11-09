# Tobin: on-chain growth and measurement plan

**Status:** plan for Open Track guidance point 5 (how the solution drives on-chain growth and how it will be measured), dated 2026-11-09. Guidance, not an SCF rule. Targets are owner input; no numbers are proposed.
**Evidence basis:** `contracts/clearing/src/lib.rs`, [`contracts/deployments/testnet.json`](../../../contracts/deployments/testnet.json), `docs/product/architecture/mvp-1.5/evidence/` (settlement reconciliation and run log), [roadmap](roadmap.md), `AGENTS.md` section 6.

## 1. Current baseline (honest)

| Fact | Value | Source |
|---|---|---|
| Network | Stellar Testnet only | `AGENTS.md` section 1 |
| Settlements executed | 1 (owner-run, 2026-11-07), two accounts, 1 base unit of the governed test token | `evidence/settlement-reconciliation-2026-11-07.json`: state `Settled`, `totalMoved` 1, `instructionCount` 1, settlement ledger 5607448, comparison `ok: true`, no mismatches |
| Transactions in that run | 8, ledgers 5606084 to 5607448; final transaction hash `002fff31c93233d4d9529f8447699870bb9c5ff056b5ad0eec2a9943e183daee` | same file; `settlement-run-2026-11-07.jsonl` |
| Institutions onboarded | 0 external institutions | the repository records none |
| Mainnet activity | none | not authorized |
| Contracts | clearing `CCV3EFECV2T2UT5YW6GBPGKN6PAP75SUTQOL3QYXQW7QWMESD5PPY4DT`; governed test token `CD5OK4ZSFLAQIEVQZ44D3MFKESLBRYJLCGO2MEH6UKWWCV63LVQNOKYO` | `contracts/deployments/testnet.json` (the evidence files shorten contract ids, so the manifest is the source; which exact instance the run used is not restated here) |

The run is same-author evidence. It shows the mechanics work in that scope, not usage.

## 2. How the product could drive on-chain activity

Stated as mechanisms, not forecasts:

- Each cleared session produces a sequence of Soroban invocations on the clearing contract (create, join, obligation, finalize, propose, approve, settle) and token transfers inside `settle` for the net amounts.
- Each participating institution needs funded Stellar accounts and signs authorization entries, so onboarding an institution adds accounts and signers on the network.
- Netting reduces gross payments by design, so gross payment count may fall while contract invocations rise. Whether total on-chain activity rises is not established, and the metrics below avoid presenting reduced gross value as growth.
- Netting benefit itself is unproven (see [market analysis](market-analysis.md)).

## 3. Candidate metrics

Level: **chain** means anyone can recompute it from ledger data (RPC, Horizon, contract events); **application** means it comes from Tobin records and must be corroborated by a chain read before it is reported. Windows are UTC calendar months unless the owner sets otherwise. Targets: `[OWNER INPUT NEEDED: target and threshold for each metric M1 to M11]`.

| ID | Metric | Precise definition | Data source | Level | Independent verification |
|---|---|---|---|---|---|
| M1 | Settled sessions | Count of clearing-contract sessions with a settlement result (state `Settled`) whose ledger sequence falls in the window | Contract storage via RPC (`get_settlement`); `Settled` contract event | chain | A third party enumerates `Settled` events of the deployed contract and compares the count |
| M2 | Settlement transactions | Count of successful transactions invoking `settle` | RPC / Horizon history for the contract id | chain | Re-read by hash; status SUCCESS |
| M3 | Contract invocations | Count of successful invocations of any clearing-contract function | RPC events / Horizon operations | chain | Same read-back |
| M4 | Net value settled, per asset | Sum of `total_moved` of settled sessions, per token contract id, base units | `get_settlement.total_moved` | chain | Compare with token transfer events in the same transactions |
| M5 | Gross obligation value cleared, per asset | Sum of obligation amounts in the frozen obligations of settled sessions, per token | `get_obligations` | chain | Recompute from contract storage |
| M6 | Netting ratio | M4 divided by M5 over settled sessions, always reported with the session count | M4, M5 | chain | Recompute. It measures sessions Tobin settled, not what institutions would otherwise have settled |
| M7 | Distinct settling accounts | Distinct payer and payee addresses in the instructions of settled sessions | `get_proposal` of settled sessions | chain | Enumerate from storage |
| M8 | Institutions onboarded | Organizations with at least one verified wallet and at least one session settled on-chain | Application records matched to M7 addresses | application, corroborated by chain | Each counted institution maps to addresses in M7 |
| M9 | Reconciled settlements | Settlements whose read-back matched the approved batch exactly (no mismatches) | Reconciliation records (after roadmap D1.6-1) | application, corroborated by chain | Re-run the comparison against the chain |
| M10 | Failed or unknown outcomes | Attempts in state `failed`, `expired` or `unknown-outcome` | Application attempt records | application | Each hash re-read |
| M11 | Fees paid | Sum of fee charged for the session transactions | Horizon `fee_charged` | chain | Re-read by hash (existing evidence records fees per transaction but not decomposed) |

Rules: a metric counts only what a chain read confirms; an application state is never counted as settled; Testnet and Mainnet figures are reported separately and Testnet is never presented as adoption.

## 4. Measurement window and reporting

- Report per milestone and per tranche submission, stating the start and end ledger sequence.
- Publish the query method and contract ids with each figure so a reviewer can repeat it.
- `[OWNER INPUT NEEDED: reporting cadence and window length]`

## 5. Independent verification procedure

1. Take the contract ids from `contracts/deployments/testnet.json` (or a Mainnet manifest, if one is ever authorized).
2. Enumerate `Settled` events and transactions from RPC and Horizon for those ids.
3. For each session, read storage through the contract getters and recompute M4, M5 and M7.
4. Compare with the reported figures; report any difference as a discrepancy.

## 6. Limits

The public Discover endpoints return null statistics because no read-back transaction is recorded in application data (`docs/backend-implementation/RAILWAY-TESTNET-PILOT.md`). Until roadmap D1.6-1 is delivered, application-level counts cannot be backed by recorded read-backs.
