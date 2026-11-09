# Stellar Testnet Engineering Evidence — Fixed Scenario

**Status:** record of one owner-run Stellar Testnet execution (2026-11-07) and of a read-only re-read of its transaction records on 2026-11-09. Stellar Testnet only; test token; not production.
**Evidence basis:** `docs/product/architecture/mvp-1.5/evidence/settlement-reconciliation-2026-11-07.json`, `settlement-run-2026-11-07.jsonl`, `contracts/deployments/testnet.json`, `MVP-1.5-TESTNET-VERIFICATION.md`, `MVP-1.5-CLOSURE.md`, the plan builder `apps/web-console/lib/stellar/execution-plan.ts`, the run configuration `apps/web-console/lib/stellar/run.ts`.

Label: **our own recommended documentation**. Only hashes, ids and values that appear in the repository's evidence files are used. The files contain no explorer links and none is given here. A transaction record can be read from Horizon at `https://horizon-testnet.stellar.org/transactions/<hash>` (read path only).

**Scope in one paragraph.** This is limited Testnet contract interaction: eight owner-run transactions executing a **hard-coded, one-unit scenario** against the deployed clearing contract. It is not the demo organization's session or batch, it was not generated from a database-approved batch, and it does not establish a hosted end-to-end workflow, institutional pilot readiness or Mainnet readiness. It is same-author evidence from a single run.

## 1. What was recorded

### The scenario

The plan is built in `apps/web-console/lib/stellar/run.ts:32-39`: two participants, positions admin +1 and other -1, one obligation of 1 base unit (admin owes other), one instruction of 1 unit, and a cap `MAX_UNITS = 1n` (`run.ts:20`). The token is the governed Testnet test token. The "admin" account is the multisig administrative account; the "second" account is a single-key account. The session creator is the second account (`initiator: 'usr_other'`).

### Contracts (shortened; full ids are in `contracts/deployments/testnet.json`)

| Contract | Id | Wasm hash (from the manifest) |
|---|---|---|
| `TobinClearingV1` (immutable, no administrator or upgrade path) | `CCV3E…Y4DT` | `80bea96439b1f6647e08c604cdf29f580fe3f1a4171864b651b5832bb247e5e4` |
| `TobinTestToken`, governed instance | `CD5OK…OKYO` | `ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f` |

### The eight transactions

Step and function names come from the plan builder (`execution-plan.ts:118-125`); ledger, source account and fee come from the reconciliation file. Fees are the "fee charged" in stroops. Accounts: **admin** `GCZD5U7GKWMJHX52J2XF65ZULTBGXNMAATYDWMONXPTUD4WB57HMU5MJ` (multisig, two signatures on its transactions); **second** `GAS7VMM764FIEP6Q5KDWXXC56QE7YGORME27MFKWPMP63QL3LX7QJL2M` (single key).

| # | Contract function (operation purpose) | Transaction hash | Ledger | Source account | Fee (stroops) |
|---|---|---|---|---|---|
| 1 | `create_session`: the initiator creates the on-chain session; the session token is fixed | `a86fdd0f79ad2ba968e183f60808dc3e474a478c4e3b769b3516cdbbc65ffe8b` | 5606084 | second | 383342 |
| 2 | `join_session`: the other participant is admitted; participant and creator both authorize | `4b7350e8cd3338c91d8f5284942a69dd3efedd26b8a982ebf7eb97c2b3113644` | 5606163 | admin | 45929 |
| 3 | `submit_obligation`: the debtor submits its obligation (admin owes second 1) | `87873dffe08c463d0e770590ee287e46eca334e77a463e867e7a1ff60194a074` | 5606308 | admin | 307193 |
| 4 | `finalize_obligations`: freezes participants, token and obligations | `33623a3394d8f9877bc7e45c59476535eacc71c29697611149975f67f0e29ca1` | 5606388 | second | 35148 |
| 5 | `propose_settlement`: proposes the plan (one instruction, 1 unit) | `d9591044b3664e8cd5e5320f9090826a064e4c4b256835ca8a7f24185c4aeaeb` | 5606444 | second | 407170 |
| 6 | `approve_settlement`: first participant approves the current digest | `a1bc02c161712c10d2a2ab0eb11c7cd517ad8e429e75d516f9e327d64e3b789e` | 5606525 | second | 233143 |
| 7 | `approve_settlement`: second participant approves the same digest | `0bee25b75e0068b396a69c4644fa4c23685c52533c49510ec2b09401024a0370` | 5607401 | admin | 117295 |
| 8 | `settle`: the debtor authorizes its total and its transfer; all transfers succeed or none does | `002fff31c93233d4d9529f8447699870bb9c5ff056b5ad0eec2a9943e183daee` | 5607448 | admin | 390980 |

