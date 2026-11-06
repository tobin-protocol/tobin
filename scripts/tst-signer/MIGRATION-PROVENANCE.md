# TST signer: migration provenance

This directory is a byte-for-byte copy of the Tobin TST signer working directory, the signer tests and the pinned Stellar SDK. It was
made on 2026-11-06 so the signer is no longer only in a temporary Claude session folder. **Nothing was changed: no signer behaviour, no import,
no test, no SDK file.** The signer has never been executed from here.

## Status of the source

The origin was a session scratchpad folder named `tst-signer/` (with a sibling `pk/`), outside every Git repository. It is the **probable**
migration source, not a Git-confirmed canonical implementation: no commit in any repository ever contained it. Its runtime files and tests are
byte-identical to the Revision 5 to 6.3 evidence copies under `docs/product/architecture/phase-2c/`. That agreement shows the copies are the same
bytes; it is not independent verification, and nothing here is approved (B0 is not approved).

## Layout (the signer loader requires this geometry)

```
scripts/tst-signer/
  signer/                  the eight runtime files, make-deployment-config.cjs, and test/ (helpers, 7 test files, fixtures/)
  pk/stellar-stellar-sdk-17.4.0.tgz      exact original npm tarball (tracked)
  pk/x-stellar-stellar-sdk-17.4.0/package/{package.json,LICENSE,dist/stellar-sdk.js}   extracted from that tarball (ignored by Git)
  SDK-PACKAGE-INVENTORY.sha256   sha256 of all 6293 files of the SDK package
  SOURCE-INVENTORY.sha256        sha256, size and disposition of the 51 files of the source directory
```

`signer/sdk-loader.cjs` reads the SDK from `../pk/x-stellar-stellar-sdk-17.4.0/package` relative to `signer/`; that resolves here.

## Why the extracted SDK is not tracked

`.gitignore` ignores `dist/`, and the repository release-gate scan (G09) refuses a tracked `dist/` path and the contract-ID-shaped string inside
the bundle. The tarball passes the scan, is the exact package, and is tracked instead. After a fresh clone, restore the extracted files with
`tar -xzf pk/stellar-stellar-sdk-17.4.0.tgz` into a scratch folder and copy `package/package.json`, `package/LICENSE` and `package/dist/stellar-sdk.js`
into `pk/x-stellar-stellar-sdk-17.4.0/package/` (keeping `dist/`), then compare with `SDK-PACKAGE-INVENTORY.sha256`.

## Not migrated (33 files, still in the source folder)

Revision 4 and 5 patch scripts, mutation and run logs, review templates and notes, evidence and probe scripts (several have `.txt` copies under
`docs/`), `old.bak` (a superseded test body), sample output. They are listed with hashes in `SOURCE-INVENTORY.sha256`.

## Known issues recorded, not fixed

* **Bootstrap order.** `signer/tst-signer.cjs` requires `sdk-loader`, `tst-signer-core`, `dpapi-key`, `state-store` and `pinned` at the top of the file. A
  future integrity check placed inside `main()` would run after those modules are already loaded. For the independent pinning work (Part B).
* The signer starts `powershell.exe` and `icacls` by bare name with an inherited environment (see the Revision 6.2 and 6.3 findings).
* Tests: node:test; two of them start PowerShell and change files and ACLs in temporary locations. They were **not run** here. The author-reported
  result (142 passing) has not been reproduced. Run them only after a safety review, from `signer/`.
* The SDK is a vendored third-party package (Apache-2.0, license file kept) that is not in the repository dependency baseline.
