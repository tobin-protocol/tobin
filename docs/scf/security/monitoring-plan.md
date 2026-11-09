# On-chain and operational monitoring plan

**Status:** draft of the Tranche 2 monitoring-plan deliverable; 2026-11-09. Most of the plan is **planned for MVP-1.7**, not implemented.
**Evidence basis:** contract events and entry points in `contracts/clearing/src/lib.rs` and `contracts/token/src/lib.rs`; `contracts/deployments/testnet.json`; hosting records; [threat-model.md](threat-model.md).

## Official / guidance / our recommendation

- **Official (SCF handbook, verified 2026-11-09):** an on-chain monitoring plan is required in Tranche 2. The handbook links two Stellar templates: Builders, https://developers.stellar.org/docs/build/security-docs/monitoring/monitoring-template-builders and Users, https://developers.stellar.org/docs/build/security-docs/monitoring/monitoring-template-users.
- **Official resource:** the Builders template was fetched on 2026-11-09. Its six sections are: 1 What are we monitoring? 2 What could go wrong? 3 What does exploitation look like on-chain? 4 What will we monitor for? (monitor IDs of the form `<ThreatID>.M.<n>`, trigger condition, baseline, rule) 5 What happens when an alert fires? (severity, who is notified and how, automated action, owner, status Active/Tuning/Planned, last review) 6 Did we do a good job? (review checklist). The Users template was not fetched.
- **Our alignment:** sections 3 to 8 below follow those six headings; threat IDs are the `T-nn` IDs of [threat-model.md](threat-model.md). The ordering and naming are ours, not an official form.

## 1. What exists today

| Item | State | Is it monitoring? |
|---|---|---|
| Structured JSON logs with request id, route, status, duration, refusal codes (`lib/server/log.ts` in both apps) | Implemented; redaction tested | No. Logs are written; nothing reads them, aggregates them or alerts |
| Liveness `/api/live` and readiness `/api/ready` (database and schema; reports `stellar: not checked`) | Implemented; hosted checks on Railway at deploy start only | No. Probes answer when asked; no scheduler or alert |
| `/api/health` compatibility probe | Implemented | No |
| Chain read-back by hash and reconciliation (`lib/stellar/{rpc,compare}.ts`) | Owner-run, per settlement | No. On demand only |
| Monitoring, alerting, dashboards, on-call | **None** (SEC-08 outstanding) | |

## 2. Scope and addresses (template section 1)

Stellar Testnet only. No contract holds real value. Components:

| Component | Identifier (from `contracts/deployments/testnet.json`, recorded 2026-10-29 and 2026-11-03) |
|---|---|
| `TobinClearingV1` | `CCV3E…Y4DT` |
| Governed `TobinTestToken` (intended MVP token) | `CD5OK…OKYO` |
| Legacy `TobinTestToken` | `CD7HO…UC4O` |
| Administrative multisig account (token minter) | `GCZD5U7GKWMJHX52J2XF65ZULTBGXNMAATYDWMONXPTUD4WB57HMU5MJ` |

The deployed Wasm hashes are recorded in the manifest; their equality with a build of the current source is not verified by a recorded hosted run (gate E04 NOT VERIFIED). This plan covers Stellar Testnet only; no Mainnet identifier exists and none is planned in this submission.

## 3. Threats carried over (template section 2)

Chain-related: T-20 (invalid or substituted plan), T-22 (unauthorized signer), T-23 (replay), T-24 (duplicate settlement), T-28 (unauthorized mint), T-29 (stalled sessions, TTL expiry), T-30 (contract defect). Operational: T-12, T-16, T-40, T-42. Severities are in the threat model.

## 4. What exploitation would look like (template section 3)

| Threat | Observable effect | Off-chain only? |
|---|---|---|
| T-20 | `Settled` event whose `total_moved` or `instruction_count` differs from the application's approved batch | no |
| T-22, T-23 | `Approved` or `Settled` events for sessions Tobin has no record of; `settle` invocations by unexpected sources | no |
| T-24 | A second `Settled` for one session (the contract returns `AlreadySettled`, so a failed transaction rather than an event) | no |
| T-28 | `Mint` event on a token contract; supply above the recorded value | no |
| T-29 | A session that remains in `Committed` or `Approved` past its expected window; contract instance or entry TTL close to expiry | partly |
| T-12, T-16 | Spikes of 4xx or 429, authentication failures, requests missing the proxy secret | yes |
| T-40 | Database readiness failure, volume full, failed deploy | yes |

