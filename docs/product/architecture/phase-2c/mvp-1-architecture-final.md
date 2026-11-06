# MVP-1 architecture, revised (Phase 2C)

Written 2026-11-03. Supersedes the diagrams of `docs/product/architecture/phase-2b/mvp-1-architecture.md` where they differ (the Phase 2B file is kept; that earlier-phase document is intentionally not part of the pull request that introduced this file, so it is cited as text, not as a link). Mermaid diagrams were **structurally checked by reading only; they were not rendered** (no renderer is available in this environment). Status: Proposed unless stated.

## Changes from Phase 2B

1. Hosting: a separate Vercel project for the application on `app.tobinprotocol.xyz`; landing stays in its own project (owner decision D4).
2. Wallet entry signing remains **Unverified**; the signing path is gated on T3 to T7.
3. Authentication separated from entry signing and envelope signing.
4. Registry recovery limits stated (history can be incomplete).

## Context and hosting

```mermaid
flowchart LR
  Apex[tobinprotocol.xyz landing] --> LP[Landing Vercel project]
  App[app.tobinprotocol.xyz application] --> V[Application Vercel project]
  V --> Proxy[Host allow-list proxy]
  Proxy --> AppRoutes[Application routes]
  AppRoutes --> DB[(Postgres)]
  AppRoutes --> RPC[Soroban RPC Testnet]
  Browser[User browser] --> App
  Browser --> Wallet[Wallet extension]
```

## Responsibilities

| Component | Responsibility | Must not |
|---|---|---|
| Browser app | Build calls with the SDK, show decoded intent, request signatures, submit through the transport | Trust server-supplied entries without recomputing intent |
| Wallet | Holds keys, signs entries/envelopes/challenges | n/a |
| Application server | Profiles, organizations, memberships, invitations, registry, activity, reconciliation | Hold keys, sign, submit for users, override chain state |
| Indexer | Reads events and state, records the last ledger | Treat events as sole truth |
| Contracts | Authority on session state | n/a |

## Distinct stages of one action

```mermaid
sequenceDiagram
  participant U as User
  participant A as App
  participant W as Wallet
  participant R as RPC
  U->>A: Initiate action
  A->>R: Read ledger and state
  A->>A: Build intent and entries, verify
  A->>U: Show decoded summary
  A->>W: Entry signing request
  W-->>A: Signature
  A->>A: Verify signature against preimage
  A->>W: Envelope signing request
  W-->>A: Signed envelope
  A->>R: Submit
  R-->>A: Pending then confirmed or failed
```

Authentication (sign-in) is a separate earlier flow and is never reused as authorization.

## Trust boundaries

```mermaid
flowchart TB
  subgraph Untrusted
    Br[Browser code]
    Srv[Application server]
  end
  subgraph User control
    Wl[Wallet and keys]
  end
  subgraph Authority
    Ch[Contracts and ledger]
  end
  Br --> Wl
  Br --> Ch
  Srv --> Br
  Ch -. resolves conflicts .-> Srv
```

Data flows: the server never sits between the wallet and the chain. Chain reads and submissions go from the browser; the indexer reads independently.
