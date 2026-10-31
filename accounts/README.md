# accounts/

Public metadata for Tobin's Stellar accounts. Public data only: no key, seed or credential may be placed here.

- `testnet-admin.json`: manifest of the Testnet administrative multisig account (all three signer keys validated; status `PENDING_SIGNER_ADDRESSES` because no account exists yet).
- `signers-history.json`: audit trail of every submitted set of signer public keys (submission 1 superseded, submission 2 validated and adopted).
- `testnet-admin.signers-submitted.json`: the first submission as received, kept unchanged apart from a SUPERSEDED note (its technical key was invalid).

Documentation is in `docs/governance/`. Checks: `node scripts/accounts/check-accounts.mjs`, `npm run validate:signers`, `npm run multisig:inspect|prepare|verify`.
