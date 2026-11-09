# Threat model: current system

**Status:** threat model of the system as it exists on 2026-11-09 (Stellar Testnet only); the draft of the Tranche 2 threat-model deliverable. Not an audit.
**Evidence basis:** consolidates and re-checks `MVP-1.5-THREAT-MODEL.md`, `W1-THREAT-MODEL.md`, `WALLET-FIRST-AUTH-SECURITY-REVIEW.md` and `SECURITY-FINDINGS-STATUS.md` against the source named in each row. Same-author; no independent review (gate P01 BLOCKED).

## Official / guidance / our recommendation

- **Official (SCF handbook, verified 2026-11-09):** a threat model and an on-chain monitoring plan are required in Tranche 2 (section "Tranche #2 Threat Model and Monitoring Plan Requirements" at https://stellar.gitbook.io/scf-handbook/scf-awards/scf-build/submission-criteria).
- **Official resource:** Stellar's "Threat Modeling Readiness How-To Guide", https://developers.stellar.org/docs/build/security-docs/threat-modeling (fetched 2026-11-09). Its landing page links four resources: What is Threat Modeling, a How-To Guide, a STRIDE Threat Model Template and an Example STRIDE Threat Model. The how-to and template pages could not be retrieved (the how-to URL guessed returned 404), so their headings are not quoted here.
- **Our alignment (not an official format):** threats carry an ID, affected components and a severity of Critical, High, Medium or Low, and a STRIDE category, because the official monitoring template ([monitoring-plan.md](monitoring-plan.md)) takes "threats from your STRIDE threat model, with IDs, affected components, and severity" as input. Headings below follow: assets, actors, trust boundaries, entry points, threats, mitigation, residual risk, owner or milestone.

## 1. Assets

| ID | Asset | Why it matters |
|---|---|---|
| A1 | Settlement correctness: net amounts, approved plan, token balances on Testnet | Wrong transfer of value (Testnet tokens today) |
| A2 | Participants' signing keys (in wallets) | Not held by Tobin; compromise is outside Tobin's servers |
| A3 | Institution records and tenant separation | Confidentiality of obligations and positions |
| A4 | Session tokens, password hashes, wallet challenges | Account takeover |
| A5 | Immutable decision, batch, attempt and audit records | Accountability |
| A6 | Proxy shared secret and hosting configuration | Only barrier on the public console route |
| A7 | Governed test token mint authority (administrative multisig) | Supply integrity of the Testnet token |
| A8 | Availability of the hosted app and database file | Single replica, no verified backup |

## 2. Actors

Unauthenticated internet user; registered user without membership; member; administrator; reviewer; malicious or compromised member of another tenant; compromised browser or extension; owner/operator running the local tools; Soroban RPC / Horizon provider; hosting providers (Railway, Vercel); a participant who tries to settle outside Tobin by calling the contract directly.

## 3. Trust boundaries and entry points

| Boundary | Entry points | Source |
|---|---|---|
| Internet to `apps/web` | pages, `/api/auth/*`, `/api/registry/*`, GET `/api/public/v1/*` | `apps/web/lib/proxy-policy.ts` |
| `apps/web` to console | server-to-server with `x-tobin-proxy-auth`; public Railway hostname | `HOSTING-CONFIGURATION.md`, `RAILWAY-TESTNET-PILOT.md` |
| Console to SQLite | in-process | `lib/db/database.ts` |
| Browser to wallet | `signTransaction`, `signAuthEntry`, message signing | `lib/stellar/freighter.ts` |
| Local tools to Stellar | RPC, Horizon (owner machine only) | `lib/stellar/run.ts` |
| Anyone to the contracts | direct invocation of the clearing and token contracts on Testnet | `contracts/clearing/src/lib.rs` |

Data-flow view: [../diagrams/trust-boundaries.mmd](../diagrams/trust-boundaries.mmd). Not entry points on a hosted build: sandbox, W0 mock API, `/api/rpc`, `/api/bootstrap`, `/api/stellar/*` (refused, `guards-hosted.test.ts`).

## 4. Threats

STRIDE: S spoofing, T tampering, R repudiation, I information disclosure, D denial of service, E elevation of privilege. Owner/milestone: MVP-1.7 unless stated. Residual risk is stated as of today, not after planned work.

### 4.1 Application layer

| ID | STRIDE | Threat | Sev | Existing mitigation (evidence) | Residual risk | Owner / milestone |
|---|---|---|---|---|---|---|
| T-01 | S | Wallet impersonation: claim a key not held | High | Server-issued 5-minute single-use challenge bound to site, network, key and purpose; ed25519 verify server-side (`wallet-challenge.ts`; `wallet-auth.test.ts`) | Real Freighter sign-in flow not run (stand-in used); `raw` ownership scheme (SEC-18) | owner; MVP-1.7 |
| T-02 | S | Challenge replay or substitution | High | Guarded single-row consume; user-bound add-wallet challenges; tests both directions | none known | |
| T-03 | S/E | Session theft or fixation | High | Opaque token, hash at rest, HttpOnly, SameSite=Strict, Secure, rotation on sign-in, 8 h / 2 h idle / 24 h cap, revoke-all | stolen cookie works until expiry or revocation; no device list | |
| T-04 | S | Account creation abuse / enumeration | Medium | Per-address register limit 10 per hour; login lockout; generic sign-in errors | Registration is open; 201/409 distinguishes existing email; email unverified (SEC-04, SEC-05) | P7 / MVP-1.7 |
| T-05 | I/E | Cross-tenant access (IDOR) | High | Server-side org scoping; 47-route isolation suite; uniform 404 for non-members | SQLite only; no DB-level isolation; PostgreSQL run pending | MVP-1.7 |
| T-06 | E | Privilege escalation via invitation or role | High | Role only from stored offer; bound invitations need matching verified email or wallet; last-admin guard | An unbound invitation is open to any holder of the token by design; suspended member reinstatement (SEC-13) | MVP-1.7 |
| T-07 | E | Reviewer approves own work | High | Separation of duties in `authorization.ts:28-38` | Separate batch-reviewer rule absent (BD-08); one person with several accounts defeats independence | P7 |
| T-08 | T | Stale approval or batch mutation after approval | High | Decision bound to calculation; batch approval bound to instruction hash; immutability triggers; invalidation in same transaction | Direct database file access can alter records; no hash chain (SEC-16) | MVP-1.7 |
| T-09 | R | Actions without an audit record | Medium | `activity`, `auth_audit` append-only | audit rows can be altered by whoever holds the file | MVP-1.7 |
| T-10 | T | CSRF on state-changing requests | Medium | Proxy validation of JSON, request header, exact Origin, Fetch Metadata; SameSite=Strict (`csrf.ts`) | No per-session token; Vercel edge untested beyond one live cross-origin refusal | |
| T-11 | I/T | XSS / script injection | High | Nonce CSP with `strict-dynamic`, no unsafe-inline or eval; React escaping; `<` `>` rejected in names | Real Freighter under CSP untested | |
| T-12 | D | Request flooding, password-hash exhaustion | Medium | Per-address, per-key and global limits; at most 4 concurrent hashes; 8 KiB proxy limit | Console reads body before size check (SEC-14); forwarded-address trust unverified (`TOBIN_TRUSTED_PROXY_HOPS=1`); egress addresses of Vercel unverified | MVP-1.7 |
| T-13 | I | Secret or token in logs | High | Redaction of secrets, tokens, signatures, emails, long tokens (`log.ts`) | Free-text beyond patterns not proven | |
| T-14 | I/E | Reaching development surfaces (sandbox, W0, RPC, bootstrap, owner tools) on the hosted console | High | Refused at three layers even with the secret; route-coverage test fails on any unlisted route | Code remains in the build (SEC-17); `/api/stellar/*` handler `account` parameter unvalidated (SEC-11) | |
| T-15 | I | Public Discover API leaks data | Medium | Opt-in organizations only; name, type, jurisdiction only; settlements and statistics return `null`; limit 50 (`lib/public/discover.ts`) | New unauthenticated surface, same-author only; no institution has opted in | |
| T-16 | S/E | Console reached directly, bypassing the web proxy | High | Host allow-list, JSON-only, shared secret on every non-probe request | The secret is the only barrier (public console hostname); the secret was printed once and rotated 2026-11-09; no rotation procedure | owner |

### 4.2 Settlement, signing and chain

| ID | STRIDE | Threat | Sev | Existing mitigation (evidence) | Residual risk | Owner / milestone |
|---|---|---|---|---|---|---|
| T-20 | T | Substituted or malformed plan submitted on chain | Critical | Contract validates parties, amounts, order, flows (`lib.rs:921`); every participant approves the exact digest; each payer authorizes `(session, digest, own total)` (`:631`) | The contract accepts any valid plan, including one that differs from the application batch; the application check is in the owner tool (`compare.ts`) only | MVP-1.6 |
| T-21 | T | Compromised page changes what the user signs | Critical | Plan derived server-side; signed answer must match the expected hash; fingerprints | Real wallet prompt content unverified; a compromised browser can mislead the user | MVP-1.7 |
| T-22 | S | Unauthorized signer signs for another participant | Critical | Signers enumerated per step and must be verified accounts of that participant; `require_auth` in contract | Account-based identity: one person with several accounts is not independent control. The Testnet admin multisig is controlled by one person | MVP-1.7 / 1.8 |
| T-23 | T | Replay of signed authorization entries | High | 10-ledger policy; fresh authorization after failure; unique tx hash per attempt step; digest binds network, contract, session, revision | Failed-transaction entries stay valid until expiry (EQ-20, accepted); lifetime not contract-enforced; 10-ledger value untried interactively | MVP-1.7 |
| T-24 | T | Duplicate settlement | Critical | Contract refuses settling twice (`AlreadySettled`); one live attempt per batch; no resubmission from unknown outcome | Verified with mocks and one real run | |
| T-25 | T/D | Wrong network | Critical | Adapter accepts `testnet` only; wallet must report the Testnet passphrase; challenges Testnet only | `asset-add` operator script still accepts the `public` network as configuration; migration 5 CHECK lists `public` (never written) | MVP-1.7 |
| T-26 | I/T | Manipulated or unavailable RPC | High | Comparison recomputes nets from on-chain obligations; NOT_FOUND and timeouts are unknown, never success | Single RPC provider; no second chain reader | MVP-1.7 |
| T-27 | T | Application and chain diverge | High | Confirmation only from a chain read; reconciliation must match; mismatch stops | Confirmed outcomes are not written back to application records; reconciliation is owner-run | MVP-1.6 |
| T-28 | E | Unauthorized mint of the Testnet token | High | Fixed minter and hard cap in `token/src/lib.rs`; mint requires the minter's authorization; Tobin app has no mint path | Mint authority is one person's three keys; master key still enabled (manifest) | owner |
| T-29 | D | Session stalls or ledger entries expire | Medium | By design no timeout or abort; TTL extended once on the token instance | Storage-lifetime constants are unmeasured placeholders; stalled sessions have no recovery path | MVP-1.6 / 1.7 |
| T-30 | T | Contract defect | Critical | 96 contract `#[test]` attributes, author-run mutation checks, one Testnet run | No independent review, no fuzzing; ceilings and resources unmeasured (gates P01, P03, P04) | external |

### 4.3 Operations

| ID | STRIDE | Threat | Sev | Existing mitigation | Residual risk | Owner / milestone |
|---|---|---|---|---|---|---|
| T-40 | D | Data loss: volume or database failure | High | Volume persisted across a redeploy (owner record) | No backup, no restore test, no rollback test, single replica (SEC-09) | MVP-1.7 (P5, P6) |
| T-41 | I | Secret exposure through repository or deployment | High | Ignore rules; release scanner; names-only documentation | History-wide scan not done by this package; no rotation procedure | owner |
| T-42 | R | Undetected incident | High | Structured logs only | No monitoring, alerting or incident process | MVP-1.7 |
| T-43 | E | Supply chain (npm, Rust, GitHub Actions) | Medium | Lockfile `npm ci --ignore-scripts`; actions pinned by SHA; dependency baseline check | Gate G04 BLOCKED (attribution review); no vulnerability scan (SEC-20) | MVP-1.7 |
| T-44 | I | Single recipient for vulnerability reports | Low | Private reporting plus email (`SECURITY.md`) | One maintainer; no response target | owner |

## 5. Residual risk summary

The largest unmitigated items for any step beyond Testnet demonstration: no independent review of contracts or application; single-person control of the Testnet multisig; account-based rather than institutionally independent signing identity; open registration and unverified email; no backup, restore, monitoring or incident process; unverified hosting edge behaviour; confirmed outcomes not reconciled in the application. Ordering of remediation is in [../implementation/implementation-status.md](../implementation/implementation-status.md) and the roadmap documents of this package.

## 6. Maintenance

Update this file when a boundary, entry point or control changes, and re-run the review before Tranche 2 submission. `[OWNER INPUT NEEDED: named owner for each threat row if different from the maintainer]`
