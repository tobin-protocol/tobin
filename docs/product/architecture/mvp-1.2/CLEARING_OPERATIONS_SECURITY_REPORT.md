# Clearing operations: security report

Same-author, local verification. Not an audit and not a penetration test. Evidence names refer to `test/clearing-ops.test.ts` (OPS), `test/clearing.test.ts` (UNIT) and `test/browser/clearing-journey.mjs` (CJ).

| # | Threat | Control | Evidence |
|---|---|---|---|
| 1 | Cross-organization access to participants, obligations, calculations, readiness, workflow | Every call checks membership first; non-members receive the same 404 and body as for a nonexistent organization (existence not revealed) | OPS isolation (10 routes compared to a nonexistent organization); CJ step 13 |
| 2 | Cross-session access (an obligation id of session A through session B) | Obligation lookups are scoped to the session in the URL | OPS isolation (get, void, update through another session: 404; calculation belongs to its session) |
| 3 | Unauthorized mutation by a member | Create, update, void, participant changes, calculate and workflow changes need administrator role (403) | OPS validation, end-to-end; CJ step 12 (direct request 403) |
| 4 | Unauthenticated access | 401 without a session | OPS isolation |
| 5 | CSRF | SameSite=Strict, foreign-Origin refusal, JSON-only, required request header on every non-GET (403 without) | OPS isolation |
| 6 | Obligation tampering via the client (id, status, revision, creator, organization) | Handlers pick named fields; server assigns id, revision, status, actor, organization | OPS validation |
| 7 | Client-supplied net positions, gross, asset, input hash | Calculation takes no input; the server reads persisted obligations and runs the engine; extra body fields ignored | OPS calculation |
| 8 | Stale results presented as current | Current only if the SHA-256 of the present input equals the snapshot's; readiness and mark-ready refuse stale | UNIT staleness; OPS end-to-end; CJ step 7 |
| 9 | Invalid amounts (zero, negative, decimal, exponent, spaces, numbers, overflow) and floating point | Digit-only decimal strings, bigint arithmetic in the engine, i128 bound; database CHECKs repeat the rules | UNIT amounts; OPS validation; OPS constraints |
| 10 | Mixed assets netted together | One asset per session enforced at create and update; readiness and calculation refuse | OPS validation; UNIT readiness |
| 11 | Edits after the session is marked ready or closed (workflow bypass) | `ready` and `closed` refuse participant, obligation and calculation changes (409); `closed` has no exit | OPS end-to-end |
| 12 | Inconsistent records | Composite foreign keys (an obligation can only name participants of its own session), CHECKs, transactions; a refused mutation writes nothing, and an outer failure rolls the record and its activity back together | OPS constraints, atomicity |
| 13 | Concurrent mutation and calculation | `BEGIN IMMEDIATE` transactions; a change made on a second connection to the same file is seen as staleness | OPS two connections (sequential in one process) |
| 14 | SQL injection | Prepared statements only; no string-built SQL with request data | code review; OPS validation with hostile text |
| 15 | Activity tampering and leakage | Append-only triggers; snapshots immutable by trigger; no secrets in details | OPS activity, constraints |
| 16 | Participant removal that would invalidate obligations or results | Refused while active obligations name the participant; member removal likewise | OPS participants |
| 17 | Fixture data in operations | Fixture sessions refuse every operation (409) | OPS fixture |
| 18 | Misreading ready as signed or settled | Wording on every relevant panel and API note; nothing in the code signs or settles | CJ steps 1, 6 |

## Remaining risks
- Same-author evidence; no independent review.
- The two-connection test is sequential in one process; true multi-process contention is untested.
- Open registration and the earlier limits (no MFA, SSO, per-IP throttling) are unchanged.
- Administrators alone can edit and calculate; there is no maker-checker separation (deferred product decision).
- Obligations are recorded by an administrator, not authorized by the debtor; no counterparty confirmation exists (cross-organization workflow is out of scope).
- Asset codes are shape-checked only; no registry.
No unresolved critical finding is known from this work.
