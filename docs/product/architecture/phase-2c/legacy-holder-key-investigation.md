# Legacy token holder key investigation (Phase 2C)

Written 2026-11-03. Question: can the signing key of the legacy token holder `GB4WIKKCYDDQUKLTKBMMMCPLZJVXZWL36CJEGWXMKEYV7NNLS2MDE7G5` (the recipient of the only mint, 1,000,000,000 base units) be recovered from legitimate Tobin project artifacts?

**Result: NO matching key was found. The holder's key is unavailable through the inspected project resources.** Nothing was signed, transferred or modified; no secret was printed or logged.

## Method and boundaries

Only project-controlled paths were read. The Stellar CLI keystore (`~/.config/stellar`) was **not** read: it is not project-specific, and an earlier standing rule of this engagement forbids it. Browser profiles, other wallets, password managers and unrelated directories were not touched. No key derivation from the address, no guessing, no brute force.

For secret detection, a scanner looked for Stellar secret-seed-shaped strings (`S` plus 55 base32 characters), validated the checksum, derived the public address locally and compared it with the target. Only counts and paths were printed, never values.

## Artifacts inspected

| Area | Type | Result |
|---|---|---|
| `tobin/` working tree (code, scripts, docs, accounts, contract deployments, CI) | text files | No secret-shaped string; target address appears only in two unit tests as a sample public key (labelled public, disposable) |
| `tobin/` git history, 79 commits (all refs) | `git grep` over every revision | 0 secret-shaped strings. The target address first appears in commit `68553e9` (the two test files only) |
| `tobin-clearing/` (68 commits) and `tobin-landing/` (80 commits) | working tree and all revisions | 0 |
| `tobin-mvp-1/` (including `phase-e-evidence/`), `m0-review/`, `docs/`, `_tobin-backups/`, `_tobin-clean-optionB-leftovers-20261028/` | 2,169 text files in total across all scanned trees (not git-tracked for the first and third) | 0 secret-shaped strings, 0 valid seeds, 0 matching the target |
| File-name search for `.env*`, `*.key`, `*.pem`, identity or keystore files, files named secret or seed | all project trees | None relevant (two Chrome profile files named `...SeedV2` are unrelated browser data) |
| Environment-variable and CLI references in scripts | `scripts/`, `.github/`, `packages/`, `apps/`, `contracts/` | No variable names for secrets or seeds; the multisig tooling is explicitly read-only and public-data-only (`scripts/multisig/lib.mjs`) |
| Documented backup or recovery instructions | `docs/governance/key-custody-and-recovery.md` etc. | These concern the administrative multisig, not this account. They state that keys are never kept in the repository |

## What the documentation says about this account

- The target address does not appear in any prose document, report or deployment record. The deployment manifest records only that "deployer and participants are disposable accounts"; it does not name the participant or the key store used for the 2026-10-29 deployment.
- Phase E (`tobin-mvp-1/MVP-1-PHASE-E-TESTNET-REPORT.md`) used a **different** set of disposable accounts and a different token (supply 2,865), whose key files were overwritten and deleted at the end. The target is not among them.
- The Stage B plan states that disposable keys were generated into isolated config directories outside the repositories and deleted afterwards.

## Conclusions

| Question | Answer |
|---|---|
| Candidate key found? | **No** |
| Derived address matches the target? | **Not applicable** (no valid seed exists in any scanned location) |
| Key accessible and usable locally? | **No evidence it is** |
| Did Tobin's deployment process generate, store or reference it? | The process that created the holder on 2026-10-29 is **not documented** in the repository; its key custody is unknown |

## Remaining blockers and possible owner-side checks

1. The key may sit in a place I am not allowed to read, most likely the Stellar CLI identity store used for the 2026-10-29 deployment, or a wallet. **Only you can check this safely**: in your own terminal, list your own identities and compare **public** addresses only (for example, `stellar keys address <identity-name>` prints only the public address). If one equals the target, the key exists; do not paste it anywhere.
2. If no such identity exists, the account is unsignable and the legacy tokens it holds are unreachable; **T6 and T7 remain BLOCKED**.
3. The remaining routes to settlement tokens would each change the plan and need separate decisions: the legacy minter (rejected earlier as off limits), minting through the governed token (supply and mint authority are protected), or a new test token (a deployment, not authorized). None was attempted or recommended here.
