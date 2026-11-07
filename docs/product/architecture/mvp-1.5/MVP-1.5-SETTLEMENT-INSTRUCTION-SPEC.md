# Settlement instruction specification v1 (`tobin-settlement-instruction/v1`)

An instruction is a row of a prepared batch. **It is not a transaction.** A prepared or approved batch is not an executed settlement. A participant's internal bookkeeping key is not a Stellar account; a wallet address claim is not proof of ownership; a valid public key does not prove control.

## Fields
| Field | Meaning |
|---|---|
| `id` | `ins_` + hash of calculation id, attempt, sequence, payer, payee, amount: stable and deterministic |
| `batchId`, `sessionId`, `orgId` | the batch, the clearing session and the organization it belongs to |
| `calculationId` | the exact immutable calculation snapshot it derives from |
| `approvalDecisionId` | the active institutional approval of that snapshot at preparation time |
| `network` | `testnet` or `public`, taken from the canonical asset |
| `seq` | 1..n, contiguous, deterministic order |
| `payer`, `payee` | participant (user) ids, never accounts |
| `assetId` | canonical asset identity (`tobin-asset/v1`) |
| `amount` | positive whole base units, digits only, no leading zero |
| `sourceAccount`, `destinationAccount` | always NULL on a prepared instruction (CHECK-enforced). Accounts exist only in the execution snapshot, from **verified** wallets |
| `fingerprint` | SHA-256 over the fixed-order serialization of every field above (schema name first) |
| `validation` | `valid` (an instruction that fails validation is never stored) |

## Batch
`attempt` (1, 2, ...; UNIQUE with the calculation), asset snapshot, instruction count, total, `instructionsHash` (attempt 1 keeps the MVP-1.4 formula exactly so stored batches still verify; a later attempt is bound into the fingerprint), algorithm name, stored validation results, preparer and time. Immutable by trigger. Status is derived: awaiting review, approved, rejected, invalidated, superseded.

## Invariants (checked at preparation, at review and on demand)
Positive whole amounts; two different participants of the calculation; no duplicate pair, contiguous sequence; one asset; each net debtor pays exactly its net debit and each net creditor receives exactly its net credit; nobody both pays and receives; total paid = total received = total net debit; every instruction fingerprint and the batch fingerprint match; stored count and total match. Checked independently of the engine, which also validates the plan.

## Re-preparation (decision 2)
Allowed only when the source calculation is still the latest, current and actively approved, the session is open, no batch of it is awaiting review or approved, and every precondition passes. The request names the attempt (the next number); a repeat of an earlier attempt, or an attempt while another batch is active, is refused (409). Each attempt gets a new batch id, new instruction ids, a new fingerprint and its own review. The rejected batch and its reason are never changed.

## Closure (decision 3)
`close` requires an approved, still-eligible batch for the current calculation (in addition to the session being ready). This is **operational closure**: clearing and settlement preparation are complete. It is not settlement completion; settlement completion needs independently verified Stellar transactions, which this build cannot produce.

## Execution snapshot
`settlement_executions`: batch (one execution per batch), network, the verified account of every payer and payee (exactly one verified key per person per network, else refused), creator, time. `settlement_execution_events`: append-only state log.
