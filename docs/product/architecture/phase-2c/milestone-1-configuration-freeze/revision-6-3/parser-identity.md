# Parser identity, pinning and integrity (Revision 6.3 CANDIDATE, NOT APPROVED)

## What was selected

| Item | Value |
|---|---|
| Package | `acorn` |
| Version | `8.19.0` (exact) |
| Licence | MIT (`vendor/acorn/LICENSE`) |
| Runtime dependencies | none (`"dependencies"` is absent in its `package.json`) |
| Build used | the CommonJS build `dist/acorn.js`, 246,643 bytes, vendored in this package at `vendor/acorn/acorn.js` |
| `package.json` SHA-256 | `04d6fecaafb5e3d20a38fc3b64fed84bb3830a7759a8c00400ebcb87331fec00` |
| `dist/acorn.js` SHA-256 | `b95392d79457d0357555c5ed3e56302d074b92dff119bcf3b44179500b10e9df` |
| Registry resolution (from the lockfile of the sibling repository `tobin-landing`, entry `node_modules/acorn`) | `https://registry.npmjs.org/acorn/-/acorn-8.19.0.tgz` |
| Registry integrity string (same lockfile entry) | `sha512-oJlA3XiRm7Cyk6qFD2Jn8ak9B7jSy0qy00ADO3+8dpT0LSjFihQYv4C02LFCSYJV3Q37xYwwRy5m+IpIiUzqWw==` |

## Why acorn

* It was already present on this machine (installed in `tobin-landing/node_modules` as a transitive development dependency), so **no download was needed and no network call was made**. The task forbids network calls; installing a parser from the registry would have been one.
* It has no dependencies, so the added dependency tree is exactly one package.
* It is a mature, widely used ECMAScript parser with a documented ESTree node vocabulary (the node names used in the policy are ESTree names).
* It is smaller and has a simpler surface than the alternatives found locally (`@babel/parser` 7.29.9, `espree` 10.4.0, `typescript` 5.9.3). `espree` is acorn plus options; Babel and TypeScript are much larger.

## How the pin is enforced

`loadParser()` in `ast-policy.cjs`, before any analysis:

1. reads `vendor/acorn/acorn.js` and `vendor/acorn/package.json`;
2. refuses (throws) unless both SHA-256 values above match;
3. refuses unless `package.json` says `acorn` `8.19.0`;
4. loads **that file by absolute path** (not by module-name resolution, so no other copy on the module path can be picked up) and refuses unless `acorn.version` is `8.19.0`.

The test `parser identity is pinned and verified before every analysis` copies the parser, appends one comment line to it and shows the analyzer refuses to start. Analyzer mutant T23 (hash check disabled) is detected by that test.

There is no fallback. A parse error returns a single `P0` violation and the file is refused; the Revision 6.2 lexer is not used anywhere in the Revision 6.3 analyzer (it is shipped only as `tool-revision-6-2.cjs` for the bypass demonstration).

## Configuration

`ecmaVersion: 2022`, `sourceType: "script"` (so `import`/`export` statements are syntax errors), `allowReturnOutsideFunction: true` (CommonJS modules are wrapped in a function by Node), `allowHashBang: true`, `locations: true`. Any construct acorn cannot parse under these options is refused (`P0`). Constructs it can parse but that are not on the node allowlist (for example `import()` expressions, optional chaining, sequence expressions) are refused by rule `A1`.

## What is and is not verified about the parser

* Verified here: the SHA-256 values of the two installed files; that the lockfile entry of the sibling repository names version 8.19.0 with the integrity string above; that the analyzer refuses a tampered copy.
* **Not verified:** that the registry tarball matches the integrity string. Recomputing it needs the tarball, which is not in the offline npm cache on this machine (`npm pack acorn@8.19.0 --offline` failed with `ENOTCACHED`). The sha512 string is therefore copied from the existing lockfile, not recomputed, and the sha256 values of the installed files are the pin that is actually enforced.
* **Not verified:** that acorn parses every input the same way as V8. The analyzer assumes the parse tree of acorn describes what Node will execute. A disagreement between acorn and V8 on some exotic input could hide code from the policy. For the eight reviewed files this is moot (they run as reviewed); it matters if a different file is ever analyzed.
* The parser is a syntax-analysis component. It is not a security boundary.

## Dependency files

`package.json` and `package-lock.json` in this package list `acorn` `8.19.0` as the only dependency. The lockfile was **assembled by hand from the existing `tobin-landing/package-lock.json` entry** (npm was not run to produce it, because that needs the network). `npm ci` against it has not been executed. Reproducing the analysis does not need npm: the vendored files are used directly.
