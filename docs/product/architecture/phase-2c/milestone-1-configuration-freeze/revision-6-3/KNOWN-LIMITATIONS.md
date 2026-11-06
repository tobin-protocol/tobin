# Known limitations (Revision 6.3 CANDIDATE, NOT APPROVED)

Nothing here is hidden elsewhere; each item also appears in the review report, section G.

## The analysis

1. **It is a policy over a narrow language, not a sandbox and not a proof.** It decides whether a file stays inside the syntax and capability patterns the eight reviewed files use. A hole in the reasoning (a position the capability rules fail to see, or a node-type combination I did not think of) would let hostile code through. 1,896 real-file mutants, 134 hand-written fixtures and 145 replayed Revision 6.2 constructs (in two files each) found none, but mutation testing shows only that the mutants I thought of are caught.
2. **Same-file reasoning.** There is no cross-file data flow. A function parameter that receives an `exec`, `fs` or `restrict` implementation can be given a different one by a caller in another file or a test. The only caller of `createStore` in the eight files passes no options.
3. **One explicit computed read with a runtime key**: `cfg.resourceLimits[opName]` in `tst-signer-core.cjs`, accepted by exact source text, once. Its safety is argued (pinned table; result only read by `Object.keys`/arithmetic), not machine-proven.
4. **Bounded-key rules are pattern-based**: loop variables of `Object.keys/entries`, numeric loop indices, array-literal loops, callback index parameters, literal keys. A key bound by these is assumed to be an own enumerable key or a number; an object whose own key is `"constructor"` (from JSON data) can still be indexed with it. The result is a data value or an inherited function that the code does not call.
5. **Approved module members take unconstrained arguments.** `fs.*`, `path.join`, `crypto.*` use whatever path or data the code computes. Paths derive from `process.env.LOCALAPPDATA`, `__dirname`, pinned configuration and command-line arguments.
6. **The SDK bundle** (1.88 MB) runs through `vm.runInThisContext`. The policy proves that the bytes executed are the bytes whose SHA-256 matched the pinned value; it says nothing about what the bundle does. Its values are ordinary values to the analyzer.
7. **Returned values** from approved calls (`JSON.parse`, SDK objects, library results) are treated as data.
8. **The analyzer is not part of B0.** The B0 input set is unchanged (the eight files, config entry, two SDK files). The analyzer, the parser and this package's scripts are tooling and are **not** hashed into B0; approving B0 does not pin which analyzer version judged the files. Their hashes are in `SHA256SUMS.txt` only.
9. **Parser agreement.** The analyzer assumes acorn 8.19.0's parse tree matches what V8 executes. Not verified for exotic inputs.
10. **Parser pin.** The installed parser files are pinned by SHA-256 and verified at run time. The registry integrity string was copied from an existing lockfile and **not recomputed** (the tarball is not in the offline cache). The lockfile in this package was assembled by hand; `npm ci` was not run.
11. **Mutation coverage is not exhaustive.** The exact mutation set is in the review, section D. In particular: mutations are textual and AST-guided around known call sites; they do not enumerate arbitrary program rewrites.
12. **Not independently reviewed.** Author-written tests, reviewed by the author. No external reviewer has reproduced any result.

## Runtime and platform

13. **Absolute-path hardening is not done** (mandatory pre-execution blocker, `absolute-path-hardening-proposal.md`): bare `powershell.exe` and `icacls`, inherited environment including `PATH`, no pinned `cwd`. The libuv lookup order is stated from knowledge, not tested.
14. **Environment inheritance** into the child processes.
15. The PowerShell reproduction is **non-authoritative**: it only reproduces the manifest and hash. It does not apply the loading policy and was not given an AST implementation.
16. Windows PowerShell 5.1, Node 24.14.0, Windows 11 only. No other platform or version was exercised.

## What was not touched

No private key, DPAPI blob, stored secret or the Stellar CLI keystore was read; no network service was contacted; no signing, deployment, minting or transfer; account F and `deployment-config.json` do not exist; Part B is not implemented; `pinned.cjs` is unchanged (`PINNED_CONFIG_SHA256: null`); nothing was committed, pushed or tagged.
