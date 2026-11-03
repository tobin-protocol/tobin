# accounts/

Public metadata for Tobin's Stellar accounts. Public data only: no key, seed or credential may be placed here.

- `testnet-admin.json`: manifest of the Testnet administrative multisig account (status `CONFIGURED_MASTER_ENABLED`: funded and configured on 2026-11-03, master key still enabled; all three signer keys validated).
- `evidence/`: public on-chain evidence of the account setup (2026-11-03). Later evidence (governed token, authorization tests, TTL) is in `docs/governance/governed-token-evidence.md`.
- `signers-history.json`: audit trail of every submitted set of signer public keys (submission 1 superseded, submission 2 validated and adopted).
- `testnet-admin.signers-submitted.json`: the first submission as received, kept unchanged apart from a SUPERSEDED note (its technical key was invalid).

Documentation is in `docs/governance/`. Checks: `node scripts/accounts/check-accounts.mjs`, `npm run validate:signers`, `npm run multisig:inspect|prepare|verify`.
