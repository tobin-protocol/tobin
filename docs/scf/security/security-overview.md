# Security overview

**Status:** current-state security description for the SCF Build Award (Open Track) submission package. 2026-11-09. Stellar Testnet only.
**Evidence basis:** source files cited by path, `docs/backend-implementation/SECURITY-FINDINGS-STATUS.md`, `HOSTING-CONFIGURATION.md`, `IMPLEMENTATION-STATUS.md`, the MVP-1.5 and wallet-first-auth records, `release/RELEASE-GATES.json`, and `SECURITY.md`. All evidence is same-author.

Label: this document is **our own recommended documentation** (SCF Open Track guidance, point 8, asks for a unified source with planning and dev artifacts). The SCF handbook requires a threat model and an on-chain monitoring plan in Tranche 2; those are in [threat-model.md](threat-model.md) and [monitoring-plan.md](monitoring-plan.md).

## 1. Independent review status

| Item | Status | Evidence |
|---|---|---|
| Independent security review | **None performed.** Release gate P01 is BLOCKED | `release/RELEASE-GATES.json` P01 |
| Penetration test | None | `SECURITY-FINDINGS-STATUS.md` (last line) |
| Fuzzing | None. Gate P04 NOT VERIFIED; only seeded property tests and author-run mutation checks exist | gate P04 |
| Wallet and multisig verification | Incomplete: Freighter in Edge only; no second or hardware wallet (gate P02 BLOCKED) | gate P02, `MVP-1.5-CLOSURE.md` |
| Measured resources, fees, storage lifetimes | Not measured (gate P03 NOT VERIFIED) | gate P03 |
| Hosted CI results | Not recorded in the repository (gates E01 to E05 NOT VERIFIED) | `RELEASE-GATES.json` |
| Reviews that exist | The implementing author's own: `SECURITY-FINDINGS-STATUS.md`, `WALLET-FIRST-AUTH-SECURITY-REVIEW.md`, `MVP-1.5-THREAT-MODEL.md`. They are reviews, not audits | those files |

Audit costs are outside the Build Award budget (official handbook); an independent review is planned through whatever route the owner chooses. `[OWNER INPUT NEEDED: whether Tobin will apply to the SCF Audit Bank, and the target timing]`

## 2. Boundaries

| Boundary | Description | Evidence |
|---|---|---|
| Browser to `apps/web` | Next.js app; nonce CSP and security headers; only `/api/auth`, `/api/registry` and read-only `/api/public/v1` are forwarded; GET and POST only; body limit 8 KiB | `apps/web/lib/proxy-policy.ts`, `apps/web/lib/server/{csrf,headers}.ts` |
| `apps/web` to `apps/web-console` (the backend) | Server-to-server call carrying a shared secret header; the console serves only `/api/auth`, `/api/registry`, `/api/public` and probes in hosted mode | `apps/web-console/lib/server/config.ts:21` |
| Console to database | SQLite file through `node:sqlite`; triggers protect 15 tables | `apps/web-console/lib/db/database.ts` |
| Application to Stellar | Only the owner-run local tools talk to Soroban RPC and Horizon. The hosted console refuses `/api/stellar/*` | `apps/web-console/test/guards-hosted.test.ts` |
| User to wallet | Freighter in the user's browser holds keys and signs | section 7 |

## 3. Assets and sensitive data

| Asset | Where | Protection |
|---|---|---|
| Account email and password hash | `users` | scrypt (N=2^16), 12 to 128 character passwords, at most 4 concurrent hashes (`lib/auth/service.ts:17,97`; `lib/auth/http.ts:46`) |
| Session tokens | cookie `tobin_session`; SHA-256 at rest | `lib/auth/service.ts:2`; HttpOnly, SameSite=Strict, Secure in production (`lib/auth/http.ts:71`) |
| Institution data: organizations, members, sessions, obligations, calculations, decisions, batches | SQLite | tenant isolation, immutability triggers |
| Verified wallet public keys | `user_wallets`, `wallet_verifications` | public data |
| Proxy shared secret | Railway and Vercel environment | never committed; names only in the docs |
| Stellar private keys | **Not held by Tobin servers** (section 7) | n/a |
| Audit trail | `auth_audit`, `activity` and related tables | append-only triggers |
| No data-classification policy exists | | `[OWNER INPUT NEEDED: data classification and retention policy for institution data]` |

