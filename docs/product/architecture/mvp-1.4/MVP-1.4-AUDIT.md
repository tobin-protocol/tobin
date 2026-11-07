# MVP-1.4 audit: settlement preparation engine

Written after MVP-1.3 was verified and committed locally (`d8db785`, on top of the MVP-1.2 baseline `b473ad8`) and before any MVP-1.4 code.

## What exists
- Calculation snapshots (MVP-1.2): immutable, with the exact input (participants, active obligations with revisions), the input hash, per-participant net positions (outgoing minus incoming, positive = debtor), gross, asset code, creator and time.
- Institutional approval (MVP-1.3): a decision bound to one snapshot, active only while the snapshot is the latest and current; invalidation rows written in the same transaction as every input-changing mutation.
- The netting engine package (`packages/mvp1-sdk`) already contains `proposalFromNets` (a deterministic debtor-to-creditor allocation: debtors and creditors each sorted by amount descending then by address, largest-first merge, at most debtors + creditors - 1 instructions) and `validatePlan` (an advisory validator with a 16-instruction ceiling). Both operate on Stellar-style party addresses.
- Reviewer capability, separation-of-duties pattern, activity history, derived-status pattern (immutable rows plus invalidation rows).

## Gaps
- No asset registry. Obligations carry only an asset CODE (shape-checked, MVP-1.2, frozen). A code is not an asset identity (issuer and network matter).
- No representation of settlement instructions or batches, and no review of them.
- Participants are users, not wallets. There are no wallet addresses and none may be invented.

## Decisions (engineering decisions within the brief, open to owner review)
1. **Reuse the engine.** Instructions come from `proposalFromNets` over the snapshot's stored net positions. Participants are mapped to the engine through the same deterministic bookkeeping handles MVP-1.2 uses (`partyHandle`, not wallets) and mapped back. The MVP-1.2 netting code is not changed. The result is one valid allocation, not claimed minimal or unique.
2. **Independent verification.** Besides the engine's own `validatePlan` verdict, `integrityChecks` re-derives every property from the snapshot with plain bigint arithmetic (positive whole amounts, valid distinct parties, no duplicates, contiguous sequence, one asset, exact per-participant reconciliation, nobody both paying and receiving, total paid = total received = total net debit, fingerprint).
3. **Asset registry as operator configuration.** A table `supported_assets` keyed by canonical id (`network:native` or `network:CODE:ISSUER`), written only by an operator command (`node scripts/db.ts asset-add ...`), never by the application API. It is a local list, not an on-chain query, and says nothing about availability, liquidity or transferability. Because obligations carry only a code, a code resolves only when exactly one supported entry has it; zero entries is unsupported, only disabled entries is disabled, several is ambiguous and refused. Carrying a full asset identity on obligations is deferred (it would change frozen MVP-1.2 data).
4. **One batch per calculation.** `UNIQUE(calculation_id)`. Corrections require a new calculation, a fresh approval and a new batch, matching the recorded product decision. A rejected batch therefore also needs a new calculation.
5. **Immutable batch, derived status.** Batches, instructions, reviews and invalidations are immutable rows; the status (awaiting review, approved, rejected, invalidated, superseded) is derived, and also requires that the calculation is still the latest, current and actively approved. The MVP-1.3 invalidation hook is extended (additively) to record batch invalidations in the same transaction.
6. **Preparation is atomic and validated.** There is no persisted "draft": preparation either passes every check and stores the batch with its validation results, or refuses and stores nothing. The preview endpoint shows the checks before preparing.
7. **Authority.** Administrators prepare. Reviewers (existing capability) decide. The reviewer must not be the preparer. The calculation approver may review a batch someone else prepared (not forbidden by the brief). Reviewing requires naming the batch and its instruction fingerprint.
8. **Zero-net calculations** prepare an empty batch (no transfers required) that is still reviewable.
9. **Provisional ceiling.** The engine's 16-instruction ceiling is a provisional target (not a verified limit); a larger plan is refused at preparation.

## Out of scope (unchanged)
Wallets, transaction construction, signing, submission, polling, on-chain verification, settlement, contracts, minting, identity providers. The two-reviewer pilot requirement and verified identity are deferred to MVP-1.8. Roadmap MVP-1.2 to MVP-1.8 unchanged.
