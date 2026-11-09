# Security model (Phase 2B, C2)

Written 2026-11-03. Design-level analysis, not an audit and not a penetration test. Testnet only. Labels as in [wallet-compatibility.md](wallet-compatibility.md).

## Trust boundaries

1. **User and wallet** hold keys. Tobin never receives them.
2. **Browser application** builds calls and shows what is about to be signed. It is untrusted by the contract.
3. **Application server** holds profiles, invitations, registry. It has **no keys, no signing role and no authority**; compromising it must not move funds or change contract state.
4. **Soroban RPC** is a convenience service; its answers (current ledger, simulation) are inputs to be checked, not authority.
5. **Contracts** are the authority: `contracts/clearing/src/lib.rs` validates every plan, approval and settlement; settlement submission carries no authority (Confirmed in source).

## Threats and mitigations

| Threat | Mitigation | Status |
|---|---|---|
| Blind signing: the wallet shows an opaque hash and the user signs something else | The application must show the decoded intent (function, session, digest, own total, each transfer) before requesting a signature, and the SDK refuses to sign unless the entry equals the expected intent (`packages/mvp1-sdk/src/sdk/intent.ts`; signer intent check in `contracts/clearing/signer/mod.rs`). What Freighter itself displays is Unverified (T14) | Partially implemented offline; browser flow Proposed |
| Malicious or compromised server alters an entry | Entries are built and checked client-side from chain state; the signed intent is recomputed against the debtor's own record (Confirmed in source for the SDK intent builder) | Proposed for the browser |
| Replay of a signed entry | Nonce and expiration ledger bound into the entry; fresh authorization after any failed settlement; SDK `ReauthorizationRequired` (Confirmed in source). Failed transactions roll the nonce back, so a signed entry stays reusable until expiry (founder record EQ-20, Verified experimentally locally) | Implemented offline; policy window 10 ledgers (policy, see B4) |
| Stale approval replay | Revision bound into the proposal digest (digest version 2) | Implemented, same-author evidence |
| Session hijack of the application account | Wallet-signature sign-in, short-lived server session, per-request origin checks; roles gate only application data | Proposed |
| Wrong account or wrong network in the wallet | Check the connected address against the required signer and the network passphrase before requesting any signature (T11, T12) | Proposed |
| Phishing of the Tobin domain | Persistent Testnet notice, domain pinning, no request ever to paste a secret | Proposed |
| Registry disagrees with the chain | Chain wins; reconcile on every read of a session | Proposed |
| Stalled session | The protocol has no timeout, abort or recovery (DB-06); the product states this plainly and offers no override | Confirmed, accepted by the founder |
| Leakage of obligation data from the database | Minimise stored fields, access scoped to participants of a session; retention decision open | Open (D-B8) |
| Supply chain (new wallet and SDK dependencies) | Pin exact versions, review before adding; none was added in Phase 2B | Proposed |
| Unaudited custom signer reused in production | The local signer is a development tool; browser signing goes through a wallet | Policy |

## Explicit non-claims

No audit, no wallet compatibility, no conformance to the v0.2 protocol, no production readiness. Same-author evidence throughout.
