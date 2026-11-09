# H. E2E demonstration plan

Target: Organization A creates a clearing session, Organization B joins, both submit obligations, Tobin calculates net positions, participants review and approve, required wallets authorize, settlement executes on Stellar Testnet, and users verify the transaction and session history. Use up to 4 participants (contract ceiling), one asset (the governed test token), Testnet only, disposable accounts.

## Step feasibility today

| # | Step | Contract | Application | Possible today? |
|---|---|---|---|---|
| 0 | Prepare: fund disposable accounts, mint governed token to participants | yes | scripts only | Partly: the minter is the admin multisig (weights need Founder + Security); done outside the app |
| 1 | Org A creates a session | `create_session` (A signs) | missing | Contract yes (recorded once on Testnet); app no; sandbox simulated |
| 2 | Org B joins | `join_session` needs **A and B** authorization in one transaction | missing; needs cross-organization entry relay | Contract yes; flow undesigned; sandbox simulated |
| 3 | Both submit obligations | `submit_obligation` per debtor | missing | Contract yes; app no |
| 4 | Finalize | any participant | missing | Contract yes |
| 5 | Tobin calculates nets and a proposal | engine (off-chain) + contract validation | missing UI; engine yes | Engine yes (local) |
| 6 | Review and approve | `propose_settlement`, `approve_settlement` per participant | missing | Contract yes; wallet no |
| 7 | Required wallets authorize settlement | `settle` needs every debtor's auth entry for the same transaction | missing; expiry conflict | Blocked: wallet validation, W3 |
| 8 | Prepare and execute on Testnet | simulation, assembly, fee, submit | missing | No |
| 9 | Verify transaction and session history | `get_settlement`, events, explorer | missing | No (reads possible with a new client; none built) |

Steps currently possible end to end: **none on Testnet from an application**. Possible locally: all steps in the sandbox, with simulated authorizations.

## Demonstration script (once phases 1 to 4 exist)
1. Pre-flight page: network = Testnet, contract addresses from the manifest, token supply, TTL remaining.
2. A signs in, creates the session (random id from the registry); B accepts an invitation and links a wallet.
3. Signing room: A and B sign `join_session` within the allowed window; the page shows the pending authorization entries and who still must sign.
4. A and B submit obligations (for example the triangle A→B 100, B→C 80, C→A 70 with a third organization C, plus one extra to show unequal nets); each shows its transaction link.
5. Finalize; the app shows gross total and net positions computed by the engine and the contract's recomputed commitment.
6. One participant proposes the engine's plan; others inspect and approve; a deliberate bad plan is rejected by the contract (conservation check) to show enforcement.
7. Signing room for `settle`: every debtor authorizes (session id, digest, own total).
8. Submit; the page polls to confirmation and shows ledger, transaction hash, total moved, instruction count, and before/after token balances read from the token contract.
9. Verifier page (read-only): recomputes nets from on-chain obligations and compares with the settlement; shows the session history from events.
10. Negative moments (each on Testnet or clearly labelled sandbox): missing approval blocks settlement; a debtor withholding authorization reverts everything and balances remain unchanged.

## Transparent alternatives
If wallet multi-signing cannot be completed live, record the journey with the sandbox transport under a permanent "simulated, not Testnet" banner and keep it separate from the live run; never mix the two in one claim. Application-level approvals (invitations, membership) are labelled as application records, not on-chain authorization.

## Success criteria
A reviewer who does not trust the team can follow the guide, connect a wallet, observe the transactions on a public explorer, and run the verifier to confirm the nets and the settled amounts match.
