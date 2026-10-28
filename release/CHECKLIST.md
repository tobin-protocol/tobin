# Release controls

This directory holds the release controls for the experimental MVP-1 baseline. **Nothing here authorizes a release, a push, a tag, a publication or a deployment, and a passing automated check is not a legal, audit or production-readiness finding.**

## Files
| File | Role |
|---|---|
| `RELEASE-GATES.json` | Machine-readable gate status. Unresolved decisions default to BLOCKED, PENDING REVIEW or NOT VERIFIED. |
| `scripts/release/check-gates.mjs` | Validates the file against the repository and reports, or (with `--target`) enforces, readiness. Fails closed. |
| `.github/workflows/release-readiness.yml` | Manual workflow that runs the strict check. It is expected to fail until the human decisions are recorded. It cannot publish, tag or release. |
| `SECURITY-POLICY-DRAFT.md` | Draft security policy with the contact left PENDING. Not adopted. |
| `GITHUB-SETTINGS-CHECKLIST.md` | Branch-protection and fork-handling recommendations. Not verified as active. |

## How the checker works
* `node scripts/release/check-gates.mjs` prints the gate matrix. It exits non-zero only when the gate file is invalid or inconsistent with the tree (for example a gate marked PASS without a named approver, a PASS for the copyright gate while `LICENSE` still has the placeholder, a PASS for the security gate without an adopted `SECURITY.md`).
* `node scripts/release/check-gates.mjs --target public-source-release` (also `private-remote-backup`, `versioned-release`, `production`) exits non-zero unless every gate required for that target is PASS.
* A gate becomes PASS only by editing `RELEASE-GATES.json` with a named responsible person, an ISO date, a decision reference (and, for legal gates, a legal reviewer). Automated and AI actors are rejected as approvers. Absent fields, existing files and a clean scan never pass a gate. `G09` combines an automated source-tree scan with a human sign-off.

## What is who's decision
| Kind | Examples | Who |
|---|---|---|
| Automatable | Source-tree scan, workflow pin checks, formatting, tests | CI / maintainers |
| Owner decision | Licence scopes `G02`, `G03`; security contact `G06`; claim wording `G07`; exact publication action `G11` | Project owner |
| Qualified legal review | Copyright holder and licensor authority `G01`; dependency attribution `G04`; NOTICE `G05`; fixture attribution `G08`; real-value use `P05` | Qualified counsel |
| Evidence that may be unavailable | Raw public-testnet evidence (unpublished), hosted runs, independent review | Owner / third parties |

## Before any push or publication
1. Record the destination and its visibility; verify it independently.
2. Run `node scripts/release/check-gates.mjs --target <target>`; do not proceed while it fails.
3. Record the explicit approval of the exact action under `G11`.
Only then may the owner authorize the action separately. Even a private backup push is a distinct decision.

## Updating this directory
Change gate status only with the evidence the gate asks for. `LICENSE` carries the founder-decided notice "Copyright 2026 tobin-protocol" (a designation, not a registered legal entity; recorded under `G01` and `G02` as a founder decision, not a legal review). That does not pass `G01`: rights-holder authority, contributor and third-party rights still need qualified review. The decision covers the code only; documentation, specification, branding, dependencies and excluded materials are not covered by it. Do not add a `NOTICE` or a `SECURITY.md` without a supported decision.

## Recorded policy change PC-1 (2026-10-28)
For the first public source release of the experimental MVP-1 only, the founder approved a documented policy change (`policy_changes` in `RELEASE-GATES.json`): legal-kind gates `G01`, `G05` and `G08` are approved on the founder's own attestation instead of a counsel review (no legal review took place); the full dependency review `G04` and the hosted-evidence gates `E01` and `E05` are replaced, for this one target, by the source-only dependency standard `G12`; and each approval made under it is valid only for `public-source-release` (`valid_for`). Versioned releases, binaries, Wasm artifacts, packages and any real-value use keep every original requirement and need fresh approvals. `scripts/release/check-gates.mjs` honours the change only while PC-1 carries a complete founder approval. `G06` (security reporting) is not waived.
