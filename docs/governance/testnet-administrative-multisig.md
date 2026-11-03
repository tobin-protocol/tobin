# Tobin Testnet administrative multisig

Status (updated 2026-11-03): **configured on Stellar Testnet; the master key is still enabled.** The dedicated administrative account was funded with Testnet Friendbot (transaction `94b7456b3aaacea1adc7d26730973b0f10da9e9d21514a8dae8383643379b7c7`) and configured by one atomic transaction (`4aeb0e00b3d601b1d3f0062dcaa79fa68eb40c67d698d7657a21dd894f8fe18e`, ledger 5529282, 2026-11-03T01:40:50Z): Founder 5, Technical 2, Security 1 and thresholds 5/6/7, verified by an independent Horizon read. The evidence is in `accounts/evidence/testnet-admin-setup-2026-11-03.json` and `governed-token-evidence.md`. Scope: **Stellar Testnet only.** No Mainnet account is created or described here. The sections below were written before provisioning and describe the procedure that was followed.

## Purpose and limits

A dedicated Stellar account, separate from the signer wallets, whose weighted signers authorize future Tobin administrative *Stellar transactions* on Testnet. It is a governance and operational-security layer for future activity.

- **It does not control the existing contracts.** The deployed clearing contract has no administrator, owner or upgrade path. The deployed token has a fixed minter, the legacy deployer `GD5ESAZOA4RTEHWDJ4RVYH3TG4DJZFX7OGHXXNHVVDA7G77CD5DQNYPQ`, which cannot be changed. Neither contract, nor the legacy deployer, is touched by anything here. The legacy token is a Testnet demonstration token. A new official demonstration token may later be deployed with the administrative account as its minter.
- **Stellar thresholds are not business approvals.** They apply per operation type (below). Account multisig does not make an arbitrary Soroban function require "two approvers" (see `future-soroban-governance.md`).
- **All three signer wallets are currently controlled by the founder.** This is an initial Testnet arrangement to test weighted authorization. It is **not independent multi-party governance** and must not be described as such.

## Signers and thresholds (founder-specified; change only with explicit authorization)

| Role | Public key | Weight | Validation (2026-11-01) |
|---|---|---:|---|
| Founder / principal | `GB4NFBRAPQQH7GP24WXR7RKD2SHJWZXTBZH6CTJTEXZWUHTULDUME6OL` | 5 | valid format and checksum; no Testnet account yet |
| Technical co-signer | `GAE67UNGUDUCBUEHOJKU2OXVF5I6SSGWMH2ZLCS3Q5EXPQ63URNUR26H` | 2 | valid format and checksum; no Testnet account yet (corrected key, submission 2) |
| Security co-signer | `GATMFOGT2C25JK3AU635RKUXBFQ7JTBF3JXEFNZTONYM3VC4SPHX25AP` | 1 | valid format and checksum; no Testnet account yet |

The first submission (2026-11-01) had an invalid 55-character technical key, and its technical and security keys shared a 31-character ending. The corrected technical key was validated and replaced it (submission 2); the two keys no longer share an ending. The superseded values are kept in `accounts/signers-history.json` and `accounts/testnet-admin.signers-submitted.json` as an audit trail. Confirm each key from its wallet before any transaction by comparing the first and last characters over a second channel. All three are valid keys with **no Testnet account yet**; that is normal for a signer key and is not an error.

Thresholds: **low 5, medium 6, high 7.** Total weight 8.

| Signers | Weight | Meets |
|---|---:|---|
| Founder | 5 | low |
| Founder + Security | 6 | low, medium |
| Founder + Technical | 7 | low, medium, high |
| Technical + Security | 3 | nothing |
| All three | 8 | low, medium, high |
| Technical, or Security, alone | 2, 1 | nothing |

These are weighted authorization expectations, not proof of independent human approval.

## Dedicated account

Address: `GCZD5U7GKWMJHX52J2XF65ZULTBGXNMAATYDWMONXPTUD4WB57HMU5MJ` (recorded in `accounts/testnet-admin.json`). History: it was first proposed on 2026-11-01 (read-only checks then: valid format and checksum, no account on Testnet, none of the three signers, not the legacy deployer). On 2026-11-03 it was funded and configured as described in the status line above. Its secret is held by the founder outside the repository; that custody is not verified here, and the secret must never be shared. The master key remains enabled at weight 1 and counts as an extra weight-1 signer until it is disabled, which needs separate approval after a recovery review.

## What the thresholds actually cover (Stellar's operation mapping)

