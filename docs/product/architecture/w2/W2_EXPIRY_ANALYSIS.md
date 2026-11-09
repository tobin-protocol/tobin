# W2 expiry analysis (interim)

Written 2026-11-06. No on-chain expiry measurement exists yet. Labels: VERIFIED (source or real read), SIMULATED, UNVERIFIED.

## Four different things
| Mechanism | Who sets and enforces it | Value in W2 |
|---|---|---|
| Transaction time bounds | the envelope; enforced by the network | `maxTime` = prepare time + 300 s |
| Soroban authorization-entry expiration (`signatureExpirationLedger`) | set by whoever signs; part of the signed preimage; enforced by the host at apply time against the inclusion ledger | assigned by the helper at signing |
| Tobin signer-tooling policy | `contracts/clearing/signer/mod.rs` (Rust) and the helper's `checkExpiry`: `current < expiration <= current + 10` | 10 ledgers; unchanged |
| Contract-level requirement | `require_auth` only demands a valid authorization; the contract has no expiry rule | none |

The 10-ledger cap is **not** a Stellar or contract rule. The network's own maximum entry lifetime was not measured (UNVERIFIED).

## Verified facts so far
- Assignment point: expiration is chosen when the entry is signed; it is inside the signed preimage, so it cannot be changed afterwards without invalidating the signature (SDK `authorizeEntry` takes `validUntilLedgerSeq` as input; VERIFIED in the type documentation).
- Shared or separate: each entry carries its own nonce and expiration (VERIFIED in the entry structure). Two signers therefore do not share an expiry; the first signer's entry expires first. Observed shape: simulation returns expiration 0 for every entry.
- Rust signer: policy boundaries tested by the existing suite, 19 tests passed on 2026-11-06 (current+1 and current+10 accepted; current, current-1, current+11, 0, `u32::MAX`, missing ledger refused; a refused expiry produces no output and leaves the envelope byte-identical). That is a **signer-tooling** rejection, not an on-chain one.
- Helper rule is the same function (SIMULATED unit test).
- A simulated enforcing simulation with an entry already past its expiration is refused by the helper before any signing of the envelope.

## Questions and current answers
| Question | Answer now |
|---|---|
| Is expiry shared across stages? | No: per entry (VERIFIED structurally) |
| Can each participant authorize the same logical operation? | By design yes (two entries, same tree); real wallets NOT RUN |
| What if authorization is delayed? | The entry expires when the network ledger passes its expiration; UNVERIFIED on-chain; the helper refuses to finalize with an expired entry |
| What if authorization is rejected? | Wallet error to `AUTHORIZATION_REJECTED`; no state change (SIMULATED) |
| What if the transaction expires? | Time bounds or entry expiry: reconstruct and re-simulate; fresh nonces (expected; to measure) |
| Do collected authorizations survive reconstruction? | Expected no: nonce, expiration and tree are in the preimage, and re-simulation returns new nonces. A signed entry is bound to its own expiration; reusing it with a different expiration invalidates it (SDK documentation). Not yet measured |
| Is 10 ledgers enough? | UNVERIFIED. Ledger close time not yet measured (assumed about 5 s, so about 50 s). The work between the first signature and submission includes a second wallet prompt, an enforcing simulation, an envelope prompt and submission; a human doing this across profiles may exceed it. This is the main W3 risk and will be measured, not assumed |

## T-3 and T-4 plan (nothing submitted)
- T-3: local only. The signer refuses any expiration outside the window; recorded as a tooling rejection. No expired transaction is submitted without a separate decision.
- T-4: during T-2, the helper records preparation ledger, per-entry assigned/signed ledger and milliseconds, expiration, finalize ledger and result. A deliberately delayed second signer is an additional experiment only if you approve it separately.

## T-5 analysis (no submission)
Replaying the unchanged T-2 envelope: same hash; its source sequence number was consumed, so a node would reject it as a bad sequence (or report a duplicate if still pending), and the authorization nonces would also be refused by the host (a used nonce cannot be reused). These are expectations (UNVERIFIED). Non-submitting check proposed in the execution record: re-simulate the signed envelope after T-2 and record the error.