## 5. What to monitor for (template section 4)

Contract events and entry points are those in the source. Clearing events (`lib.rs:170-240`): `SessionCreated`, `ParticipantJoined`, `ObligationSubmitted`, `ObligationsFinalized`, `SettlementProposed`, `Approved`, `SessionApproved`, `Settled`. Token events: `Mint`, `Transfer` (`token/src/lib.rs:119,141`). Read functions for reconciliation: `get_session`, `get_settlement`, `get_approvals`, `get_proposal`, `total_supply`, `balance`, `minter`.

| Monitor ID | Condition | Baseline / threshold | Planned source |
|---|---|---|---|
| T-28.M.1 | Any `Mint` event on the governed token or the legacy token | Expected: zero beyond the recorded supply of 1 base unit as of ledger 5533978. Threshold: any new event | RPC event query |
| T-28.M.2 | `total_supply` differs from the recorded value | `[OWNER INPUT NEEDED: expected supply and who may change it]` | RPC read |
| T-20.M.1 | `Settled` event for a session without an approved Tobin batch, or with different `total_moved` | Threshold: any mismatch | event stream vs application database |
| T-24.M.1 | More than one `Settled` event per `session_id` | Threshold: any | event stream |
| T-22.M.1 | `SessionCreated` or `Approved` by an account that is not a registered verified wallet | Threshold: `[OWNER INPUT NEEDED]` | event stream vs `user_wallets` |
| T-23.M.1 | Failed `settle` transactions per session | Threshold: `[OWNER INPUT NEEDED]` | transaction history |
| T-29.M.1 | Session open longer than a set number of ledgers; instance TTL within a set margin | Threshold: `[OWNER INPUT NEEDED]`; token instance live until ledger 6570727 per manifest | RPC ledger entries |
| T-30.M.1 | Unexpected contract error codes (e.g. `CorruptState` = 90, `DigestMismatch` = 40) in failed transactions | Threshold: any `CorruptState` | transaction results |
| ADMIN.M.1 | Signer set, weights or thresholds of the administrative account change | Recorded: thresholds 5/6/7; any change | Horizon account read |
| OPS.M.1 | Request error rate (5xx) | `[OWNER INPUT NEEDED]` | structured logs |
| OPS.M.2 | Readiness failing, or `/api/ready` not answering | `[OWNER INPUT NEEDED]` | probe scheduler |
| OPS.M.3 | Rate-limit trips (`RATE_LIMITED`) per address and total | `[OWNER INPUT NEEDED]` | logs |
| OPS.M.4 | Authentication failures; `CSRF_ORIGIN` and missing-secret refusals | `[OWNER INPUT NEEDED]` | logs |
| OPS.M.5 | Volume usage and database size | `[OWNER INPUT NEEDED]` | platform metrics |
| REC.M.1 | Reconciliation exceptions: any comparison with `ok: false`, any attempt in `unknown-outcome` or `reconciliation-required` beyond a set age | Threshold: any; age `[OWNER INPUT NEEDED]` | application database |

## 6. When an alert fires (template section 5)

| Field | Content |
|---|---|
| Severity | `[OWNER INPUT NEEDED: severity per monitor]` |
| Alerting channel and recipients | `[OWNER INPUT NEEDED: channel (email, chat, pager) and named recipient(s)]` |
| Automated action | None possible on the clearing contract (it has no pause or administrator). Application side: none planned without owner approval |
| Owner | `[OWNER INPUT NEEDED]` (the repository has one maintainer) |
| Status | Planned for all monitors (MVP-1.7) |
| Last review | none yet |

## 7. Runbook skeleton

1. Acknowledge the alert; record time and monitor ID.
2. Classify: chain-observable (sections 4 and 5) or operational.
3. For a chain alert: read the transaction by hash on RPC and Horizon; compare with the approved batch (`lib/stellar/compare.ts`); never resend a transaction whose outcome is unknown.
4. Stop owner-run execution if any mismatch exists.
5. For an authentication or abuse alert: review structured logs by request id; consider tightening the Host allow-list or rotating the proxy secret.
6. For a data alert: restore procedure is **not defined** and has not been tested. `[OWNER INPUT NEEDED: restore procedure once backups exist]`
7. Record the outcome, update [threat-model.md](threat-model.md), and report vulnerabilities per `SECURITY.md`.

## 8. Review checklist (template section 6)

Every threat covered; thresholds based on observed baselines (none exist yet; Testnet traffic is one owner-run session); addresses current; alert path tested end to end; date of last review. All unchecked today.