## 4. Trust assumptions

- A single console instance and one SQLite file (SEC-09, accepted risk until PostgreSQL).
- Reviewers named by an organization administrator are trusted to approve calculations and batches. A reviewer approval is a database record, not a signature.
- One Soroban RPC provider is trusted for read-back; no second chain reader exists (`MVP-1.5-THREAT-MODEL.md` #10).
- The Freighter extension and the user's browser are trusted for what the user is shown at signing (threat model #2, #9).
- Soroban semantics (authorization, rollback of a failed invocation) are assumed as documented by Stellar.
- The Testnet administrative multisig is controlled by one person; the master key is enabled at weight 1 (`contracts/deployments/testnet.json`, governed token note). It is not independent governance.
- Railway and Vercel edge behaviour for forwarded addresses is assumed (`TOBIN_TRUSTED_PROXY_HOPS=1`) and not verified (`RAILWAY-TESTNET-PILOT.md`).

## 5. Authentication

| Mechanism | Implementation | Notes |
|---|---|---|
| Email and password | `lib/auth/service.ts` | Email is **not verified** (SEC-04 outstanding). Registration is open on the hosted deployment |
| Wallet sign-in | `lib/auth/wallet-challenge.ts`, `lib/stellar/wallet-signin.ts`, `components/wallet-signin.tsx` | Server-issued challenge, 5 minutes (`AUTH_CHALLENGE_TTL_MS`), single use via one guarded `UPDATE ... consumed_at IS NULL`, bound to site, network (`testnet` only), key and purpose; `sep-53` scheme only for sign-in. The SEP-53 signature scheme was accepted from Freighter once in the owner run; the scheme details are recorded as the owner's recollection (`MVP-1.5-CLOSURE.md`). Real-Freighter validation of the sign-in flow itself is outstanding; tests use a protocol-compatible stand-in |
| Sessions | opaque random token; SHA-256 at rest | 8 h lifetime; 2 h idle for wallet sessions; 24 h absolute cap on renewal; fresh token on every sign-in; revoke-all (`service.ts:37-39`) |
| Wallet limits | at most 5 wallets per user; 10 challenges per key per 10 minutes; 300 total; challenge burned after 5 wrong answers (`service.ts:41-45`) | |
| Recovery | None. Deferred by owner decision; no administrator override | `WALLET-FIRST-AUTH-SECURITY-REVIEW.md` residual 5 |

## 6. Authorization and role separation

Distinct concepts, never merged (`AGENTS.md` section 6): authenticated user, institutional membership and role (`admin` or `member`, `active` or `suspended`), reviewer grant (`org_reviewers`; not implied by `admin`), settlement initiation, Stellar signing authority.

| Rule | Implemented in | Test |
|---|---|---|
| Server-side membership, role and reviewer checks; no client-supplied identity is trusted | `lib/registry/service.ts`, `lib/registry/http.ts` | `authorization*.test.ts`, `backend-security.test.ts` |
| Separation of duties: users who ran a calculation, or created, edited or voided an obligation in its input, cannot decide on it | `lib/registry/authorization.ts:28-38` | `authorization*.test.ts` |
| Approval bound to one calculation snapshot; stale approvals invalidated in the same transaction as the change | `authorization.ts` | same |
| Wallet verification grants no role | `MVP-1.5-WALLET-AND-SIGNING.md` | `wallet-ops.test.ts` |
| Last active administrator protected; no self-suspension | `service.ts` | conformance suite (concurrent step-down) |
| Owner tools gated on a verified wallet that is a configured signer or the second account | `lib/stellar/owner-access.ts` | `wallet-auth.test.ts` and journey (403 check) |

Not built: separate batch-reviewer rule (BD-08, SEC-10), planned in P7. A suspended member can be reinstated by accepting an invitation (SEC-13, outstanding).

## 7. Tenant isolation

Server-side organization scoping. The isolation suite (`apps/web-console/test/tenant-isolation.suite.ts`, run by `tenant-isolation.sqlite.test.ts`) replays an explicit table of **47 organization-scoped routes** (its own comment, line 20), cross-checked against the router's dispatches. It asserts that a foreign administrator gets the same answer as for a nonexistent organization, that nothing from the first organization appears in any response, that no row count changes, that a member is refused administrator work (403) and that an unauthenticated caller gets 401 on every route. The suite has 6 tests. There is no database-level row isolation; PostgreSQL privileges are planned only.

## 8. Wallet ownership verification, signing authority and transaction authorization

- **Ownership:** a signature over a server-rebuilt challenge, verified server-side (`lib/registry/wallet-proof.ts`). A multisig account's ownership is shown through a signer-set-aware proof read from Horizon (`lib/stellar/signer-set.ts`). The `raw` scheme for organization ownership proof is unchanged (SEC-18).
- **Signing authority:** keys live in the user's wallet. Grep of `apps/web-console/lib`, `apps/web-console/app`, `apps/web/lib` and `packages/mvp1-sdk/src` finds `Keypair` only as `Keypair.fromPublicKey` (verification and hints); no `fromSecret` call; `lib/stellar/run.ts` states "Nothing here holds a key". Signing is requested from Freighter (`lib/stellar/freighter.ts`). Separately, repository tools for the owner (`scripts/tst-signer`, `contracts/clearing/signer`) handle keys locally; they are not part of the web applications, and the tst-signer README states nothing there is authorised to execute.
- **Owner-run execution controls (application side, not contract rules):** steps strictly in order from re-observed chain state; exact typed confirmation `I CONFIRM SUBMIT STEP n`; amount capped at 1 base unit (`MAX_UNITS`, `run.ts:20`); authorization entries limited to 10 ledgers (`ENTRY_LIFETIME_LEDGERS`, `run.ts:19`); re-simulation before send; no automatic retry; unresolved prior attempt blocks a new one. The 2026-11-07 run used a 30-ledger entry by a recorded owner decision for that run (`MVP-1.5-TESTNET-VERIFICATION.md`). The 10-ledger value has not been exercised in an attended interactive session (`run.ts:19` comment).
- **Hosted app:** does not sign, submit or confirm. Owner tools are local only today.

## 9. Settlement integrity: what the contract enforces and what it does not

Verified in `contracts/clearing/src/lib.rs`:

- `join_session` requires both the joiner and the creator (`:332-333`); `submit_obligation` the debtor; `propose_settlement` an admitted participant (`:451-456`); `approve_settlement` each participant; `settle` is callable by anyone and requires, per distinct payer, `require_auth_for_args(session, digest, own total)` (`:631`).
- `validate_plan` (`:921`) accepts **any** plan that has valid admitted parties, positive amounts, no self-payment, strictly ascending (payer, payee) order, at most 16 instructions, checked arithmetic, no participant both debiting and crediting, and per-participant debit and credit equal to the net position computed from the obligations. It does not compare a plan with the off-chain engine's output and does not require a minimal plan.
- A proposal replacement clears approvals; approvals bind to the current digest (digest version 2, revision bound in).
- `settle` re-validates, writes the terminal state, then transfers; a failing transfer reverts the invocation. The contract executes the settlement in one transaction with checked arithmetic.
- No administrator, upgrade path, timeout, abort or recovery. A session can stall indefinitely.

Not enforced by the contract: that the plan matches an application batch; the 10-ledger entry lifetime; the 1-unit cap; typed confirmation; who the human behind an account is. The owner tool refuses locally when the on-chain plan differs from the approved batch (`lib/stellar/compare.ts`). Ceilings (4 participants, 16 obligations, 16 instructions) and storage-lifetime constants are provisional placeholders. The digest was approved by the owner as a design decision; there is no independent cryptographic review.

## 10. Replay protection and idempotency

| Control | Evidence |
|---|---|
| Wallet challenges single-use and expiring | `wallet-auth.test.ts` (replay and concurrent double answer) |
| One transaction hash per attempt step (schema UNIQUE, migration 6); no automatic retry; unknown outcome never resubmitted | `attempts-ops.test.ts` |
| Digest binds network id, contract id, session id and revision (A to B to A replay refused) | contract `digest.rs`, `proposal.rs` tests |
| Authorization-entry expiry (10-ledger policy) and fresh authorization after any failure | `entry-lifetime-policy.test.ts`. Signed entries of a **failed** transaction remain reusable until expiry (Soroban behaviour, accepted as EQ-20); mitigated by policy, not by the contract |
| HTTP idempotency keys | **Missing.** The conformance suite records two characterization tests showing duplicates are created and any header is ignored; planned in P7 |

## 11. Immutable records and audit events

Fifteen tables are append-only or immutable by trigger and are listed in `IMMUTABLE_TABLES` (`registry-conformance.suite.ts:86`): `activity`, `calculations`, `authorization_decisions`, `authorization_invalidations`, `settlement_batches`, `settlement_instructions`, `settlement_batch_reviews`, `settlement_batch_invalidations`, `settlement_executions`, `settlement_execution_events`, `settlement_attempts`, `settlement_attempt_events`, `settlement_attempt_transactions`, `signer_set_snapshots`, `auth_audit`. `database.ts` contains 41 trigger-creation statements. The suite checks that each refuses UPDATE and DELETE; three tables are not populated by its setup chain, each documented in the suite. Limits: no hash chain (SEC-16, accepted); anyone with write access to the database file can alter it.

## 12. Database and infrastructure

- **Hosted guards (`TOBIN_DEPLOYMENT_MODE=hosted`):** the service refuses to start if configuration is missing; Host allow-list (no wildcards), served-path allow-list, Origin check, JSON-only, shared proxy secret of at least 32 characters on every non-probe request; sandbox, W0 mock API, `/api/rpc`, `/api/bootstrap` and `/api/stellar/*` answer 404 even with the secret (`HOSTING-CONFIGURATION.md` section 3; `guards-hosted.test.ts` enumerates every route handler).
- **Headers (apps/web):** per-request nonce CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP, HSTS in hosted mode. Exercised with a mock wallet extension, not real Freighter.
- **CSRF:** validated at the web proxy (JSON, `x-tobin-request`, exact Origin, Fetch Metadata) and again by the console's request header; `SameSite=Strict`. No per-session CSRF token.
- **Current topology:** the console has a public Railway domain because a Vercel function cannot reach Railway's private network, so the shared secret and the Host allow-list are the only barrier (`RAILWAY-TESTNET-PILOT.md`, topology update). Registration is open.
- **Not verified:** forwarded-address handling on Vercel or Railway, rate limiting from Vercel egress addresses, backup and restore, rollback, log retention.

## 13. Secrets management

`.env*` files are ignored; variable **names** are documented and values live in Railway and Vercel. The release scanner (`scripts/release/scan.mjs`) runs in CI; the last recorded scan was 854 files, 0 findings (`MVP-1.5-CLOSURE.md`), which does not by itself pass gate G09. The proxy secret was printed once by a CLI during setup and rotated on 2026-11-09 (`RAILWAY-TESTNET-PILOT.md`). No written rotation or ownership procedure exists. Logs redact Stellar secret-key patterns, long tokens and emails (`lib/server/log.ts:18-20`).

## 14. Logging, monitoring, rate limiting

- **Logging:** structured JSON lines with request id, route label, status, duration, refusal codes; redaction in both apps (`apps/web-console/lib/server/log.ts`, `apps/web/lib/server/log.ts`; tests `hosting-rate-logging.test.ts`, `log.test.ts`).
- **Monitoring and alerting:** none (SEC-08 outstanding). See [monitoring-plan.md](monitoring-plan.md).
- **Rate limits** (`lib/auth/http.ts:24-29`, per last `X-Forwarded-For` entry with exactly one trusted hop): register 10 per hour; failed login 20 per 15 minutes; wallet challenge 30 and failed verification 20 per 10 minutes. Per-account login lockout: 5 failures per 15 minutes (`service.ts:47-48`). Console reads bodies before the size check (SEC-14 outstanding); the web proxy limit is 8 KiB.

## 15. Failure modes

Execution states `failed`, `expired`, `unknown-outcome`, `reconciliation-required` exist in `lib/registry/settlement-state.ts`. A RPC `NOT_FOUND` or timeout is unknown, never success or failure; the original hash is read, never resent. A reconciliation mismatch stops execution. These paths were exercised with mocks; the real run had no failure (`MVP-1.5-CLOSURE.md`). Confirmed on-chain outcomes are not written back to application records.

## 16. Vulnerability reporting and incident response

- **Reporting:** GitHub private vulnerability reporting (enabled; checked through the GitHub API on 2026-11-07 per `SECURITY.md`), with the maintainer email as a secondary route. One recipient; no response-time target, bounty or safe harbour (`SECURITY.md`).
- **Incident response:** no formal process, runbook, on-call or notification procedure exists. Planned in MVP-1.7. `[OWNER INPUT NEEDED: incident owner, contact route, and first-response expectations]`

## 17. Controls matrix

Columns: Code = implemented in code; Test = automated test (static file path; no CI or local result is recorded unless a date and commit are given); Manual = manually verified, where recorded; Doc = documentation only; Missing; Ext = needs external review.

Recorded executions: P1 local run on 2026-11-09 (Node v24.14.0, commit not stated in the record; branch `feat/backend-hosting-hardening`, merged as PR #48): web 164/164, console 510 pass 8 skipped of 518, hosted-config check 37/37, security-header check 52/52 (`IMPLEMENTATION-STATUS.md`). P2 local run: conformance 13/13, isolation 6/6, console 529 pass 8 skipped of 537. No hosted CI result is recorded in the repository.

| Control | Code | Test | Manual | Doc | Missing | Ext |
|---|---|---|---|---|---|---|
| Password hashing, session cookie flags, expiry, rotation | `lib/auth/service.ts`, `http.ts` | `wallet-auth.test.ts`, `backend-security.test.ts` | browser journey (HttpOnly checked) | review doc | | yes |
| Wallet challenge single-use, expiry, binding | `wallet-challenge.ts`, `service.ts` | `wallet-auth.test.ts` | Freighter SEP-53 accepted once (owner run) | yes | real-Freighter sign-in run | yes |
| Email verification | | | | SEC-04 | **yes** (P7) | |
| Account recovery | | | | review residual 5 | **yes** (deferred) | |
| Role, reviewer, separation of duties | `authorization.ts`, `service.ts` | `authorization*.test.ts` | | yes | separate batch reviewer (BD-08) | yes |
| Tenant isolation (47 routes) | `registry/service.ts`, `http.ts` | `tenant-isolation.suite.ts` (SQLite) | | yes | PostgreSQL run; DB row isolation | yes |
| Immutable records (15 tables) | `database.ts` triggers | `registry-conformance.suite.ts` | one-time mutation checks recorded in P2 | yes | hash chain (SEC-16 accepted) | |
| Hosted fail-closed guards, route refusals | `lib/server/{config,guards}.ts`, `proxy.ts` | `guards-hosted.test.ts`; `check-hosted-config.mjs` | loopback only (P1 record) | yes | Railway/Vercel edge behaviour | |
| Security headers and CSP | `apps/web/lib/server/headers.ts`, `proxy.ts` | `hosting.test.ts`; `check-security-headers.mjs` | mock wallet only | yes | real Freighter under CSP | |
| CSRF at proxy | `apps/web/lib/server/csrf.ts` | `hosting.test.ts` | cross-origin POST refused on live site (owner record) | yes | per-session token | |
| Rate limits | `lib/auth/http.ts` | `hosting-rate-logging.test.ts` | | yes | forwarded-address verification | |
| Structured redacted logs | both `log.ts` | `log.test.ts`, redaction tests | | yes | retention; monitoring (SEC-08) | |
| Contract authorization and plan validation | `lib.rs` | `contracts/clearing/tests/*.rs` (96 `#[test]` attributes across clearing and token) | one Testnet run | yes | | **yes** (P01) |
| Digest binding and stale-approval refusal | `lib.rs`, `packages/mvp1-sdk/src/digest.ts` | `digest.rs`, `proposal.rs`, `digest.test.ts` | reconciliation used same-author digest | yes | independent verification | yes |
| Owner-run execution controls | `lib/stellar/run.ts` | `attempts-ops.test.ts`, `entry-lifetime-policy.test.ts` | one Testnet run (30-ledger entry) | yes | 10-ledger interactive trial | |
| Read-back and reconciliation | `lib/stellar/{rpc,compare}.ts` | `stellar-plan.test.ts`, `stellar-rpc.test.ts` (mocks) | `settlement-reconciliation-2026-11-07.json` | yes | application write-back; second chain reader | |
| Public Discover API read-only, opt-in | `lib/public/discover.ts`, `proxy-policy.ts` | `public-discover.test.ts` | hosted answers checked by owner (`RAILWAY-TESTNET-PILOT.md`) | yes | independent review | yes |
| Release scan for secrets | `scripts/release/scan.mjs` | `scan.test.mjs` | 854 files, 0 findings | yes | history-wide scan | |
| Backup and restore | | | | | **yes** | |
| Monitoring and alerting | | | | plan only | **yes** (MVP-1.7) | |
| Incident response | | | | | **yes** | |
| Independent review, fuzzing, penetration test | | | | gates | **yes** | **yes** |

## 18. Security findings status (SEC-01 to SEC-20)

Restated from `docs/backend-implementation/SECURITY-FINDINGS-STATUS.md` (covers P1; the baseline `docs/backend-audit/security-assessment.md` is a desk audit by the same author). "Fixed" never means independently reviewed.

| Status | Findings |
|---|---|
| **Fixed** | SEC-01 Host/Origin/secret guards (Railway behaviour unknown); SEC-02 CSP and headers (real Freighter untested); SEC-03 CSRF at proxy; SEC-07 wallet challenge domain; SEC-17 sandbox/W0/RPC/bootstrap refused (by refusal, not removal); SEC-06 per-address limits (fixed locally; forwarded-header behaviour unknown) |
| **Partially fixed** | SEC-05 registration limits (still open registration and 201/409 distinction); SEC-15 sample-data gate refused in hosted mode (matcher skips dotted paths); SEC-20 CI jobs added (no vulnerability scan); SEC-08 logging fixed, monitoring outstanding |
| **Mitigated in hosted mode, outstanding in code** | SEC-11 `account` in signer-set Horizon URL unvalidated; SEC-12 `/api/stellar/validation` |
| **Accepted risk** | SEC-09 single replica and SQLite until P4/P6; SEC-16 no audit hash chain |
| **Outstanding** | SEC-04 email verification; SEC-10 execution account mapping not shown to batch reviewer; SEC-13 suspended-member reinstatement; SEC-14 body read before size check; SEC-18 `raw` ownership scheme; SEC-19 full Cookie forwarded, no `__Host-` prefix |

The status file's phase table lists P2 as "in review"; the repository history shows its merge as PR #50.

## 19. Disclosure

Exploit-level detail beyond what the repository already publishes is intentionally omitted. See `SECURITY.md` for the reporting route.
