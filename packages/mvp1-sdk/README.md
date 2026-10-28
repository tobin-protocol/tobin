# Tobin MVP-1 TypeScript: netting engine, digest, SDK and the local-sandbox Console

Experimental. **This package is local-only.** Nothing here uses a wallet, signs anything, opens a network connection to Stellar, deploys, or treats any call as confirmed
on a ledger: it contains no wallet or network transport, and wallet work has not been authorized. The network runs described in `../../docs/reports/` and the top-level README used separate tooling outside this package. The code talks to the **real**
`TobinClearingV1` and `TobinTestToken` only through the Rust development bridge, which runs them in the Soroban test host.

No new dependencies: Node 24 runs the TypeScript directly (type stripping) and `node:test` runs the tests; `tsc` (TypeScript 5.9.3, installed locally with `npm ci`)
is used for type-checking and to compile the browser bundle. The Console is plain
TypeScript and DOM, not React/Next: it is a separate workspace package (`packages/mvp1-sdk/`), independent of any web framework and of the landing page.

## Layout

| Path | Content |
|---|---|
| `src/amount.ts`, `strkey.ts`, `address.ts`, `sha256.ts` | integer-safe amounts (`bigint`, checked i128), strkey G/C decoding, address XDR bytes and ordering, a synchronous SHA-256 |
| `src/engine/` | `computeNets`, `defaultProposal` (deterministic), `validatePlan` (advisory, mirrors the contract's rules and error names) |
| `src/digest.ts` | the MVP-1 canonical bytes and digests, **working version 2** (obligation commitment and proposal digest; the proposal digest binds the revision) |
| `src/sdk/` | `abi.ts` (the real function list and record types), `errors.ts`, `prepare.ts` (calls plus their authorization requirements), `transport.ts`, `client.ts` (`TobinClient`) |
| `src/local/bridge.ts` | Node-only local sandbox transport and `startSandbox` |
| `../../apps/web-console/` | the local Console (a Next.js app) and its tests; it imports this package as `tobin-mvp1-sdk` (see the `exports` map in `package.json`) |
| `test/` | 64 tests in this package. With the local Rust bridge built and `TOBIN_BRIDGE_EXE` set: 63 pass, 0 fail, 1 skipped on purpose (the known-answer intent test, because its attribution-sensitive fixtures are excluded pending review). Without the bridge: 55 pass, 9 skipped. The Console package has 38 tests (30 pass without the bridge); `npm test` at the repository root runs both: 102 tests, 101 pass, 1 skipped with the bridge. `test/fixtures/` holds digest fixtures produced by the Rust contract and the script that regenerates them |
| `../../contracts/clearing/examples/bridge.rs` | the Rust development bridge (dev-only example; not a contract) |

## Commands

```
# 1. build the Rust bridge (offline); set a target dir with room
cd ../../contracts && CARGO_NET_OFFLINE=true cargo build --offline -p tobin-clearing-v1 --example bridge
export TOBIN_BRIDGE_EXE=<target dir>/debug/examples/bridge.exe

# 2. install (once) and check, from the repository root
npm ci                                     # installs the pinned TypeScript and @types/node for all workspaces
npm run typecheck
npm test                                   # both workspaces; bridge tests are SKIPPED, visibly, when TOBIN_BRIDGE_EXE is unset
cd packages/mvp1-sdk && npm test           # only this package (independent of any web framework)

# 3. the Console (local sandbox only), from the repository root
npm run build:console                      # next build
npm run start --workspace tobin-web-console    # http://127.0.0.1:8787/  (binds to localhost only)

# regenerate the digest fixtures from the real contract (in packages/mvp1-sdk)
node test/fixtures/generate.ts
```

## What each part does and does not claim

**Engine.** `net = outgoing - incoming`, positive = debtor. The default proposal is deterministic: debtors and creditors by amount descending, ties by
address XDR bytes ascending, greedy pairing, output sorted ascending by (payer, payee) as the contract requires. It is a convenience: the contract
accepts any valid plan, and neither the engine nor the Console claims the default is the only valid one. All-zero nets give the empty proposal.
Amounts are `bigint`; `number` is rejected; every sum is checked against the i128 range.

**Digest.** A TypeScript encoding of exactly what `contracts/clearing/src/lib.rs` computes. **The exact bytes are the working MVP-1 format (version 2) approved by the founder as such (DB-09, see `DB-09-DIGEST-REVIEW.md`);
that is a design decision, not independent cryptographic review.** It shares nothing with the provisional v0.2 `commitment_digest`.
Evidence: 7 fixtures whose bytes and hashes were produced by the Rust contract are reproduced exactly from the logical inputs in TypeScript
(Rust to TypeScript); live, TypeScript-computed digests were equal to the ones the contract returned for 40 random sessions and to the contract's bytes
(TypeScript to Rust); both directions cover classic-account, contract and mixed participants. **Both implementations were written by the same
author, so this is cross-language agreement, not independent third-party verification.**

**SDK.** Typed over the real ABI; a test compares the SDK's function list and error tables mechanically with the Rust source. Every state-changing
call is a `PreparedCall` that states, as data, exactly what each signer must authorize (a join needs the joiner and the creator; an obligation the
debtor; settlement one authorization per debtor with its own total and transfers; none for an empty plan). The contract stays authoritative: the SDK
never assumes a generated proposal is valid. **Signing boundary:** how an authorization is produced (a wallet signature over an authorization
entry) is the transport's business and is not implemented; `NetworkTransportNotAuthorized` makes the gap explicit and refuses.

**Console.** Create (with a selected token), join (joiner and creator authorizations), obligations, finalize, default or hand-written proposal with an
advisory check and the digest it would have, replacement (with the number of approvals it will invalidate and a notice afterwards), approvals of the
exact current digest, missing approvals, required debtor authorizations, settlement, all-zero sessions, an activity log with typed rejections.
Every page carries a banner saying it is a LOCAL SANDBOX with simulated authorizations; "settled" is shown only when the contract reports Settled, and
then only as "in the local sandbox, not a network transaction"; a stalled session is described as not completing by itself.

## Evidence (all local)

* `primitives`, `engine`, `digest`, `sdk-unit` (and `console-view` in the Console package): pure tests (amounts, strkeys, SHA-256 against `node:crypto`, 2000 random sessions
  checked for conservation, per-participant limits, order and determinism, single-field mutants, the byte layout and its sensitivity, the real ABI,
  the honesty rules of the renderer).
* `interop`, `sdk` (and `console`, `console-server` in the Console package): the real contract through the bridge, with explicit authorization trees enforced by the contract:
  every authorization requirement is shown to be necessary (withholding any one signer is rejected as an authorization error) and sufficient;
  engine plans are accepted; 184 single-field mutants are rejected with the error name the advisory validator predicted; replacement invalidates
  approvals; all participants must approve; every debtor must authorize; the all-zero path; token failures revert the whole settlement.

## Not demonstrated, not claimed

A browser other than headless Chrome (the page was exercised in one headless Chrome at two widths: see the offline acceptance report, gates 9 to 11); any wallet behavior, and any signature, transaction envelope, simulation, fee or network behavior by this package's own tests (the separate local-network and testnet runs are in `../../docs/reports/`);
resource figures other than host-test estimates; third-party digest verification; accessibility and visual review of the page.
