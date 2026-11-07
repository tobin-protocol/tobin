# MVP-1.4 settlement preparation security

Same-author, local verification. Not an audit and not a penetration test. SU = `settlement.test.ts`, SO = `settlement-ops.test.ts`, SJ = `settlement-journey.mjs`.

| # | Threat | Control | Evidence |
|---|---|---|---|
| 1 | Unauthenticated access | Session required (401) | SO authorization |
| 2 | Non-member sees or acts on another organization's batches | Membership first; same 404 and body as a nonexistent organization, on all six settlement routes | SO authorization; SJ step 7 |
| 3 | Unauthorized preparation or decision | Preparation needs the administrator role (members, reviewers who are not administrators: 403); decisions need the reviewer capability (members and administrators without it: 403) | SO authorization; SJ step 7 |
| 4 | Preparing from a stale, unapproved, rejected, invalidated or superseded calculation | Server re-evaluates every precondition inside the transaction; older ids 409 `STALE` | SO preconditions; SJ steps 1, 4, 6 |
| 5 | Closed session produces or decides a batch | Checked at preparation and at review (409) | SO preconditions, closed |
| 6 | Client overrides amounts, asset, participants, instructions, ids, status, preparer | Only the calculation id is read; everything else comes from stored data; extra fields ignored | SO client override |
| 7 | Unsupported, disabled or ambiguous asset passes as supported | Resolution against the operator registry; a code alone is not an identity; the API cannot write the registry; database CHECKs enforce canonical ids | SU asset; SO asset registry, constraints |
| 8 | Instructions that do not reconcile (extra, missing, duplicated, offsetting, zero or negative, wrong asset, tampered) | Engine verdict plus independent integrity checks at preparation, at review and on demand; fingerprint check | SU integrity checks, 300 seeded conservation cases; SO happy path |
| 9 | Editing or deleting batches, instructions, reviews, invalidations | Immutable by trigger; no API route; CHECKs and composite foreign keys reject inconsistent rows | SO immutability |
| 10 | Transferring an approval to another batch or calculation | One review per batch (UNIQUE); a decision names the batch and its instruction fingerprint (mismatch 409); one batch per calculation | SO batch review, duplicate |
| 11 | Rejected batch treated as approved | Status derived from the single review row; a decided batch refuses another decision | SO batch review |
| 12 | Preparer approves own work | `SEPARATION_OF_DUTIES` (403) for approve and reject | SO separation |
| 13 | Source change leaves an eligible batch | Batch invalidation row written in the same transaction as every input change or recalculation; status also recomputed from the calculation's currency and approval on every read | SO source changes (edit, void, participant, recalculate); SJ step 6 |
| 14 | Duplicate or racing requests | UNIQUE per calculation and per batch review; `BEGIN IMMEDIATE`; second request 409; a data change on a second connection invalidates the first view | SO duplicate, concurrency (two connections, sequential) |
| 15 | Partial writes | Batch, instructions and activity in one transaction; failure rolls all back | SO atomicity |
| 16 | CSRF | Required request header on every non-GET; GET cannot decide | SO authorization |
| 17 | Misreading preparation or batch approval as signing or settlement | Wording and a seven-stage ladder with signing, submission and confirmation "not available"; no wallet, key, transaction or network code in the change | SJ steps 1, 2, 5 |
| 18 | Loss of history | Superseded and invalidated batches and their decisions stay readable | SO source changes; SJ steps 4, 6, 8 |
| 19 | Existing guarantees | MVP-1.2 and MVP-1.3 suites and journeys unchanged and passing | closure report |

## Limits and remaining risks
- Same-author evidence; no independent review.
- Concurrency tested only across two connections one after the other in one process, not multi-process.
- The asset registry is local operator configuration; nobody has verified any listed issuer on any network. Obligations carry only an asset code, so a code that matches several supported entries is refused rather than guessed.
- Account-based separation of duties (one person with two accounts defeats it); no minimum reviewer count; reviewer grants are not themselves approved. The two-reviewer pilot requirement and verified identity are deferred.
- Refused attempts are not written to the activity history.
- The 16-instruction ceiling is a provisional engine target, not a verified limit.
- Staleness of a batch is derived on read; there is no background job (none is needed for correctness).
No unresolved critical finding is known from this work.
