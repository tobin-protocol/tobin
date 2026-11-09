# Dependency and risk matrix

Status: planning record for P0 (2026-11-09). Baseline `main` at `b16a7db`. Decisions are in [`ADR-0001`](ADR-0001-approved-backend-decisions.md); the audit it draws on is in [`docs/backend-audit/`](../backend-audit/README.md). Stellar Testnet only.

## 1. Phase dependencies

Sequence: P0, P1, P2, P3, P4, P5, P7, P6. P8 is out of scope.

| Phase | Depends on | Blocks | Can run in parallel with | Needs owner input before it can finish |
|---|---|---|---|---|
| P0 decisions | none | all | none | U-12 (milestone mapping) confirmation is requested, not blocking |
| P1 hosting readiness and security hardening | P0 | P6; P7 items that need the new proxy boundary | P2 | U-11 (first-organization bootstrap) design; Railway networking facts (the P6 documentation check feeds the binding decision) |
| P2 store conformance and tenant-isolation foundation | P0 | P3, P4 | P1 | none |
| P3 asynchronous store on SQLite | P2 | P4 | none | none |
| P4 PostgreSQL store | P3 | P5, P6 | P7 items that do not touch the store interface | U-01, U-03, U-04, U-05 |
| P5 backup, inspection, migration rehearsal | P4 | P6 | none | whether the SQLite database may be live (stop condition); U-08 |
| P7 product gaps | P1; items that add tables also need P4 | P6 (wallet linking, separate reviewer and recovery are staging-validation items) | P4 after P3 | U-02 (production email), U-11, U-13 |
| P6 Railway staging | P1 to P5, and the P7 items staging validates | the pilot | none | Railway facts verified from official documentation; U-09, U-10; **separate approval for public exposure and for cutover** |
| P8 settlement execution | not approved | | | separate design proposal and approval |

Cross-phase technical dependencies:

| Item | Needs | Why |
|---|---|---|
| Configurable host and origin guards (P1) | a decision on the proxy boundary and the trusted client-IP hop | the console must accept only the private service host, and the client IP must travel in a header the console trusts only from `web` |
| Wallet challenge domain from configuration (P1) | a configured public origin variable | today the signed `domain` is the internal Host (SEC-07) |
| Wallet linking (P7) | challenge purposes and a configured domain (P1); per-user single-use challenge storage | the challenge must be bound to user, key, network, domain and purpose |
| Separate batch reviewer (P7) | stable user ids on calculation decisions (they exist in `authorization_decisions`) | compare ids, never display names (the Reviews page compares names today) |
| Email verification and recovery (P7) | provider abstraction, rate limiting (P1), token tables (new migration) | no provider is approved (U-02) |
| Aggregate and paged reads (P7) | the store interface after P3 | avoids writing each query twice |
| Idempotency keys (P7) | a table and a retention rule (U-05) | scope, fingerprint and retention must be defined |
| Pre-deploy migrations (P6) | migration tooling (P4) | no first-request migration and no replica race |

## 2. Risks

Likelihood and impact are the implementer's assessment (Inference), not measurements. "Phase" is where the mitigation lands.

