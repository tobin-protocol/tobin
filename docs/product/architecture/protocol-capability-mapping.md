# Protocol and implementation capability mapping

The foundation of the package. Every capability claim in the other documents must agree with this one. Sources are named so each row can be re-checked. Contract facts come from `contracts/clearing/src/lib.rs` (TobinClearingV1) and `contracts/token/src/lib.rs` (TobinTestToken); the SDK from `packages/mvp1-sdk/src/`; the Console from `apps/web-console/`. The deployed Testnet instances were confirmed against the same Wasm hashes (see `contracts/deployments/testnet.json`).

## 1. What the contracts support

### Clearing contract (TobinClearingV1), 18 functions (`CLEARING_FUNCTIONS` in `packages/mvp1-sdk/src/sdk/abi.ts`)

| Capability | Contract function | Authorization on-chain | Status |
|---|---|---|---|
| Create a session with one token and capacities | `create_session(creator, session_id, token, max_participants, max_obligations)` | creator | IMPLEMENTED |
| Admit a participant | `join_session(session_id, participant)` | joiner **and** creator, as two separate `require_auth` | IMPLEMENTED |
| Record an obligation | `submit_obligation(session_id, obligation{id, debtor, creditor, amount})` | the debtor only; both parties must already be admitted; Open state only | IMPLEMENTED |
| Freeze participants, token and obligations | `finalize_obligations(session_id, caller)` | any admitted participant; needs at least 2 participants and 1 obligation | IMPLEMENTED |
| Propose or replace a settlement plan | `propose_settlement(session_id, proposer, instructions)` | any admitted participant; plan validated by the contract; a replacement clears all approvals | IMPLEMENTED |
| Approve the current proposal | `approve_settlement(session_id, participant, digest)` | the participant; must name the current digest; every admitted participant must approve | IMPLEMENTED |
| Execute settlement | `settle(session_id, digest)` | any caller submits; each debtor must authorize its own transfers | IMPLEMENTED |
| Read state | `get_session`, `get_obligations`, `get_obligation`, `get_commitment`, `get_proposal`, `get_settlement`, `get_approvals`, `get_approval`, `commitment_bytes`, `proposal_bytes`, `config` | none | IMPLEMENTED |

Lifecycle (`State` enum): `Open`, `Committed`, `Approved`, `Settled` and nothing else. A proposal is data inside Committed or Approved, not a state.

Limits (compile-time constants, provisional engineering targets): **4 participants, 16 obligations, 16 settlement instructions** per session; one token per session, fixed at creation.

Error table: 27 stable codes (for example `WrongState`, `NotParticipant`, `DigestMismatch`, `AlreadySettled`), surfaced by the SDK as typed errors (`packages/mvp1-sdk/src/sdk/errors.ts`).

Events (usable for an indexer): `SessionCreated`, `ParticipantJoined`, `ObligationSubmitted`, `ObligationsFinalized`, `SettlementProposed`, `Approved`, `SessionApproved`, `Settled`.

### What the clearing contract does NOT support (verified absent)

| Product idea | Finding |
|---|---|
| Edit or remove an obligation | NOT IMPLEMENTED. Obligations can only be added; a duplicate id is rejected |
| Cancel, close, abort, expire or time out a session | NOT IMPLEMENTED by design ("no timeout, no abort, no default, no recovery"; a session may stall forever) |
| Remove or leave a session as a participant | NOT IMPLEMENTED. Admission is permanent |
| Administrator, override or upgrade | NOT IMPLEMENTED by design; the contract is immutable |
| List or search sessions or obligations on-chain | NOT IMPLEMENTED. Reads are by exact session id only; there is no enumeration function |
| Per-obligation asset, due date, description, terms or counterparty metadata | NOT IMPLEMENTED. An obligation is only `{id, debtor, creditor, amount}` in the session's single token |
| Netting across sessions | NOT IMPLEMENTED. Netting happens inside one session only |
| Privacy of data | NOT IMPLEMENTED. All session data is public on the ledger |
| Public versus private sessions, invitation or approval workflow | NOT IMPLEMENTED on-chain. Admission is the two-party `join_session`; any invitation workflow is off-chain |
| Multiple assets in one session, or amounts with fractional units | NOT IMPLEMENTED. Amounts are positive integers in the token's base units |

### Token contract (TobinTestToken)

`mint(to, amount)` (minter only), `transfer(from, to, amount)` (sender authorizes), `balance`, `total_supply`, `cap`, `minter`, `decimals`, `name`, `symbol`. No burn, no allowance. A fixed minter and a fixed supply cap. IMPLEMENTED. The governed Testnet token's minter is the administrative multisig (`docs/governance/governed-token-evidence.md`); the legacy token's minter is the legacy deployer.

## 2. What the SDK and Console already do

