# MVP-1 architecture (Phase 2B, C)

Written 2026-11-03. **The Mermaid diagrams below were written to standard syntax and were not rendered or validated by a Mermaid tool.** They show a proposed architecture. Legend, used in every diagram's accompanying table:

- **Implemented**: exists and is tested in the repository.
- **Proposed**: designed here, not built.
- **Unverified**: depends on evidence not yet obtained (mainly wallet entry signing).
- **Deferred**: out of MVP-1 (Discover, cross-session netting).

## 1. System context

```mermaid
flowchart LR
  U1[Organization A user] --> APP[Tobin console]
  U2[Organization B user] --> APP
  APP --> W[Wallet extension]
  APP --> API[Application server]
  API --> DB[(Application database)]
  APP --> RPC[Soroban RPC Testnet]
  API --> RPC
  RPC --> CH[Clearing and token contracts]
```

| Element | Status |
|---|---|
| Contracts | Implemented |
| Sandbox console, SDK, engine, digest | Implemented (local only) |
| Application server, database | Proposed |
| Network transport | Proposed (SDK refuses today) |
| Wallet entry signing | Unverified |

## 2. Components

```mermaid
flowchart TB
  subgraph Browser
    UI[React UI] --> CTRL[ConsoleController logic]
    CTRL --> SDK[tobin-mvp1-sdk]
    CTRL --> WAL[Wallet adapter]
  end
  subgraph Server
    AUTH[Auth service] --> DOM[Domain services]
    DOM --> REG[Registry and invitations]
    DOM --> IDX[Event indexer]
  end
  SDK --> TR[SorobanRpcTransport]
  TR --> RPC[Soroban RPC]
  REG --> DB[(Database)]
  IDX --> RPC
  UI --> AUTH
```

SDK, controller logic: Implemented. Transport, wallet adapter, server pieces: Proposed.

## 3. Authentication sequence

```mermaid
sequenceDiagram
  participant User
  participant App
  participant Server
  participant Wallet
  User->>App: Connect wallet
  App->>Server: Request challenge for address
  Server-->>App: Challenge with expiry
  App->>Wallet: Ask to sign challenge
  Wallet-->>App: Signature
  App->>Server: Address and signature
  Server-->>App: Short-lived session
```

Proposed. Signing form (message or never-submitted transaction) Unverified.

## 4. Onboarding sequence

```mermaid
sequenceDiagram
  participant User
  participant App
  participant Server
  User->>App: Sign in
  App->>Server: Create organization and membership
  User->>App: Link wallet
  App->>Server: Wallet and ownership verification
  Server-->>App: Organization ready
```

Proposed.

## 5. Wallet signing sequence (entries)

```mermaid
sequenceDiagram
  participant App
  participant RPC
  participant WalletA as Wallet of signer A
  participant WalletB as Wallet of signer B
  App->>RPC: Read current ledger
  App->>RPC: Simulate call
  RPC-->>App: Entries needing authorization
  App->>App: Check entries equal expected intent
  App->>WalletA: Sign entry A
  WalletA-->>App: Signature A
  App->>WalletB: Sign entry B
  WalletB-->>App: Signature B
  App->>RPC: Send assembled transaction
```

Unverified at the wallet steps. Expiration within 10 ledgers of the read ledger (policy).

## 6. Session creation

```mermaid
sequenceDiagram
  participant Creator
  participant App
  participant RPC
  participant Server
  Creator->>App: Create session with token
  App->>RPC: Submit create_session
  RPC-->>App: Confirmed
  App->>Server: Register session
```

## 7. Session joining

```mermaid
sequenceDiagram
  participant Creator
  participant Joiner
  participant App
  participant RPC
  Creator->>App: Invite organization
  Joiner->>App: Accept invitation
  App->>Joiner: Request entry for join_session
  App->>Creator: Request entry for join_session
  App->>RPC: Submit join_session with two entries
```

Needs two authorizations, creator and joiner. Unverified at signing.

## 8. Netting and settlement

```mermaid
sequenceDiagram
  participant Parties
  participant App
  participant Chain
  Parties->>Chain: submit_obligation by each debtor
  Parties->>Chain: finalize_obligations
  App->>App: Compute nets and default proposal
  Parties->>Chain: propose then approve by all
  Parties->>Chain: settle with one entry per debtor
  Chain-->>Parties: SETTLED
```

States: Open, Committed, Approved, Settled. Contract logic Implemented; browser signing Unverified.

## 9. Backend to Stellar

```mermaid
flowchart LR
  IDX[Indexer] -->|getEvents| RPC[Soroban RPC]
  REG[Registry] -->|getLedgerEntries read state| RPC
  IDX --> DB[(Database)]
  REG --> DB
```

The server reads only. It never sends transactions. Proposed.

## 10. Data ownership and trust boundaries

```mermaid
flowchart TB
  subgraph Authority[Authoritative]
    C[Contracts and ledger]
  end
  subgraph Application[Application managed]
    P[Profiles, invitations, roles, labels]
  end
  subgraph Derived[Derived caches]
    S[Session list, activity history]
  end
  C --> S
  P --> S
```

Conflicts resolve to the contracts.

## Minimum end-to-end journey

Two independent organizations authenticate; each is represented; one creates a session; the other joins; obligations are submitted; the session is finalized; netting is proposed and approved; settlement completes; both can inspect session and activity history. No marketplace, no cross-session netting. See [phase-2b-implementation-plan.md](phase-2b-implementation-plan.md).
