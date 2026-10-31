# accounts/

Public metadata for Tobin's Stellar accounts. Public data only: no key, seed or credential may be placed here.

- `testnet-admin.json`: manifest of the Testnet administrative multisig account (status `PENDING_SIGNER_ADDRESSES`; no account exists yet).
- `testnet-admin.signers-submitted.json`: the signer public keys exactly as submitted, for the validation report (the technical key is invalid).

Documentation is in `docs/governance/`. Checks: `node scripts/accounts/check-accounts.mjs`, `npm run validate:signers`, `npm run multisig:inspect|prepare|verify`.
