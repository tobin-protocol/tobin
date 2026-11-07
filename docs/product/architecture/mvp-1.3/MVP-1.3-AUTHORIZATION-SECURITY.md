# MVP-1.3 authorization security

Same-author, local verification. Not an audit and not a penetration test. AU = `test/authorization.test.ts`, AO = `test/authorization-ops.test.ts`, AJ = `test/browser/authorization-journey.mjs`.

| # | Threat | Control | Evidence |
|---|---|---|---|
| 1 | Non-member views or decides | Membership checked first; same 404 and body as a nonexistent organization | AO isolation; AJ step 7 |
| 2 | Member or administrator without the capability decides | Reviewer capability required (403); administrators are not reviewers by default; only administrators grant; members cannot self-grant; revoked reviewers lose the right | AO authority; AJ steps 1, 7 |
| 3 | Self-approval by the person who recorded, edited or calculated | `SEPARATION_OF_DUTIES` (403) from obligation rows and the activity history; the UI states the reason | AU conflicts; AO separation (calculator, recorder, earlier editor); AJ step 2 |
| 4 | Approval of a stale snapshot | Currency (input hash) checked inside the decision transaction (409 `STALE`) | AO stale |
| 5 | Approval of an older or wrong snapshot; tampered id | The request names the calculation; only the latest is accepted; unknown id 404; missing or non-string 400 | AO stale/bound |
| 6 | Reuse of an approval after a change | Invalidation row written in the same transaction as every input-changing mutation; status also recomputed on every read; the old approval cannot be re-submitted | AU decision status; AO changes (edit, void, record, participant add and remove) |
| 7 | Recalculation inheriting a decision | A new snapshot has no decision; the old one is invalidated ("a new calculation superseded this one") | AO recalculation; AJ step 4 |
| 8 | Decision on a closed session | 409 | AO closed |
| 9 | Rejection without a reason | API requires 1 to 500 characters; database CHECK repeats it | AO rejection, tampering |
| 10 | Duplicate or conflicting decisions, races | UNIQUE on `calculation_id`; `BEGIN IMMEDIATE`; second decision (same or opposite) 409; a data change on a second connection wins over a stale approval | AO duplicate, concurrency (two connections, sequential) |
| 11 | Editing or deleting decisions, invalidations, activity | Immutable by trigger; no API route | AO activity |
| 12 | Body tampering (decider, status, time, id, organization) | Handlers read only named fields; server assigns all of them | AO tampering |
| 13 | CSRF, unauthenticated calls | Required request header (403), session (401), GET cannot approve | AO tampering |
| 14 | Partial writes | One transaction for checks, decision and activity; an outer failure rolls back both | AO rollback |
| 15 | Losing history | Decisions survive invalidation, reviewer revocation and member removal | AO history, activity; AJ step 8 |
| 16 | Misreading approval as a signature or settlement | Wording on the tab, in the API note and in the activity labels; the ladder shows later stages as not available; no wallet or network code exists in the change | AJ steps 1, 5 |

## Remaining risks and limits
- Same-author evidence; no independent review.
- Concurrency tested only across two connections one after the other in one process. Mutual exclusion rests on SQLite `BEGIN IMMEDIATE` and the UNIQUE constraint; true multi-process contention was not tested.
- Account-based separation: one person with two accounts defeats it. No identity verification, MFA or email verification exists (unchanged from MVP-1.2); open registration remains.
- A single administrator can grant reviewer to a colluding second account. There is no approval of grants and no minimum number of reviewers.
- Failed decision attempts (refusals) are not written to the activity history; only decisions, invalidations and reviewer changes are.
- Conflicts from an obligation editor are found by matching the short obligation id in activity text produced by this application; a future change of that text format would need the matching updated (covered by the integration test).
- There is no expiry of a decision other than data change.
No unresolved critical finding is known from this work.