Sum of the eight recorded fees: 1,920,200 stroops (computed from the table; the files record fees per transaction and not a breakdown into resource and inclusion fees).

### Session and outcome (reconciliation file)

| Item | Recorded value |
|---|---|
| On-chain session id | `a053fd423ffba849424bb6d9c593e98543fb176fae92bf0cd3d5d5c100f0bd8c` |
| Plan fingerprint | `7edcf9c8fed3894fc090273603e28de2e6ca7d1a8018e60405c475d6924e5de5` |
| Session digest (expected and settled, equal) | `d5e052c5195d1d876159fb9a67dcbf8bc18a990c156a3bd49df69306cfeeb34e` |
| Obligation commitment | `afac843a782d3479c0424997bb8c00d814ce8f1ed23f0d8e21c9561f28e12fef` |
| Session state | `Settled` |
| Settlement ledger | 5607448 |
| Total moved / instruction count | 1 / 1 |
| Approvals | both participants, both on the settled digest |
| Balances after | admin 0, second 1; total supply 1 |
| Comparison with the plan | `ok: true`, progress `settled`, no mismatches |
| Run window (run log, UTC) | 2026-11-07T12:20:35Z to the last submission at 14:14 |

## 2. Three-way split of what is established

### (a) Repository-recorded evidence

The files above were written by the owner-run tool during and after the run. The tool re-observed the chain through Soroban RPC and Horizon before each step and the reconciliation was an independent read by the same tool (`"kind": "REAL TESTNET: independent chain reads (RPC + Horizon); no keys used; nothing submitted"`). This is a record, written by the implementing author.

### (b) Independently re-read on 2026-11-09 from Horizon Testnet

Method: for each of the eight hashes, a read-only `GET https://horizon-testnet.stellar.org/transactions/<hash>`. No transaction was submitted and no key was used.

What matched: all eight transactions exist on Testnet and are successful, each with one operation; the ledgers are 5606084, 5606163, 5606308, 5606388, 5606444, 5606525, 5607401 and 5607448, created between 2026-11-07T12:21:01Z and 2026-11-07T14:14:41Z; the ledger, the source account and the fee charged equal the recorded values for all eight.

What this re-read did not do: it compared Horizon transaction records only. The Soroban transaction contents (which contract function was called with which arguments) were **not** decoded on 2026-11-09, and contract state and token balances were not re-read. The re-read was done by the project side with read-only GET requests, so it is a second look at the public record, not an independent review.

### (c) Not independently verified

- The contract functions and arguments in each transaction (only the plan builder and the run log say what each step was).
- The final session state, the balances (admin 0, second 1) and the token supply on 2026-11-09 (recorded on 2026-11-07).
- That the deployed Wasm equals a reproducible build of the repository source on a hosted runner (gate E04 not verified; the MVP-1.5 closure records a read-only check that the deployed hashes equal the manifest).
- Resource use, fee composition, behaviour at maximum size (16 instructions) and the all-zero case.
- Behaviour with a second or hardware wallet; the run used Freighter in Edge only.
- Anything about security: no independent security review and no fuzzing exist.
- The 10-ledger authorization lifetime: the 2026-11-07 run used 30 ledgers by owner decision; the 10-ledger value is a constant in the owner tool (`run.ts:19`) that is not checked on attach and not enforced by the contract.

## 3. What this demonstrates and what it does not

**Demonstrates.** The deployed clearing contract executed a complete session lifecycle on Stellar Testnet in eight transactions (create, join, submit obligation, finalize, propose, two approvals, settle) with a multisig participant, and the plan, the on-chain digest and the final balances agreed. The settlement moved 1 base unit of a governed test token atomically. The transaction records are publicly readable and were re-read on 2026-11-09.

**Does not demonstrate.**
- A hosted end-to-end workflow. The hosted application records and prepares; it does not sign, submit or confirm. These transactions were prepared, signed and submitted by local owner-run tools.
- That a batch approved in the application became these transactions. The plan is hard-coded in `run.ts:32-39`; no code connects a database batch to the Stellar submission path, and no non-test code writes a confirmed outcome back to the application's records (`confirmSession` has no non-test caller).
- Anything about the demo organization's session or batch. Those are application records on the hosted deployment and must not be conflated with this run.
- Institutional pilot readiness, performance, scale, fee economics or netting benefit on real flows.
- Mainnet readiness. Mainnet is not authorized, not built and not part of this submission.
- Independent verification. The evidence is same-author and a single run.
