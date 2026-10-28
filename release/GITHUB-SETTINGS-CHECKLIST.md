# GitHub settings checklist (recommendations; none of this is verified as active)

These settings live in the hosted repository, not in files. **This checklist is a documented recommendation. No setting has been inspected or changed, the destination repository has not been verified, and the release gate `E05` stays NOT VERIFIED until an administrator confirms each item through an independent method (for example a settings export or the repository's rulesets/branch-protection API output) and records it.**

Before using any hosted workflow, verify the exact destination repository (owner, name, visibility, who has access). The `origin` remote configured in the local clone has not been contacted or verified.

## Required status checks (actual names)
GitHub shows a workflow job's check by the job name:
| Workflow | Job name (as the check appears) | When it runs | Use as a required check? |
|---|---|---|---|
| `ci` | Rust, TypeScript and documentation checks | pull requests, manual | **Yes**, on the protected branch |
| `integration` | Dependency licence metadata report (report-only) | pushes to `main`, weekly, manual; pull requests that touch dependency or CI files | No (report-only; it is skipped on most pull requests) |
| `integration` | Contract Wasm build, Wasm-mode tests and hash report | pushes to `main`, weekly, manual | No (does not run on pull requests) |
| `integration` | Browser journey at 1200 px and 420 px | pushes to `main`, weekly, manual | No until it has passed on the hosted runner and a decision is made to run it on pull requests |
| `release-readiness` | Strict release-gate check (fails while any required gate is unresolved) | manual only | No; it is meant to fail until human decisions are recorded |
A required check must have run at least once before GitHub offers it in the list.

## Protected branch or ruleset (recommended)
- [ ] Require a pull request before merging; require at least one approving review (the project owner or a delegate).
- [ ] Dismiss stale approvals when new commits are pushed; require approval of the most recent push.
- [ ] Require the `ci` check above to pass and the branch to be up to date before merging.
- [ ] Require conversation resolution.
- [ ] Restrict force pushes and branch deletion.
- [ ] Require review for changes under `.github/`, `scripts/`, `ci/`, `release/` (CODEOWNERS; the file does not exist yet and needs the owner's decision on reviewers).

## Actions and fork settings (recommended)
- [ ] Default workflow token permission: read repository contents only; do not allow Actions to create or approve pull requests.
- [ ] Require approval before running workflows from first-time contributors, or from all outside collaborators.
- [ ] Do not send secrets or write tokens to workflows triggered by fork pull requests (the workflows here need no secrets).
- [ ] Do not add `pull_request_target` workflows; this repository's validation script rejects them.
- [ ] Restrict allowed actions to the actions in use, pinned by full commit SHA; if the platform offers a policy that requires SHA pinning, enable it.
- [ ] Set artifact and log retention no longer than needed (the workflows set 7 and 14 days for artifacts).
- [ ] Do not create repository secrets or variables for these workflows.
- [ ] Review who can change repository visibility; do not change visibility until gates `G01` to `G11` allow it.

## Recording verification
For each item, record who verified it, when, and by which method in the decision reference of gate `E05`. Until then, describe branch protection as *recommended*, never as *enabled*.

## Additional settings for a public repository (recommendations; none verified)
- [ ] **Secret scanning and push protection**: enable both for the repository (availability depends on the account plan and visibility). These are a safety net, not a substitute for the pre-publication audit; they do not scan history for everything, do not find all secret types, and push protection can be bypassed by a user who chooses to.
- [ ] **Dependabot alerts** and **Dependabot security updates**: enable. Review each update PR; the lockfiles are pinned on purpose. Dependabot version updates for GitHub Actions can keep the SHA pins current, but each proposed pin must still be checked against the official release tag.
- [ ] **Code scanning or an equivalent review process**: either enable a code-scanning workflow after reviewing its action and permissions (it needs `security-events: write`, which the current workflows deliberately do not have), or document an equivalent manual review. Neither is configured today.
- [ ] **Repository access and ownership**: list the owners/admins; require two-factor authentication for the organization; keep at least two administrators with recovery paths; remove stale collaborators and deploy keys; confirm that no personal access tokens or GitHub Apps with write access are installed that the project does not need.
- [ ] **Default token permissions**: read-only; "Allow GitHub Actions to create and approve pull requests" disabled.
- [ ] **Pull-request review and branch protection or rulesets**: as in the section above.
- [ ] **Fork workflow restrictions**: approval required for first-time and outside contributors' workflow runs; no secrets or write tokens for fork-triggered runs.
- [ ] **Required status checks by exact name**: "Rust, TypeScript and documentation checks" (the `ci` workflow).
- [ ] **Security reporting**: enable private vulnerability reporting only if the owner chooses it as the reporting channel (see `SECURITY-POLICY-DRAFT.md`); publish `SECURITY.md` only after the channel is tested.
- [ ] **Community and contribution expectations**: `CONTRIBUTING.md` exists; decide on a code of conduct, issue templates and whether Discussions are enabled. Keep Issues enabled for the issue-first rule in `CONTRIBUTING.md`.
- [ ] **Releases and packages**: leave the Releases and Packages features unused until gates `G10` and `G11` are PASS.

## What changing visibility exposes
Making the repository public exposes **all reachable history** (every commit, branch and tag that is pushed), not just the current tree, plus pull requests and issues created earlier, **workflow run logs and artifacts** from earlier runs (these may become readable to anyone once the repository is public, unless they are deleted first), repository settings that are public by nature (collaborator lists of an organization may differ), and any forks created afterwards. It also lets third parties clone, mirror and archive the content; an accidental disclosure cannot be reliably retracted afterwards (credentials would have to be rotated and history rewriting would not remove copies). Do not rely on GitHub secret scanning as a substitute for the pre-publication audit and gate `G09`. Before any visibility change: delete old workflow runs and artifacts you do not intend to publish, re-run `node scripts/release/check-gates.mjs --target public-source-release`, and record the explicit approval under gate `G11`.
