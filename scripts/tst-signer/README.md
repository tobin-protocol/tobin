# TST signer (restricted testnet token admin tool)

A small Node.js (CommonJS) command-line tool that, for one Stellar **testnet** token, can build, simulate and (only after an explicit local typed confirmation) sign and submit exactly three
pre-approved administrative operations: `deploy`, `mint-C`, `mint-D`. It is **not** a general signer, **not** a network service, and it is **not production-ready**. Nothing here has been
authorised to execute: the deployment identity (account F) and `deployment-config.json` do not exist, `pinned.cjs` holds `null`, and no baseline has been approved.

Provenance: this directory was migrated from a temporary working folder (see `MIGRATION-PROVENANCE.md`). The runtime closure was then hardened (Phase 2C); see
`docs/product/architecture/phase-2c/tst-signer-security-architecture.md`.

## Layout (the SDK loader requires this geometry)

```
scripts/tst-signer/
  signer/                      the runtime closure (10 files), make-deployment-config.cjs (not runtime), test/
    tst-signer.cjs             LAUNCHER: the only entry point; verifies the baseline BEFORE loading any application module
    baseline.cjs               the integrity gate (Node built-ins only)
    tst-signer-main.cjs        the application (loaded only after verification)
    authorization.cjs  dpapi-key.cjs  pinned.cjs  refusal.cjs  sdk-loader.cjs  state-store.cjs  tst-signer-core.cjs
  pk/stellar-stellar-sdk-17.4.0.tgz                        exact SDK tarball (tracked)
  pk/x-stellar-stellar-sdk-17.4.0/package/                 package.json, LICENSE, dist/stellar-sdk.js  (restored from the tarball; ignored by Git)
  restore-sdk.cjs                                          offline, fail-closed SDK restoration
  SDK-PACKAGE-INVENTORY.sha256  SOURCE-INVENTORY.sha256    hash inventories
scripts/tst-signer-verify/verify-signer-baseline.cjs       EXTERNAL hash-only verifier (independent implementation)
```

## Fresh clone: restore the SDK (offline)

The extracted SDK is deliberately not tracked (the repository's release scan refuses a tracked `dist/` path). After cloning, run once from the repository root:

```
node scripts/tst-signer/restore-sdk.cjs
node scripts/tst-signer/restore-sdk.cjs --verify-only      # check only, writes nothing
```

It uses only the tracked tarball, never the network. It checks the tarball SHA-256 (`455fcadd817f4a30e5f8d0f15162f43a616f72dcbff499c8aa186abe6650a21c`) before decompressing, parses the whole tar
strictly, checks every one of the 6293 entries against `SDK-PACKAGE-INVENTORY.sha256`, requires `@stellar/stellar-sdk` exactly `17.4.0`, writes only `package.json`, `LICENSE` and `dist/stellar-sdk.js` into
`scripts/tst-signer/pk/x-stellar-stellar-sdk-17.4.0/package/` and re-verifies them. It refuses on any mismatch, malformed archive, link/junction in the target path, or differing existing file (it never
overwrites a file that differs). Exit 0 on success, 1 on refusal.

## Running the signer (requires an approved baseline supplied from outside this directory)

```
node signer/tst-signer.cjs baseline                                       print the candidate baseline (manifest and hash); loads nothing else
node signer/tst-signer.cjs preview deploy                                 UNPINNED: prints the candidate baseline and stops (exit 3)
node signer/tst-signer.cjs --approved-baseline <hash> init
node signer/tst-signer.cjs --approved-baseline <hash> preview <deploy|mint-C|mint-D>
node signer/tst-signer.cjs --approved-baseline <hash> execute <deploy|mint-C|mint-D>
```

`<hash>` is exactly 64 lowercase hex characters, taken by the operator from a record kept **outside** this directory. It is never read from a file, the environment or `pinned.cjs`.
Exit codes: 0 done; 1 refused or failed by the application; 2 usage or invalid input; 3 unpinned preview (nothing run); 4 integrity refusal.

Verify the directory from a **trusted copy** of the external tool before relying on the in-signer gate (which cannot vouch for its own launcher or gate file):

```
node scripts/tst-signer-verify/verify-signer-baseline.cjs --signer-dir scripts/tst-signer/signer --expected <hash>
```

## Tests

`node:test`. Run them **only in a sandbox** that points TEMP, TMP and LOCALAPPDATA at a throwaway folder, from `signer/`:

```
node --test test/baseline.test.cjs test/tst-signer.test.cjs test/hardening.test.cjs test/submission.test.cjs test/expiry.test.cjs test/authorization.test.cjs
node --test test/dpapi-cleanup.test.cjs test/windows.test.cjs        # start powershell.exe, icacls, attrib on disposable files only (reviewed; see the test report)
node --test restore-sdk.test.cjs                                     # from scripts/tst-signer
node --test verify-signer-baseline.test.cjs                          # from scripts/tst-signer-verify
```

None of the tests uses a real key, the real key folder or the network. Do not run them without the sandbox.
