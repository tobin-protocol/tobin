# Wallet-first authentication: security review

Scope: the wallet sign-in, session, wallet-management, onboarding, organization, invitation and membership changes of this work. Method: design review against the threat list in the assignment, plus tests that attack each item through the real HTTP handlers and a real database (`test/wallet-auth.test.ts`) and a real-browser journey (`test/browser/wallet-auth-journey.mjs`). **This is a same-author review. It is not an independent audit, not a penetration test, and automated tests passing is not a claim that the system is production-secure.**

## Findings per threat

| Threat | Control | Evidence | Status |
|---|---|---|---|
| Challenge replay | single guarded `UPDATE … consumed_at IS NULL` must change exactly one row | replay and concurrent double answer both tested: one 200, one 401, one session | mitigated |
| Challenge expiry | 5-minute life checked on the server at verification and inside the consuming statement | expiry tested with a moved clock; the browser also refuses an expired challenge before sending | mitigated |
| Challenge substitution (another user's challenge) | add-wallet challenges name their user (CHECK constraint) and are refused for any other user; a sign-in challenge cannot add a wallet and vice versa | tested both directions | mitigated |
| Wallet-address substitution | signature is verified against the key stored in the challenge row; a signature by another key, or over altered text, fails | tested | mitigated |
| Signature verification correctness | existing ed25519/SEP-53 verifier; text rebuilt server-side; only `sep-53` accepted for sign-in (raw bytes are not signed for sign-in) | tested; real Freighter produced a SEP-53 signature the server accepted in the owner-run MVP-1.5 Stage 1 (the scheme is the owner's recollection) | mitigated; real-extension sign-in for *this* flow not run by the owner |
| Session fixation | every sign-in issues a fresh random token and revokes the presented one | tested (old cookie is dead) | mitigated |
| Session theft exposure | HttpOnly (page scripts cannot read it, checked in the browser), SameSite=Strict, Secure in production, hash-only storage, 8 h life, 2 h idle for wallet sessions, 24 h absolute cap on renewal, revocation, revoke-all | tested | reduced, not eliminated: a stolen cookie works until it ends or is revoked |
| CSRF | custom request header required on every state-changing request (cannot be sent cross-origin without a preflight the server never grants), SameSite=Strict, foreign-Origin refusal | tested (missing header gives 403) | mitigated; there is no per-session CSRF token |
| XSS and session exposure | the cookie is HttpOnly; nonce-based CSP from `proxy.ts`; user text is rendered by React and `<`/`>` are rejected in names | existing CSP tests; display names tested | mitigated by layering |
| Brute-force challenge requests | per key 10 per 10 minutes, 300 in total per 10 minutes | tested | mitigated, with a DoS trade-off (below) |
| Brute-force answers | 10 failures per key per 15 minutes; a challenge is burned after 5 wrong answers | tested | mitigated |
| Account enumeration | the same response for a known and an unknown wallet; one generic sign-in error | tested | mitigated for sign-in; see residual 3 |
| Invitation token leakage | 192-bit token, only the hash stored, shown once, travels in a URL fragment (never sent to a server) | existing tests, plus bound invitations | mitigated |
| Invitation replay | single use, atomic with membership creation | tested | mitigated |
| Invitation privilege escalation | the role comes only from the stored offer; every failure is one generic error | tested (admin offer gives admin only because an administrator offered it) | mitigated |
| Leaked token used by someone else | email invitations need the verified email holder (a wallet-only user has none); wallet invitations need that verified wallet | tested | mitigated for bound invitations; an unbound invitation is open to any holder of the token by design |
| Unauthorized organization switching | membership checked on the server; the stored preference is re-validated on use and dropped after suspension or removal | tested | mitigated |
| Cross-organization IDOR | uniform `404` for non-members and suspended members on every registry route | tested on five read routes and two write routes | mitigated |
| Privilege escalation | wallet sign-in creates no membership; creator role is application-only and carries no reviewer authority; only administrators suspend, invite or change roles; no self-suspension; last active administrator protected | tested | mitigated |
| Multiple-wallet account takeover | a new wallet needs its own fresh proof; a key active on another user cannot be added; no automatic merge; at most 5 wallets; unique active key enforced by the database | tested; the browser journey ran the refusal | mitigated |
| Race: invitation acceptance | acceptance and status change are in one transaction (existing `BEGIN IMMEDIATE`) | existing and new tests | mitigated for one process (residual 6) |
| Race: challenge consumption | guarded single statement inside `BEGIN IMMEDIATE` | tested with two simultaneous answers | mitigated for one process |
| Audit integrity | append-only by trigger; no signatures or tokens recorded | tested | partly mitigated: no hash chain, a database administrator can still alter the file |
| Sensitive data in logs | no signature, token or challenge text is logged or audited; errors are generic | reviewed; asserted for the audit | mitigated by review |
| Network change handling | only `testnet` is accepted (CHECK constraint, server and client); a wallet on another network is refused before any challenge; the navigation warns if the network changes after sign-in | tested and run in the browser journey | mitigated |
| Wallet account change handling | the account active in Freighter after sign-in is compared with the verified wallets and a banner is shown; an account switch during signing is caught before verification; the session itself is not changed by a wallet switch | tested (mock wallet) and run in the browser journey (stand-in extension) | mitigated; informational by design |
| Owner tooling reachable by any signed-in wallet | server-side gate on a verified wallet that is a configured signer, the administrative account or the second account | unit-tested and 403 checked in the browser journey | mitigated (**behaviour change**) |

## Defects found and fixed during implementation

1. An invitation addressed to an email would have been accepted by **any** wallet-only user holding the token, because the existing rule only compared emails when the acting user *had* one. Fixed: a bound invitation now needs the matching verified email or wallet.
2. The ownership-proof form still offered "public (Mainnet)". The option is removed from the UI and, after the owner decision, the server rejects it too (residual 8).
3. The Organizations page and the owner tools assumed an email account; the owner tools are now gated on a verified wallet, and the member list no longer exposes the reserved placeholder email.
4. The per-key challenge limit of 5 was too tight for a user retrying after declined prompts and was raised to 10 per ten minutes after the browser journey hit it.
5. A locked Freighter was reported as "connection declined"; it is now reported as locked (found by the unit tests of the sign-in sequence).

## Residual risks and limitations (stated, not hidden)

1. **Not independently reviewed; same-author tests; one local environment.** No fuzzing, no load testing, no penetration test.
2. **The real Freighter was not driven for this flow in this work.** The browser journey uses a stand-in extension that speaks the real extension message protocol, so the real client library and the real application code ran, but the stand-in is not Freighter. The same SEP-53 acceptance was shown with real Freighter only in the earlier MVP-1.5 owner run.
3. **Wallet existence is visible to an authenticated user** who tries to add a key that belongs to another user ("cannot be associated"). Sign-in itself does not disclose it.
4. **Rate limiting has no client-IP dimension** (the app is local-only behind a loopback guard). An attacker who can reach the app can exhaust the shared 300-per-ten-minutes challenge budget and stop other users from signing in for a while. A deployment behind a real proxy needs per-IP limits.
5. **No account recovery (deferred by owner decision, no bypass).** A wallet-only user who loses every wallet cannot get back in, and removing the only wallet is refused for that reason. No administrator override or support recovery exists, by design. A key revoked from a user and used to sign in again creates a **new** user; the old account is not reattached.
6. **Single process, single SQLite file.** Atomicity relies on SQLite `BEGIN IMMEDIATE`. Multi-process or multi-node behaviour was not tested.
7. **No per-session CSRF token and no device/session list** (the user can see audit events and sign out everywhere, not individual sessions).
8. **Resolved:** the ownership-proof server now rejects every network except Testnet (owner decision). The database CHECK of the accepted migration 5 still lists `public`, but the server never writes it. No Mainnet transaction, RPC or settlement exists anywhere.
9. **The audit log has no hash chain**; immutability is by database trigger only.
10. **A TLS-terminating production deployment** (secure cookies, trusted host names, proxy headers) was not exercised: the cookie is `Secure` in production mode, but only the local loopback setup was run.
11. **Placeholder email for wallet-only users** is a schema workaround (`users.email` NOT NULL). It is excluded from login, registration, API output and the member list; it is visible in the database.
12. The shared page header still reads "Tobin Console: MVP-1, experimental … local sandbox". That banner belongs to the shared layout and was left unchanged.
