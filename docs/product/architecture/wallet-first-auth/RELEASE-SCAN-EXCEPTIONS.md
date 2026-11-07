# Release scan (G09): the evidence exception, and the recovery and network decisions

Owner decisions recorded with this document (2026-11-07): (1) keep the complete public Stellar Testnet contract ids in two existing MVP-1.5 evidence files; (2) resolve the release-scan findings with a precise, documented exception for exactly those files; (3) the ownership-proof server rejects every network except Testnet; (4) keep the verified-wallet requirement for `/settle-run` and `/cosign-check`; (5) defer account recovery.

## The findings

After the MVP-1.5 commit the source-tree scan (`scripts/release/check-gates.mjs`, rule G09) reported **2 findings, 911 files scanned**. Both were the finding type "contract-id-shaped string outside test fixtures":

| File | Contract-id-shaped strings | Which id |
|---|---|---|
| `docs/product/architecture/mvp-1.5/evidence/multisig-live-audit-2026-11-07.json` | 1 | the governed token (`CD5OK4ZS…NOKYO`) |
| `docs/product/architecture/mvp-1.5/evidence/simulation-oneunit-2026-11-07.json` | 14 (one value repeated) | the clearing contract (`CCV3EFEC…PY4DT`) |

Both ids are recorded in `contracts/deployments/testnet.json`, the one place the rule already permits them. They are public Testnet identifiers, not secrets. They had not been flagged earlier because the scan reads tracked files and the evidence was still untracked. The two files are unchanged: the accepted MVP-1.5 evidence was not edited to satisfy the scanner.

## The exception (`scripts/release/scan.mjs`, `EVIDENCE_CONTRACT_ID_EXCEPTIONS`)

It is deliberately narrow:

1. **Exactly two paths**, written out in full in a frozen list. No directory, glob, prefix or pattern: a sibling file, another directory, a `.bak` copy and a different letter case are all still findings (tested).
2. **Only the contract-id finding**, and **only for ids that appear in the deployment manifest.** A contract-id-shaped string in those files that the manifest does not record (a new or different contract id) is still a finding.
3. **Every other rule still applies inside those files**: Stellar secret-seed-shaped strings, private-key blocks, absolute local user paths and excluded or unsuitable paths still fail (tested for each). The file must still be valid JSON.
4. **Nothing else changed.** A contract id in any other file, including documents and source, is still a finding; the manifest's own schema validation is unchanged.

Because the allowed ids are read from the manifest at run time, adding a different contract to the evidence, pasting a secret into it, or copying the evidence elsewhere all fail the scan. Result with the exception: **911 files, 0 findings**; `private-remote-backup` and `public-source-release` gates PASS again as before; `versioned-release` and `production` remain BLOCKED for their own, unrelated reasons (CI runs, reviews, branch protection, and so on). A clean scan does not pass G09 by itself, and G09 still needs its human review.

Tests: `scripts/release/scan.test.mjs`, 8 earlier tests plus 8 for the exception (16 in total, all passing). To remove the exception later, delete the list and its branch in `scan.mjs`, and replace the complete ids in those two files with shortened ones in a separate, explicitly approved change.

## Testnet only: the ownership-proof server

`Registry.issueWalletChallenge` now accepts `network: "testnet"` and rejects everything else (`public`, `mainnet`, any case variant, a passphrase, empty, missing or non-string values) with `400 INVALID` ("only Stellar Testnet is enabled") **before any record is created**. The wallet sign-in path was already Testnet-only. The existing database CHECK that still lists `'public'` belongs to an accepted migration and was not changed; the server never writes it. Tests: `wallet-auth.test.ts` (Testnet accepted end to end with a real signature; twelve other values rejected; nothing stored; the service refuses it as well as the HTTP layer) and `wallet-ops.test.ts` (the old "key verified on the other network" case now asserts the other network is refused). There is no Mainnet transaction, RPC, signer or settlement path anywhere.

## Owner tooling

`/settle-run` and `/cosign-check` (and their APIs) still require a signed-in user with an active verified wallet that is the administrative account, one of its configured signers, or the configured second account. Being signed in is not enough.

## Account recovery: deferred (no workaround exists)

Account recovery is **not implemented** and **no bypass exists**: there is no administrator override, no support-assisted recovery and no back door. A user must keep at least one verified wallet they control. If every verified wallet is lost, Tobin cannot restore the account; the user would start again with another wallet, and the earlier account and its memberships are not reattached. To reduce the risk: removing the only wallet of a wallet-only account is refused by the server, up to five wallets can be verified, and the welcome, onboarding and account screens say this in plain words. A recovery design (for example a second factor, a time-locked administrator-assisted process, or institution-level co-approval) needs its own owner decision and security review before it is built.
