# External baseline verifier (Part A)

`verify-signer-baseline.cjs` recomputes the TST signer baseline from files and compares it with a hash **you supply from an independent record**. It is hash-only: it does not load signer modules, run the signer, open a network connection, read keys, DPAPI blobs or state, or modify anything. Use it from a fresh, trusted copy, never from the directory being checked. The in-signer gate (`scripts/tst-signer/signer/baseline.cjs`) is a separate, second implementation.

```
node scripts/tst-signer-verify/verify-signer-baseline.cjs --signer-dir <dir> --expected <64 lowercase hex>
      [--profile b1|b0|historical-b0] [--sdk-dir <dir>] [--manifest <file>] [--print-manifest] [--json]
```

| Option | Meaning |
|---|---|
| `--expected` | mandatory; exactly 64 lowercase hex characters; never read from the signer directory |
| `--profile` | which approved runtime definition to check. `b1` (default) is the live signer. `b0` is the approved B0 candidate (8 files incl. `pinned.cjs`). `historical-b0` is the historical Milestone 1 definition, kept only to show it is refused (see below). A profile chooses a file list; it never supplies a hash. |
| `--sdk-dir` | the `@stellar/stellar-sdk` 17.4.0 package directory (default: `../pk/x-stellar-stellar-sdk-17.4.0/package` beside the signer directory; create it with `node scripts/tst-signer/restore-sdk.cjs`) |
| `--manifest` | also require a supplied manifest file to be well formed and byte-identical to the computed one |
| `--print-manifest` | print the computed manifest (human mode only) |
| `--json` | print one JSON object `{result, exitCode, profile, computed, expected, reason}` instead of the human lines |

## Exit codes (stable)

| Code | Result | Meaning |
|---|---|---|
| 0 | `MATCH` | every check passed and the computed baseline equals `--expected` (human mode prints `VERIFY: MATCH`) |
| 1 | `MISMATCH` | everything was readable and valid but the hash differs |
| 2 | `REFUSED` | malformed or missing input, unreadable or missing file, unexpected entry, link or junction, CR/BOM/invalid UTF-8, closure violation (a `require()` outside the profile's files, a non-literal `require()`, an unapproved built-in, dynamic `import()`, `eval`, `new Function`), wrong SDK identity (human mode prints `VERIFY: REFUSED: <reason>` on stderr) |
| 3 | usage | missing, unknown or repeated arguments, unknown profile |

Anything not listed is treated as a refusal. There is no "warning" outcome.

## Approved values

B0 `9b594c54…bacbb7` (profile `b0`, preserved sources under `docs/product/architecture/phase-2c/milestone-1-configuration-freeze/revision-6-3/runtime-sources/`), B1 `83f11a7f…c8733e` (profile `b1`, the live `scripts/tst-signer/signer/`). The historical Milestone 1 hash `ccea8b5b…aa92` lacks `pinned.cjs`; its launcher requires `pinned.cjs`, so the closure check **refuses** that definition (the closure was incomplete, which is why B0 added `pinned.cjs`). It is historical evidence only. Details: [B0-COMPLETION-REPORT.md](../../docs/product/architecture/phase-2c/B0-COMPLETION-REPORT.md).

## Tests

`verify-signer-baseline.test.cjs` (38) and `b0-acceptance.test.cjs` (79). Neither starts the signer launcher: the acceptance suite starts processes only through a helper that allows exactly the verifier and the restore script.
