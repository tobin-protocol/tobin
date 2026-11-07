# MVP-1.4 implementation: settlement preparation engine

Paths relative to `apps/web-console/`. **MVP-1.4 prepares settlement instructions. It does not connect wallets, sign transactions, submit transactions or confirm settlement on Stellar.** No funds move.

## Architecture
- `lib/registry/settlement.ts`: pure rules (asset resolution, instruction generation, independent integrity checks, derived batch status).
- `lib/registry/service.ts`: `supportedAssets`, `settlementPreview`, `prepareSettlementBatch`, `settlementBatches`, `settlementBatch`, `settlementBatchValidation`, `decideSettlementBatch`; the MVP-1.3 `#invalidate` hook now also invalidates batches.
- `lib/registry/{types,store,sqlite-store}.ts`: persistence. `lib/registry/http.ts`: routes. `components/sessions/settlement-panel.tsx`: the Settlement preparation tab. `scripts/db.ts`: operator asset commands.

## Algorithm
Input: the snapshot's net positions (never client input). Debtors (net > 0) and creditors (net < 0) are sorted by amount descending, ties by engine address order; the first debtor pays the first creditor the smaller of the two remaining amounts, both remainders shrink, exhausted entries are dropped, repeat until both lists are empty. Output sorted by (payer, payee), numbered 1..n. Exact bigint arithmetic, no rounding. Complexity O(n log n) for sorting plus an O(n) merge, at most debtors + creditors - 1 instructions, always terminates (each step exhausts at least one entry). The result is one valid allocation; it is not claimed to be minimal or unique. All-zero input gives zero instructions.

## Preconditions (re-evaluated by the server on every preparation, preview and review)
Session not closed; a calculation exists; it is the latest and current; the exact calculation has an active institutional approval (not rejected, not invalidated, not superseded); every position's participant is still an active participant and organization member; every input obligation is still active at the same revision, between active participants, in the calculation's asset; the stored net positions recompute exactly from the stored input and sum to zero; the asset resolves to exactly one supported registry entry; no batch exists yet for the calculation; the engine accepts the plan (at most 16 instructions); the instructions reconcile independently. The request names the calculation; an older or unknown id is refused. Client-supplied amounts, assets, participants, instructions and ids are ignored.

## Asset registry
`supported_assets(id, network testnet|public, kind native|issued, code, issuer, status supported|disabled, source = 'operator-configured', added_at)` with CHECKs: native means code XLM and no issuer; issued needs a valid issuer; the id must equal `network:native` or `network:CODE:ISSUER`. Changed only by `node scripts/db.ts asset-add <testnet|public> native | <CODE> <ISSUER>`, `asset-disable <id>`, `asset-list`; read-only over `GET /api/registry/assets` (any signed-in user). Batches snapshot the asset's fields, so later configuration changes never rewrite history. Local configuration only: no on-chain check, nothing implied about availability or liquidity.

## Instruction model
`settlement_instructions`: stable id (`ins_` plus a hash of calculation id, sequence, payer, payee, amount), batch, session, calculation, sequence, payer and payee (user ids), canonical asset id, amount (digits only, positive, no leading zero), validation shown as valid. CHECK payer <> payee; UNIQUE (batch, sequence) and (batch, payer, payee); a composite foreign key ties each instruction to its batch's session and calculation. Immutable by trigger.

## Batch lifecycle
Prepared (validated, awaiting review) -> approved or rejected by one reviewer -> invalidated or superseded when the calculation changes, is recalculated, or its approval stops applying. Status is derived. "Draft" does not exist: preparation is atomic. A batch is never edited; a new calculation produces a new batch. The batch carries a SHA-256 fingerprint of its instructions bound to the calculation and asset.

## Authorization and separation of duties
Administrators prepare; reviewers (existing capability, administrators are not reviewers by default) decide; the preparer cannot decide (403 `SEPARATION_OF_DUTIES`); a decision must name the instruction fingerprint (a mismatch is 409 `STALE`); rejection needs a 1 to 500 character reason (API and CHECK); one decision per batch (UNIQUE); decisions and invalidations are immutable. Calculation approval, batch approval and (future) signing are separate acts.

## Database (migration 4; migrations 1 to 3 untouched)
`supported_assets`, `settlement_batches` (UNIQUE calculation, summary, validation results, fingerprint, algorithm, preparer), `settlement_instructions`, `settlement_batch_reviews` (UNIQUE batch), `settlement_batch_invalidations`; immutability triggers on all four settlement tables.

## API (session cookie; non-GET need `x-tobin-request: 1`; actor from the session)
| Route | Method | Who |
|---|---|---|
| `/api/registry/assets` | GET | signed-in |
| `/orgs/:o/sessions/:s/settlement` (checks, assets, batch history) | GET | member |
| `.../settlement/prepare` `{calculationId}` | POST | administrator |
| `.../settlement/batches/:b` (batch, instructions, validation, eligibility) | GET | member |
| `.../settlement/batches/:b/validation` (live re-validation) | GET | member |
| `.../settlement/batches/:b/approve` `{instructionsHash}` | POST | reviewer |
| `.../settlement/batches/:b/reject` `{instructionsHash, reason}` | POST | reviewer |

## Frontend
A "Settlement preparation" tab (operational sessions): seven-stage ladder (clearing calculation, calculation approval, preparation, batch approval, and wallet signing, submission and on-chain confirmation each "not available in MVP-1.4"); the preparation checks with details and a Prepare button; the batch (calculation, asset identity, count and total, preparer, fingerprint, algorithm); instruction table; validation list; decision area with mandatory rejection reason or the reasons a decision is unavailable; batch history. Wording never states or implies that funds moved.

## Files
Created: `lib/registry/settlement.ts`, `components/sessions/settlement-panel.tsx`, `test/settlement.test.ts`, `test/settlement-ops.test.ts`, `test/browser/settlement-journey.mjs`, the MVP-1.4 documents.
Modified: `lib/db/database.ts` (migration 4), `lib/registry/{types,store,sqlite-store,service,http,session-view}.ts`, `components/sessions/sessions-app.tsx`, `scripts/db.ts`, `package.json` (script), and schema-version assertions in `test/backend-db.test.ts`, `test/backend-security.test.ts`, `test/clearing-ops.test.ts`, `test/authorization-ops.test.ts`, `test/browser/backend-journey.mjs`.