Stellar assigns each *operation* a threshold category; a transaction needs, for each operation, signatures from that operation's source account whose combined weight meets that category.

| Category | Operations |
|---|---|
| Low | Bump Sequence; Allow Trust / Set Trust Line Flags; Claim Claimable Balance |
| High | Account Merge; Set Options **when it changes signers, signer weights or thresholds (including the master weight)** |
| Medium | Everything else: payments, Create Account, Change Trust, Manage Data, Set Options for other fields (home domain, flags), Invoke Host Function (Soroban) and the rest |

(Taken from Stellar's published signature and multisig documentation; re-check it before relying on it for a new operation type.) Consequences:

1. **The founder alone cannot do most things.** Weight 5 meets only the low category, so ordinary operations need Founder + Security (6) and signer or threshold changes need Founder + Technical (7).
2. "Low, medium, high" is therefore **three operation classes, not three business approval levels**. Do not read the table above as "founder approves routine matters, founder and technical approve major ones".
3. The transaction's own source account (sequence number and fee) must also meet at least the low threshold for that account.
4. **While the master key is enabled it is an extra weight-1 signer.** Master + Founder reaches 6 (medium), master + Technical + Security reaches only 4. The master key is disabled in the last step (below), so that it stops being an additional path.

## Bootstrap procedure (each step marked as needing authorization is not executed)

Preparation is separate from execution. `npm run multisig:prepare -- --account <G…>` only prints the plan (no network, no secret, no signing, no submission).

1. **The account's key is generated outside the repository** (done by the founder for the proposed address above; not verified here). The founder creates a fresh keypair on their own device (hardware wallet or offline machine) for the dedicated account and shares only its public key `G…`. It must not be one of the three signer wallets and must not be the legacy deployer. The seed is never pasted into Claude Code, a ticket, an environment file or Git. If no secure signing path (hardware wallet, or a signing tool that never exposes the seed) is available, stop and arrange one first.
2. **Fund it** with the Testnet faucet. *Needs authorization.* Cost: test XLM only.
3. **Apply the configuration in one transaction** (`multisig:prepare` step 1): add Founder (5), Technical (2), Security (1) and set thresholds 5/6/7, as four set-options operations in a single transaction signed by the account's key. One transaction is atomic, so the account is never left half-configured and there is no sequence-number race. *Needs authorization.* Cost: base fee times four operations, in test XLM.
4. **Verify** with fresh reads: `npm run multisig:verify -- --account <G…>` must pass every check (three weights, three thresholds, no unexpected signers).
5. **Test the combinations** with harmless operations on Testnet (below).
6. **Disable the master key** (set weight 0) only when steps 1-5 are done, recovery is documented (`key-custody-and-recovery.md`) and the founder explicitly approves. It needs Founder + Technical (7). *Needs authorization.* If any of these conditions is not met, **leave the master key enabled** and record that its extra weight-1 path remains.

If a transaction fails: stop, run `multisig:inspect -- <account>`, compare with the intended state, and do not blindly resubmit.

## Verification and testing

Read-only: `npm run multisig:inspect -- <account>` and `npm run multisig:verify -- --account <account>` (add `--master-disabled` after step 6).

Signing tests (status after 2026-11-03): the planned five-combination matrix against harmless operations was **not** run in that form. Authorization was instead tested on the governed token's mint (a medium operation) and on a TTL extension (a low operation), and the results are in `governed-token-evidence.md`: Founder + Security (6) succeeded on-chain; Founder alone (5) and Technical + Security (3) were rejected by the network at submission and never included in a ledger; the low-threshold extension was accepted with the Founder alone (5), and a Founder + Security version was rejected as `TxBadAuthExtra` (an unneeded extra signature). **Not tested:** Founder + Technical (7), all three signers, and a high-threshold operation. These tests show Stellar's threshold behavior for this account; they do not show contract-level approval, and they are not independent human governance (the founder controls all three signer wallets).

## Known limitations

- Single-person custody of all signers: no independence, no protection against the founder's own mistakes or compromise.
- Founder-key loss freezes the account (the other two reach only 3).
- Technical-key loss blocks signer changes (high needs the technical key).
- The numbers are the founder's; they have not been independently reviewed.
- The signer keys are validated for format only. Whether the founder controls each wallet, and that each backup works, is not verified here.

## Mainnet migration considerations

Mainnet administration and treasury are separate identities with separate keys, created only after separate authorization. Before any Mainnet use: distinct people hold distinct keys, hardware signing, a tested recovery drill, a review of the threshold design against the operation mapping above, and a decision on whether the master key can ever be disabled. Do not reuse a Testnet key.
