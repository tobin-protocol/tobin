# MVP-1.5 architecture

Scope of what exists in this build versus what is designed but blocked. **Update 2026-11-07: the owner-run Testnet path (lib/stellar/run.ts, /settle-run, /cosign-check) constructs, simulates and, only after a signed transaction and the owner's typed confirmation, submits and reads back Stellar Testnet transactions; the application never holds a key. The sentences below describe the earlier state and are kept as history.** Earlier text: nothing in this build constructs, signs, submits or confirms a Stellar transaction.

## Stages (never collapsed into one "settled")
1 clearing calculation; 2 institutional calculation approval; 3 settlement preparation; 4 institutional batch approval; 5 wallet or signer authorization; 6 transaction construction; 7 signing; 8 submission; 9 inclusion and execution; 10 independent on-chain verification; 11 reconciliation to the approved batch.
Implemented and tested: 1 to 4 (MVP-1.2 to 1.4), the preconditions for 5 (verified accounts), the **state machine** for 5 to 11, and the **reconciliation rule** for 10 and 11 against mock observations. Not implemented: wallet connectivity, 6 to 10 against a real network.

## Layers
- Application (implemented): obligations, calculation, approval, batch, review, closure, activity.
- Account proof (implemented): `wallet-proof.ts` (challenge, ed25519 verification), tables `wallet_challenges`, `wallet_verifications`.
- Execution record (implemented, preconditions only): `settlement_executions` (one per approved batch, snapshot of verified accounts) and append-only `settlement_execution_events`. State = last event. Created by `POST .../execution/start`; changed only by the guarded server method `advanceSettlementExecution`, which has **no HTTP route**, so a browser cannot set a state. Future signer, submitter and verifier services would call it.
- Chain (blocked): construction, simulation, wallet signing, submission, polling, verification. `ChainReader` is declared as an interface only.

## State machine (`settlement-state.ts`)
`awaiting-signer -> signing -> signed -> submission-pending -> submitted -> confirmed -> reconciled`. Branches: `signing -> awaiting-signer` (rejected or abandoned signature: never marked signed); `signing -> failed`; `signed -> expired`; `submission-pending | submitted -> failed | expired | unknown-outcome`; `unknown-outcome -> confirmed | failed | expired | unknown-outcome` only (no path back to submission: a retry after an unknown result risks a duplicate payment, so the network must answer first); `confirmed -> reconciled | reconciliation-required`; `reconciliation-required -> reconciled`. `reconciled`, `failed`, `expired` are terminal. Requesting the current state again is idempotent. Retry after `failed` or `expired` is **not designed yet**: it needs an execution-attempt concept (deferred, like batch attempts).

## Verification rule (`verifyChainOutcome`)
`NOT_FOUND` and `UNAVAILABLE` give `unknown-outcome` (never failed, never confirmed); `PENDING` stays pending; `FAILED` is failed; `SUCCESS` is reconciled only if the network matches and the multiset of transfers (from, to, asset, amount) equals the approved batch exactly; any extra, missing, altered, duplicated or other-network transfer is `reconciliation-required`. The function is pure; no reader feeds it yet.

## Mapping an application batch to the deployed contract (decision required, not taken)
The contract settles an on-chain session. Per session: the creator authorizes `create_session` (token contract fixed at creation); creator and joiner authorize each `join_session`; each debtor authorizes its own `submit_obligation`; any participant `finalize_obligations`; any participant `propose_settlement` (any valid plan); every participant `approve_settlement` for the current digest; each debtor authorizes `settle` and its token transfers. The application batch therefore maps to: the on-chain proposal (its instructions are the plan, checkable against the contract's own validation), and the approved calculation's obligations map to on-chain obligations. Open owner decisions: which participant creates the session; whether application obligations are replayed 1:1 as on-chain obligations; who signs for an institution (one wallet per participant); what happens when the on-chain proposal differs from the batch (the application batch must be re-approved). Until decided, building transaction construction would invent policy.

## Network configuration
`contracts/deployments/testnet.json` records the Testnet RPC, passphrase and contract ids (public identifiers only). Asset identities carry their network, and an execution is bound to one network: a batch on `testnet` cannot start with accounts verified on `public`. Mainnet is not enabled by anything in this build. Secrets stay out of source control; none is stored.

## What was verified about signing compatibility
Nothing new on a real network. The prior finding stands: protocol-30 simulation returns `AddressV2` credentials; the Rust signer refuses them (by policy it is unchanged); the SDK's `authorizeEntry` handles V2; Freighter's behaviour is NOT TESTED. This build does not touch any of that.

## Update: the Stellar adapter, attempts and wallet layer (this execution)
Code under `apps/web-console/lib/stellar/`:
- `execution-plan.ts`: SettlementBatch -> ExecutionPlan. Pure. Reuses the SDK's prepared calls and authorization requirements (create, join, submit obligation, finalize, propose, approve, settle). The initiator creates the session; the plan states every signer; the proposal is the approved batch re-ordered only into the contract's (payer, payee) order; participants are verified accounts; the on-chain session id is a hash of the batch id; limits are the deployed ceilings (4 participants, 16 obligations, 16 instructions); only Testnet and only a Soroban token contract asset are accepted.
- `compare.ts`: independent comparison of the on-chain state with the plan (participants, obligations, commitment, nets recomputed from what is on chain, proposal order, digest, revision, approvals, settlement). Any difference means stop.
- `rpc.ts`: official SDK 17.4.0 encoding, UNSIGNED transaction construction with real sequence numbers, simulation, the chain reader, transaction read by hash (NOT_FOUND and UNAVAILABLE mean unknown), submission (sent exactly once; hash computed before sending; timeout means unknown) and polling of the original hash.
- `retry-policy.ts` and the attempt methods in `service.ts`: immutable attempts (migration 6), append-only attempt events, one transaction hash per attempt step enforced by the schema, retry rules (user rejection returns to awaiting-signer; expiry allows a new attempt after revalidation; a failure needs an explicit review; an unknown outcome blocks everything until the network is read; a confirmed settlement is never retried), evidence-gated transitions (confirmed requires an independent network read of a recorded hash reporting SUCCESS; reconciled requires a matching comparison). The state of an attempt can be changed only by a server method with no HTTP route.
- `freighter.ts`: wallet state without prompting, connect, and signing whose answer is VERIFIED (same transaction hash, valid signature by the expected key, expected signer, expected network) before use.
- `owner-validation.ts`, `/api/stellar/validation`, `/wallet-check`: the owner-run Edge validation.

## Batch-to-contract mapping decision (taken; owner may change it)
Initiator creates the session and authorizes memberships only. Each participant signs for themselves. Obligations map one-to-one (same 32-byte id, debtor, creditor, amount). The on-chain proposal must equal the approved batch exactly; any difference stops the execution and requires an authorized resolution. These follow the brief's initial policy; the contract needed no change.