| Capability | Evidence | Status |
|---|---|---|
| Typed client over the real ABI; prepared calls that state which accounts must authorize what | `sdk/client.ts` (`TobinClient`), `sdk/prepare.ts`, `sdk/abi.ts` | IMPLEMENTED |
| Deterministic netting engine: nets (`outgoing minus incoming`), a default proposal, an advisory validator that mirrors the contract | `engine/net.ts`, `engine/propose.ts`, `engine/validate.ts` | IMPLEMENTED (convenience only; the contract is authoritative and accepts any valid plan) |
| Digest computation matching the contract (version 2) | `digest.ts`, `DB-09-DIGEST-REVIEW.md` | IMPLEMENTED (same-author agreement only) |
| Session status view model (state, nets, approvals, missing approvals, debtor authorizations, advice, next steps) | `SessionStatus` and `getSessionStatus` in `sdk/client.ts` | IMPLEMENTED |
| Typed error explanations | `sdk/errors.ts` | IMPLEMENTED |
| Settlement intent that a signer can check (anti blind-signing) | `sdk/intent.ts`; Rust signer under `contracts/clearing/signer/` | PARTIALLY IMPLEMENTED (offline; no wallet) |
| Local sandbox transport: real contracts in the Soroban test host through a Rust bridge | `local/bridge.ts`, `contracts/clearing/examples/bridge.rs` | IMPLEMENTED (local only) |
| **Network transport** (simulate, collect signatures, assemble, submit, confirm) | `sdk/transport.ts`: `NetworkTransportNotAuthorized` is a placeholder that refuses | **NOT IMPLEMENTED** |
| Wallet integration for authorization entries | none in the SDK or Console | NOT IMPLEMENTED; see section 4 |
| Console: sandbox UI for create, join, submit obligations, finalize, propose, approve, settle, mint; balances; activity log | `apps/web-console/lib/console/controller.ts`, `view.ts`, `components/console-app.tsx` | PARTIALLY IMPLEMENTED (single page, local sandbox, simulated authorizations, in-memory) |
| Accounts are fixed demo "personas"; no users, organizations, sign-in, teams, profiles, directory, notifications, persistence | grep of `apps/web-console` and `packages/mvp1-sdk/src` finds none | NOT IMPLEMENTED |
| API surface | two local endpoints, `/api/bootstrap` and `/api/rpc`, bound to 127.0.0.1 and the sandbox bridge (`lib/server/api.ts`) | PARTIALLY IMPLEMENTED (not a product API) |

## 3. Dependency map: what each product need requires

| Product need | Needs contract change? | Needs SDK change? | Needs application or backend work? | Possible without protocol change? |
|---|---|---|---|---|
| Wallet sign-in, organization profile, team, notifications | no | no | **yes** (identity, storage, services) | yes |
| Create a session, add obligations, finalize, propose, approve, settle on Testnet | no | **yes** (network transport, wallet signing) | yes | yes |
| Invitations to join a session | no | no | **yes** (off-chain invitation and request records, plus a way to collect the joiner's and the creator's authorization) | yes |
| Listing my sessions and obligations | no | possibly | **yes** (an indexer over contract events, or an app-side registry of session ids) | yes, but needs infrastructure; event retention on the RPC is **UNVERIFIED** |
| Discovering other organizations' sessions | no | no | **yes** (public registry or indexer) | yes, but all data is already public on-chain |
| Cancelling or closing a session, withdrawing an obligation, leaving a session | **yes** | yes | yes | **no** |
| Obligation metadata (terms, due date, description, asset per obligation) | **yes** for on-chain metadata | yes | yes | partly: off-chain metadata bound to the obligation id is possible but is not enforced by the contract |
| Private sessions | **yes**, or a different protocol | yes | yes | **no** |
| Multi-session or multilateral netting across organizations | **yes** (a different session model) | yes | yes | **no**; only by an off-chain process that proposes a new session |
| Organization-level contract authority, admin override | not wanted (the protocol is deliberately admin-free) | no | no | not applicable |

## 4. Authorization reality, and the largest open technical risk

- Two of the contract's authorizations are **not the transaction source**: the second signer of `join_session`, and every debtor in `settle`. They are Soroban authorization entries that each signer must sign.
- The repository proves entry signing only with its own **local signer** (`contracts/clearing/signer/`, `examples/authsign.rs`): in the Soroban test host, and in the local-network run described in `docs/reports/MVP-1-MILESTONE-8-STAGE-B-REPORT.md`. A public-testnet run is described as author-reported with its evidence unpublished (root `README.md`). It does **not** integrate a browser wallet.
- In this engagement, wallet signing was demonstrated for **transaction envelopes** with Freighter and the CLI (source-account authorization). Signing **authorization entries** for other accounts through a wallet is **UNVERIFIED**. The product depends on it for joins and settlement, so it is the first thing to prove in the build phase.
- A session therefore needs a **signature-collection step** between parties that are different organizations. That coordination service does not exist (NOT IMPLEMENTED).

## 5. Constraints the UX must respect

1. A session is the unit of work and holds at most 4 participants and 16 obligations. The product must say so before a user starts, not after a rejection.
2. One token per session; amounts are integers in base units; display formatting uses the token's decimals.
3. Nothing is private on the ledger. The application can hide data in its own views, but it cannot make a session confidential.
4. A session never completes on its own; the UI must show who must act next and must never imply a timeout or automatic completion.
5. "Settled" is shown only when the contract reports state Settled (the current Console already enforces this wording; see `console-view.test.ts`).
6. Obligations are permanent once submitted. The create flow needs a review step because there is no undo.
