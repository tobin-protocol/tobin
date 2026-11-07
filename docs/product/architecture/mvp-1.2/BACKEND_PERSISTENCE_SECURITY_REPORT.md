# Backend and persistence: security report

Same-author, local verification. This is not an audit and not a penetration test.

## Threats, controls and evidence
| # | Threat | Control | Evidence (test) |
|---|---|---|---|
| 1 | Unauthenticated access | every registry route requires a live server-side session; 401 otherwise | S1 |
| 2 | Invalid, expired, revoked sessions | unknown/short tokens, 8 h absolute expiry, server-side revocation on logout | S2 |
| 3 | Forged identity headers | no header is ever read as identity; headers such as `x-tobin-dev-user`, `x-user-id`, `Authorization`, `x-forwarded-user` give 401 | S3; browser journey step 8 |
| 4 | Arbitrary user-id injection | acting user comes only from the session; body fields `userId`, `createdBy`, `actor` ignored | S3 |
| 5 | Cross-organization access | membership required on every call; non-members receive the same 404 and body as for nonexistent organizations (list, detail, members, invitations, wallets, sessions, create, update) | S5; sessions journey F; backend journey step 8 |
| 6 | Unauthorized role changes | admin-only; members get 403 for role change, removal, invite, invitation list; unknown role 400 | S6 |
| 7 | Last administrator removal or demotion | checked inside the transaction | S7, `backend-db` test, browser step 2 |
| 8 | Invitation replay | single use by status check in one transaction; second use by anyone fails uniformly | S8, two-connection conflict test |
| 9 | Expired invitations | 7 day expiry checked at acceptance | S9 |
| 10 | Revoked invitations | status check | S10 |
| 11 | Invitation token leakage | only SHA-256 stored; token absent from list API, activity, database dump; shown once; invitation link uses the URL fragment (never sent to a server) and is cleared from the address bar | S11; browser step 3 |
| 12 | Stolen token used by the wrong account | email-addressed invitations accept only for that verified email | S8b |
| 13 | Invitation token guessing | 10 failed attempts per account per 15 minutes then 429 | S8c |
| 14 | Mass assignment | handlers pick named fields; client `id`, `createdAt`, `provenance`, `sessionId`, `chain`, `confirmedTxHash`, `orgId`, `proof` ignored | S12, participants test |
| 15 | Development identity in production | provider throws when `NODE_ENV=production`; no production module references it or any flag | S13 |
| 16 | Misconfigured production | no `TOBIN_DB_PATH` or an in-memory path: no backend, 503, no fallback | S13b |
| 17 | Fixture/draft provenance escalation | no route; Registry rules; database CHECK constraints reject the writes | S14, S15, constraints test |
| 18 | CSRF | SameSite=Strict, foreign-Origin refusal, JSON-only POST, required `x-tobin-request` header | CSRF test |
| 19 | Credential stuffing, account enumeration | per-email failure throttle (5 per 15 min, 429 even for the right password), unknown account and wrong password indistinguishable, dummy hash verified for unknown accounts, registration conflicts return a generic error | authentication test |
| 20 | Password and session secret storage | scrypt with per-user salt; session token only as SHA-256; neither appears in responses, activity or logs | authentication test |
| 21 | Activity tampering | no API route; database triggers abort UPDATE and DELETE | constraints test, activity test |
| 22 | Cookie theft by script | HttpOnly (`document.cookie` cannot read it), SameSite=Strict, Secure in production | browser steps S0 and 1 |
| 23 | Information leakage in errors and health | 500s are generic; 503 for backend problems without detail; `/api/health` returns status and schema version only | health test; browser step 10 |
| 24 | Bounded work from stored hash | verify accepts only scrypt cost 4 to 17 | code |

## Sensitive data handling
Passwords, session tokens and invitation tokens are never written to the database in recoverable form (passwords salted scrypt; tokens SHA-256), activity details, API list responses or server logs (the only server log line is a backend-unavailable message with no credentials). Activity `detail` carries roles, labels, ledger numbers and hashes only.

## Remaining risks
1. No email verification: a registered email is not proven to belong to the registrant, so email binding of invitations is a mitigation, not identity proof.
2. No MFA, SSO, password reset, breach-password checks or per-IP throttling; open registration lets anyone create an account and organizations.
3. The invitation token is a bearer secret handed over out of band by the administrator; transport security of that handover is outside the application.
4. SQLite file permissions and disk encryption are the operator's responsibility; no encryption at rest in the application.
5. `node:sqlite` is experimental.
6. A single process holds the throttling and session state in the database, so multiple instances against one file are unsupported.
7. No audit log shipping; activity lives in the same database as the data it audits (an administrator with file access can alter it).
8. Wallet links and participants are unproven claims by design.
9. Dependency and supply-chain scanning of the installed packages was not part of this milestone.
No unresolved critical finding is known from this work. Independent review has not happened.