| ID | Risk | Likelihood | Impact | Mitigation | Phase |
|---|---|---|---|---|---|
| R-01 | The asynchronous refactor (59 store methods, 169 call sites, 49 direct SQL calls in `AuthService`) changes behaviour subtly, especially transaction boundaries and the authentication-failure counter that must commit before an error returns | Medium | High | P2 conformance suite as a gate; refactor with no schema or domain change; review nested-transaction behaviour explicitly | P2, P3 |
| R-02 | `jsonb`, or a driver that reorders keys, breaks the recalculation check at `registry/service.ts:618` | Low if `json` is used | High (every settlement preparation fails) | `json` column type; a key-order round-trip test on both stores | P2, P4 |
| R-03 | i128-sized amounts pass through JavaScript `Number` and lose precision | Medium | High | decimal strings end to end; `numeric(39,0)` with range checks; large-value round-trip tests | P4 |
| R-04 | A missed code path skips the per-organization lock, leaving a latent race (last administrator, invitation acceptance, calculate, decide, prepare, execution transitions) | Medium | High | one locking discipline on a transaction-bound client; real concurrent-writer tests for each rule | P4 |
| R-05 | Loosening the host guard exposes the unauthenticated sandbox, W0, `/api/rpc` and `/api/bootstrap` routes | Medium | High | explicit production exclusion or refusal in code, with tests, before any guard change | P1 |
| R-06 | The CSP breaks Next scripts or the Freighter extension flow | Medium | Medium | nonce-based CSP; browser test with the extension flow and a mock; no global weakening | P1 |
| R-07 | Restoring CSRF validation at the proxy breaks legitimate same-site calls or sign-in | Medium | Medium | tests for cross-origin, same-site and same-origin; Fetch Metadata where supported; document the exact signals required | P1 |
| R-08 | Wrong trusted-proxy assumptions make IP rate limits bypassable, or lock out everyone behind one address | Medium | Medium | exactly one trusted hop, checked against Railway documentation; tests with forged headers | P1, P6 |
| R-09 | The live SQLite database is in use (WAL) and a backup is inconsistent | Low to Medium | High | stop and ask the owner if liveness is unclear; use SQLite's backup mechanism; checksums; inspect only the backup | P5 |
| R-10 | Existing data fails the tighter PostgreSQL foreign keys or domains | Medium | Medium | preflight queries; a documented decision per failing row class; the migration refuses on unexplained failures | P5 |
| R-11 | Password hashes and invitation hashes leak through migration artifacts | Low | High | never log or print sensitive values; restrict access to the archive; reports contain counts and canonical-row hashes only | P5 |
| R-12 | Wallet linking allows account takeover or cross-user linking | Low if built as specified | High | single-use short-lived challenge bound to user, key, network, domain and purpose; reject replay, expiry, cross-user and already-linked keys; keep ownership, authentication, membership, role, reviewer and signing authority separate; stop if any risk remains | P7 |
| R-13 | The separate-reviewer rule locks small organizations out of batch approval | High (by design) | Medium | state it in the UI and documents; U-13 early warning | P7 |
| R-14 | Account recovery becomes an authentication bypass (token theft, enumeration, session fixation) | Medium | High | expiring single-use hashed tokens; enumeration-resistant responses; session revocation after reset; rate limits; audit events; no production claim until delivery is tested | P7 |
| R-15 | Invitation-controlled registration is bypassed through wallet sign-in creating unknown users | Medium | High | control the creation path for both flows; tests; U-11 | P1, P7 |
| R-16 | Railway behaviour differs from remembered behaviour (private DNS, IPv6, health-check Host, pre-deploy command, volumes, backups, Node 24) | High until verified | High | verify against official documentation and record URL, date and conclusion; mark Unknown with a validation plan where documentation is silent; no deployment before this | P6 |
| R-17 | Two replicas race on migrations or on in-memory state (owner-tool maps, rate counters) | Medium | Medium | pre-deploy migration step; one console replica until state is database-backed | P6 |
| R-18 | The 10-ledger entry lifetime makes interactive owner use impractical | Low to Medium | Low | the owner tool stays local; the policy is approved; validate in the next owner-attended Testnet session (not run here) | P1 |
| R-19 | Execution state stays unconnected to the real signing path while the app implies otherwise | Existing | High if misread | correct the execution step text; keep execution actions disabled; P8 design proposal after this work | P1, P8 |
| R-20 | New `apps/web` CI jobs are slow or flaky and block merges | Medium | Low | keep jobs bounded; report skips; keep existing workflows intact | P1 |
| R-21 | A migration or test run touches the owner's live developer database | Low | High | tests use temporary databases; the migration utility refuses the configured live path; never run migrations against the original | P2, P5 |
| R-22 | Claims drift: wording says "production ready" or implies independent review | Low | Medium | follow `docs/COMMUNICATION-AND-MATURITY-TERMINOLOGY.md`; keep the evidence levels separate in the final report | all |

## 3. Baseline measured in P0 (nothing was changed)

Run on `main` at `b16a7db`, Node v24.14.0, on this working tree:

| Check | Result |
|---|---|
| `npm run typecheck` (root, all workspaces) | exit 0, about 23 s |
| `npm test --workspace tobin-web-console` | 494 tests, 486 pass, 0 fail, 8 skipped (about 31 s) |
| `npm test --workspace tobin-mvp1-sdk` | 64 tests, 55 pass, 0 fail, 9 skipped |
| `npm test` in `apps/web` | 150 tests, 150 pass, 0 skipped |

The skips are expected to be the suites that need the Rust development bridge (`TOBIN_BRIDGE_EXE`, `AGENTS.md` section 9); the individual skip reasons were not captured in this run's output and are not individually verified. No browser journey, lint, build, release scan or CI run was repeated in P0.
