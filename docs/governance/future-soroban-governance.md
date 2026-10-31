# Future Soroban governance

Design guidance for future Tobin contracts. **No existing contract changes.** The deployed clearing contract has no administrator, no override, no timeout and no upgrade path, and the deployed token has a fixed minter. The administrative multisig does not control either of them. Do not add privileges to them.

## Stellar account multisig versus contract authorization

- A Stellar account's signers and thresholds decide which signatures make a *transaction* valid for that account. They apply per operation category.
- A Soroban contract grants authority only through its own code: it stores an `Address` and calls `require_auth()` on it. Nothing about an account's signers reaches into a contract by itself.
- If a future contract stores the administrative **account** address as its admin and calls `require_auth()` on it, Soroban asks the account to authorize that call, and for an account address the account's signers and thresholds are applied. Soroban invocations are medium-category operations, so each such call needs 6 (Founder + Security, or Founder + Technical). That is a property of the design of that contract, not an automatic one.
- Therefore a contract cannot get "three approval levels" from the thresholds. If a contract needs different approval for different functions, it must encode it (for example separate roles or addresses per function).

## Rules for a future contract with privileged functions

1. **One explicit authority.** Store the admin address at construction (as the token stores its minter). Read it from storage; never take it from the caller.
2. **Authorization on every privileged call.** Start each privileged function with `require_auth()` on the stored admin (or the argument-bound form). No path reaches privileged state without it.
3. **Name the privileged operations.** List them in the contract's README (for example mint, pause, set parameter, rotate admin, upgrade). Nothing outside the list may be possible. No hidden override or backdoor.
4. **Close alternate entry points.** One-time initialization that fails if repeated; constructors checked; no function that writes privileged state with weaker authorization. Tests try to bypass each privileged function as a stranger and as the wrong signer.
5. **Role separation.** Prefer separate addresses for separate powers (an operator that can pause, an admin that can upgrade) over one address that can do everything.
6. **Emergency pause.** If a pause exists, define who can trigger it, who can lift it, and that it cannot move or seize user funds. Prefer a pause that only stops new activity.
7. **Upgrade controls.** An upgrade replaces the contract's Wasm (`update_current_contract_wasm`) and can change every behavior, including these checks. Provide it only where needed, behind the admin, with an event carrying the new hash and, if appropriate, a delay. Contracts that must be immutable omit it.
8. **Admin transfer.** Two steps: the current admin proposes, the new admin accepts, each with `require_auth()`, each with an event. Rotating the keys behind the administrative account is done by changing its signers and leaves the contract's stored address unchanged.
9. **Recovery.** State what happens if the admin key set is lost (usually nothing can be changed) and whether that is acceptable for that contract.
10. **Keep networks apart.** A Testnet contract stores the Testnet administrative account, a Mainnet contract the Mainnet one.

## Applying to the existing deployment

- Legacy token: fixed minter, no admin feature, no upgrade. A new official demonstration token would be a separate deployment with the administrative account as its minter, after that account exists.
- Legacy clearing contract: no administrator and none to add. Each participant authorizes their own actions.
