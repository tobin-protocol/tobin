# Signer management

How signers are added, replaced and used for the Testnet administrative multisig described in `testnet-administrative-multisig.md`. Nothing here has been executed; the account does not exist yet. All three signer wallets are currently controlled by the founder, so these procedures are rehearsals of the mechanics, not of separation of duties.

## Signing a transaction

1. Build the transaction unsigned (the Stellar CLI can build one with `--build-only`). The result is public data (base64 XDR).
2. Each signer decodes it on their own device and checks the source account, the operations and the amounts, and signs only if they can read and understand it. Use a hardware wallet, or a signing tool that never reveals the seed.
3. Signatures are collected on the same envelope. The submitter submits once the combined weight of the signers meets the category of every operation (see the operation mapping in the architecture document).
4. After submission, confirm ledger inclusion and read the account back; do not treat a submitted transaction as done.

Never send a secret seed to anyone, including Claude Code. Signers share signed envelopes and public keys only.

## Adding or replacing a signer (high threshold: Founder + Technical, 7)

1. The new signer generates a key and shares only the public key. Validate it: `npm run validate:signers -- --candidates <file>` (format, checksum, duplicates, shared endings).
2. In one transaction add the new signer with the intended weight. Do not remove the outgoing signer in the same transaction.
3. Verify the new signer can sign a harmless low operation. Then remove the old signer (weight 0) in a second transaction.
4. Read the account back (`multisig:verify`) and update `accounts/testnet-admin.json` with the new public key and the transaction hashes.
5. Never leave the account in a state where the remaining signers cannot reach the high threshold. Founder + Technical must both stay available throughout.

## Changing weights or thresholds

Only with explicit founder authorization, as a high-category transaction. Re-run the combination table (`node scripts/accounts/check-accounts.mjs`) first: confirm that Technical + Security still meets nothing and that Founder + Technical still meets high.

## Disabling the master key

See bootstrap step 6 in the architecture document: only after verification, tested signing, documented recovery and the founder's explicit approval. Until then, treat the master key as an additional weight-1 signer and keep it as protected as any other.

## Records

Public metadata only, in `accounts/testnet-admin.json`: account ID, signer public keys, weights, thresholds, master-key weight, transaction hashes, dates. `node scripts/accounts/check-accounts.mjs` validates it. No seeds, no recovery phrases.
