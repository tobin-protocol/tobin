# Phase 2C setup and approved decisions

Written 2026-11-03. Records the owner's decisions D1 to D4 and the state they leave. Distinguishes **approved** (stated by the owner) from **recommended** (proposed in these documents).

## Approved decisions

| ID | Decision | Implication |
|---|---|---|
| D1 | Controlled Testnet wallet validation authorized: real signatures with disposable accounts; transactions specifically in T4 to T9 and T13; wallet interactions in T3, T10, T11, T12, T14 | The owner operates Freighter and approves every prompt personally. Claude does not automate or approve anything. No other transaction (funding, minting, cleanup) is authorized |
| D2 | Wallet-based authentication direction | Authentication stays separate from entry signing, envelope signing and submission. A sign-in signature never authorizes a contract operation. The exact method (message signing or a never-submitted transaction challenge) is **not** decided and depends on Freighter evidence |
| D3 | Next.js backend architecture | Server manages users, organizations, memberships, invitations, registry, activity, reconciliation. It never holds keys, signs, submits for users, or overrides chain state |
| D4 | **Separate** Vercel project at `app.tobinprotocol.xyz`; landing project unchanged | Supersedes the earlier same-project decision and the S1/S2 question (H1 is closed in favour of a separate project). See [hosting-and-domain-architecture.md](hosting-and-domain-architecture.md). Nothing created yet |

## Final architecture direction

Browser app builds calls with the SDK, shows a decoded intent, requests signatures from the wallet and submits through a Soroban RPC transport; the server stores application data only; the contracts are authoritative; the registry reconciles against chain state and may have history gaps ([technical-decision-closure.md](technical-decision-closure.md)). Diagrams: [mvp-1-architecture-final.md](mvp-1-architecture-final.md).

## Still recommended only (not approved)

Database provider (Neon-class Postgres via Vercel; unchecked pricing and residency); retention periods; shared design-token package; adding `@stellar/stellar-sdk` 17.4.0; Freighter as the only supported wallet; the 10-ledger policy stays unchanged.

## Outstanding technical details needing evidence

What Freighter's `signAuthEntry` takes and returns for a real Soroban entry (T3); whether `signMessage` is usable for sign-in; Freighter's display of entries; round-trip timing against 10 ledgers (T9); settlement token balances for T6/T7; the Vercel monorepo settings in section 6 of the hosting document.

## Evidence note

The earlier recorded evidence (24 Rust tests, documented in [non-signing-validation.md](non-signing-validation.md): 4 + 1 + 19) was re-read and is internally consistent; it was not re-run. The skipped TypeScript tests (3) and the absent vector test remain open.
