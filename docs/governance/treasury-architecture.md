# Treasury architecture (proposal for later approval)

**Proposal only.** No treasury account has been created or funded, on either network, and nothing here is decided. The founder decides the signers, weights and thresholds.

## Principles

1. **Separate identities:** Tobin Testnet Treasury and Tobin Mainnet Treasury, neither the same as any administrative account or the legacy deployer.
2. **Independent keys:** no treasury signer key is also an administrative signer key, so one compromised key cannot reach both administration and funds.
3. **Separation from deployment authority:** the treasury never deploys; deploying accounts hold only a small operating balance for fees.
4. **Funds move only by multi-party approval**, with higher approval for larger amounts.

## Why the administrative weights do not carry over

With 5/2/1 and thresholds 5/6/7 the founder alone meets only the low category, and every payment needs two signers. That suits governance. For funds, decide deliberately who may move money and how: do not copy the administrative numbers.

## Recommended starting point (for discussion)

| Item | Proposal |
|---|---|
| Signers | Three or four independent keys: founder, a finance or operations signer, a security signer and, optionally, a recovery signer held by a trusted third party |
| Weights | 1 each |
| Medium threshold (payments) | 2 of 3, or 3 of 4 |
| High threshold (signers, thresholds, merge) | 3 of 3, or 3 of 4 |
| Low threshold | 1, harmless operations only |

If the founder must have the final say, use founder weight 2 and others 1, with medium 3 and high 4. Choose this deliberately.

## Fund movement

Written request before signing (amount, destination, reason); each signer reads the decoded transaction on their own device; destinations checked against an allow-list of public addresses kept in the repository; Mainnet movements above an agreed limit need the high-threshold approvers; every movement logged (hash, date, approvers).

## Recovery

A written, tested recovery for every signer key. With four signers, one lost key leaves the account operable. Signer rotation follows `signer-management.md` at the high threshold.

## Testnet treasury

A Testnet treasury can use a simpler scheme to rehearse the procedures, but is still a separate account with separate keys. While one person holds every key, say so wherever it is described.

## Needs founder input before anything is created

Signer identities, weights and thresholds (or acceptance of this proposal), the optional recovery signer, spending limits and the operating-balance policy.
