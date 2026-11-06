# TST signer: sample redacted preview and pinned configuration (revision 2)

Written 2026-11-03. Three samples, all redacted: (1) a pinned-configuration sample for a throwaway fake F generated in memory; (2) a mint preview from **mocked** RPC data (figures are the measured protocol-29 mint resources, used as mock values); (3) a **real** read-only protocol-30 deploy preview against the live Testnet RPC using the funded test account A only as a stand-in for F. Nothing was signed or submitted. Contract IDs, the stand-in address and the salt are redacted. In the unpinned samples the warning line shows the state the signer is in until the configuration hash is pinned.

```text
=== deployment-config.json (sample, throwaway fake F)
{
  "version": 1,
  "network": "testnet",
  "admin": "G<fake-F-for-the-sample>",
  "saltHex": "<64 hex characters>",
  "predictedContractId": "C<predicted-contract-id>"
}

=== pinned.cjs would then contain: PINNED_CONFIG_SHA256 = "63fd2004........................................................" (truncated here)

=== preview mint-C (MOCKED RPC, unpinned sample config)
WARNING: the deployment configuration is NOT pinned to a reviewed SHA-256; execution will be refused until it is.
Network:   Stellar Testnet (Test SDF Network ; September 2015)
RPC:       https://soroban-testnet.stellar.org
Source:    F G<fake-F-for-the-sample>
Operation: mint-C
  contract C<predicted-contract-id>
  mint(to=C GCWK6QC7WTDVUVFY7PAPKXJAIJXOOMNJMSDU3TM2WIXWAMM6VYEXOGWL, amount=20000 base units)
Simulation: OK | minimum resource fee 55971 stroops | total fee 56071 stroops (ceiling 500000)
Resources:  instructions 663465, read bytes 0, write bytes 544
Authorization: source-account only (envelope signed by F)
(preview only: nothing was signed or submitted; execution requires typing: MINT 20000 TO C GCWK6QC7)

=== live deploy dry run (REAL protocol-30 simulation, stand-in account, nothing signed)
WARNING: the deployment configuration is NOT pinned to a reviewed SHA-256; execution will be refused until it is.
Network:   Stellar Testnet (Test SDF Network ; September 2015)
RPC:       https://soroban-testnet.stellar.org
Source:    F G<stand-in>
Operation: deploy
  create contract from Wasm ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f
  salt <random 64 hex characters>
  predicted contract ID C<predicted-id>
  constructor: minter=F, cap=30000, decimals=7, name="Tobin Settlement Test Token", symbol="TST"
Simulation: OK | minimum resource fee 55971 stroops | total fee 56071 stroops (ceiling 500000)
Resources:  instructions 878652, read bytes 0, write bytes 408
Authorization: source-account only (envelope signed by F)
(preview only: nothing was signed or submitted; execution requires typing: DEPLOY TST CAP 30000 MINTER G<stand-in>)
```

In a real run `execute <operation>` prints the same intent and then waits for the exact phrase on the last line before any key is loaded.
