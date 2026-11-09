# W2 authorization flow

Design under test (helper, not product). SDK `prepare` and `intent` are reused unchanged; the helper adds only what `Transport.invoke` lacks.

```mermaid
sequenceDiagram
  participant H as Helper (127.0.0.1)
  participant R as Testnet RPC (allow-listed proxy)
  participant FA as Freighter profile A
  participant FB as Freighter profile B
  participant FE as Freighter profile E (source)
  FE->>H: Prepare (op = join_B)
  H->>H: SDK prepareJoin + intentFromRequirements
  H->>R: simulateTransaction (source E, unsigned)
  R-->>H: entries (B, A), AddressV2, expiration 0
  H->>H: entry check against intent (refuse on any mismatch)
  H->>H: relay stores unsigned tx (public data only)
  FB->>H: Sign my entries
  H->>R: getLatestLedger (L1)
  H->>FB: signAuthEntry(preimage, expiration = L1+N)
  FB-->>H: signature (verified offline)
  FA->>H: Sign my entries (same procedure, own ledger and expiration)
  H->>R: Finalize: enforcing simulateTransaction with signed entries
  FE->>H: Sign envelope
  H->>FE: signTransaction(envelope)
  H->>R: sendTransaction (BLOCKED until owner authorization)
  H->>R: getTransaction until SUCCESS / FAILED / timeout
```

## Authorization requirements from source
| Operation | Entries | Signers | Notes |
|---|---|---|---|
| `create_session` | 1 | creator | |
| `join_session` | 2 | joiner and creator, same tree, own nonce and expiry each | needs both in one transaction |
| `settle` | one per debtor, each with nested token transfer | out of W2 scope | cannot be tested without token balances |

## Where each guarantee comes from
- Which account must sign what: the contract (`require_auth`), mirrored by SDK `prepare`.
- That a wallet is never asked to sign anything but the expected tree: the helper's intent check (SDK `intent` plus the helper's entry comparison).
- Expiry: assigned by the helper at signing time and enforced by the network; the 10-ledger cap is the helper's/signer tooling's rule.
- Confirmation: only `getTransaction` status `SUCCESS`.

## Findings on the existing abstraction (OBSERVED in code)
`Transport.invoke(call)` has no place for: simulation, entry collection from several wallets over minutes, source account, fee, submission, polling. A network transport must be split into prepare, collect, submit/confirm phases. `prepare` and `intent` are sufficient as they are.
