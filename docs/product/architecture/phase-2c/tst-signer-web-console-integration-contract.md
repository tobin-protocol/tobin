# Web Console ↔ TST signer: integration contract (Phase 2C)

Status: **design contract, not implemented.** Nothing in this document authorises the signer to execute. As of this writing the deployment identity (account F) and `deployment-config.json` do not exist,
`pinned.cjs` is `null`, and no baseline is approved, so `init`, `preview` (pinned) and `execute` are all unavailable. The console can be built and tested against everything below without any of that.

## 1. What the signer is, and what it is not

The signer (`scripts/tst-signer/signer/tst-signer.cjs`) is a local command-line tool for **one Stellar testnet token**. It can build, verify and simulate, and (only with an operator's local typed confirmation) sign and
submit exactly three operations: `deploy`, `mint-C`, `mint-D`, with parameters fixed in its reviewed configuration. It holds the admin key only as a DPAPI-protected file read in memory by `execute`. It has no server, no
HTTP interface, no API keys, and no way to sign anything else. **It stays that way**: the console must not turn it into a network service or a general signing oracle.

## 2. Rules the console must follow (non-negotiable)

1. **The browser never talks to the signer, and never receives** a private key, secret seed, DPAPI material, raw signing capability, unsigned/signed XDR to be signed elsewhere, or a state-file path.
2. **The only entry point is the launcher** (`tst-signer.cjs`). The console must never `require` or run `tst-signer-main.cjs`, `tst-signer-core.cjs` or any other module, so it cannot bypass the integrity gate.
3. **The approved baseline hash is configured by an operator out-of-band** (a deployment secret or config of the console's server, taken from the independently maintained trusted record). It is never taken from a browser
   request, from a file inside the signer directory, from `pinned.cjs`, or from the signer's own output.
4. **No shell.** The server adapter starts the launcher with a fixed argument vector (`child_process.execFile`-style, `shell: false`), a fixed working directory, an explicit minimal environment (`LOCALAPPDATA` for the operator account,
   no `NODE_OPTIONS`), and a timeout. Arguments come from a closed enumeration (below), never from free text.
5. **Execution is local.** `execute`, `init`, key creation, deployment-config creation, pinning and baseline approval are performed by the operator at the signer host, in a terminal, with the typed confirmation the signer prompts for.
   The console may *prepare* and *record intent*; it cannot trigger them and cannot supply the confirmation.

## 3. Roles and authentication

The repository defines no identity provider yet; the console implementation must choose one (for example OIDC with phishing-resistant MFA) and map it to roles. The contract needs only these roles:

| Role | May | May not |
|---|---|---|
| `viewer` | read readiness, previews already produced, audit log | request anything that touches the network |
| `requester` | request a **preview** of an enumerated operation | approve, execute |
| `approver` | record an *approval intent* for an operation, bound to a baseline and config hash | execute; approve their own request |
| `operator` (local OS account on the signer host, **not** a web role) | run `init`, `execute`, confirm by typing the phrase | – |

Every adapter call is authenticated, authorised against the role, and rate limited. There is no anonymous endpoint (see section 8).

## 4. Interface the console implementation consumes

A narrow local adapter ("signer port") with four read/prepare calls. The browser calls the console's own backend; only the backend calls the adapter. Sketch (TypeScript, illustrative):

```ts
type Operation = 'deploy' | 'mint-C' | 'mint-D';

interface ReadinessReport {                 // computed by the adapter; no secrets
  generatedAt: string;                      // ISO time
  overall: 'BLOCKED' | 'READY_FOR_PREVIEW' | 'READY_FOR_OPERATOR_EXECUTION';
  checks: Array<{ id: ReadinessCheckId; status: 'PASS' | 'FAIL' | 'UNKNOWN'; detail: string }>;
}
type ReadinessCheckId =
  | 'sdk_restored' | 'baseline_matches_approved' | 'approved_baseline_configured' | 'deployment_config_present'
  | 'deployment_config_pinned' | 'state_present' | 'key_file_present' | 'rpc_reachable';

interface PreviewRequest { requestId: string; operation: Operation; }            // requestId: client-generated UUID, idempotency key
type SignerOutcome = 'OK' | 'REFUSED_APPLICATION' | 'USAGE' | 'UNPINNED' | 'INTEGRITY_REFUSED' | 'TIMEOUT' | 'ADAPTER_ERROR';
interface PreviewResult { requestId: string; outcome: SignerOutcome; exitCode: number; baselineHash?: string; summary?: string; redactedOutput: string; }

interface OperatorApprovalIntent {          // data only; it does not authorise anything by itself
  approvalId: string; operation: Operation; baselineHash: string; configSha256: string;
  requestedBy: string; approvedBy: string; approvedAt: string; expiresAt: string;       // approvedBy !== requestedBy
}
```

Exit-code mapping of the launcher: `0 → OK`, `1 → REFUSED_APPLICATION`, `2 → USAGE`, `3 → UNPINNED`, `4 → INTEGRITY_REFUSED`. Anything else, a timeout, or unparseable output → `ADAPTER_ERROR`/`TIMEOUT` and the call is treated as failed.

Calls:

| Call | What the adapter does | Network | Key |
|---|---|---|---|
| `getReadiness()` | runs the external verifier (`verify-signer-baseline.cjs --signer-dir … --expected <configured hash>`) and `restore-sdk.cjs --verify-only`; checks that the config, state and key files **exist** (never reads their contents) | none | never |
| `requestPreview(PreviewRequest)` | launcher with `--approved-baseline <configured hash> preview <operation>` | RPC read and simulate | never loaded (the application's `preview` does not load it) |
| `recordApprovalIntent(OperatorApprovalIntent)` | stores the intent in the console's own store; checks `baselineHash` and `configSha256` equal the current values | none | never |
| `listAuditEvents(filter)` | read-only | none | never |

There is deliberately **no** `execute`, `init`, `sign`, `submit`, `loadKey`, `readState` or `writeFile` call.

## 5. How readiness is shown

`overall` is `BLOCKED` unless every check passes. Today the report is `BLOCKED` with failing checks `approved_baseline_configured`, `deployment_config_present`, `deployment_config_pinned`, `state_present`, `key_file_present`.
`READY_FOR_OPERATOR_EXECUTION` only means "an operator may now go to the signer host"; the console never claims the signer *is executing* or *has executed* anything it did not observe from the chain or the signer's own record.

## 6. Operator approval

Approval has two separate parts that must not be confused:

1. **Approval intent** (web, recorded by `recordApprovalIntent`): who intends what, bound to a specific baseline hash and configuration hash, with an expiry. It is evidence for the operator, not authority.
2. **Typed confirmation** (local, inside the signer): the signer itself prompts the operator to type the exact confirmation phrase after it has reconciled and previewed. This is the only authorisation to sign. The console cannot generate, pass or
   pre-fill it, and must not display the phrase to non-operators.

An intent is invalid if the current baseline or configuration hash differs from the one it names, if it has expired, or if the requester and approver are the same person.

## 7. Errors and refusals

Refusals are normal, expected results and are shown, not hidden. The adapter returns `redactedOutput` containing only what the signer already redacted (the signer redacts secrets and paths through its own `redact`). The console must
not add raw stack traces, file paths, environment values or child-process stderr that did not pass through that redaction. `INTEGRITY_REFUSED` is shown as a security event, not a retryable error.

## 8. Actions that must never be exposed as web endpoints (authenticated or not)

`execute`, `init`, loading or reading the admin key, creating or rotating keys, creating `deployment-config.json`, changing `pinned.cjs`, approving or changing the baseline hash, reading or writing the state file,
raw transaction signing or XDR signing, uploading or editing any signer file, running arbitrary commands, file read/write endpoints, or any endpoint that returns the DPAPI blob, the key directory listing or environment variables.
Read-only endpoints (`getReadiness`, `listAuditEvents`, results) require authentication too: previews cause RPC calls and readiness reveals deployment state.

## 9. Audit events

Append-only, written by the console backend (not the browser), one JSON object per line, never containing secrets. Minimum fields:
`eventId`, `time`, `actor` (authenticated subject), `role`, `requestId`, `type`, `operation?`, `baselineHash?`, `configSha256?`, `outcome?`, `exitCode?`, `adapterVersion`.
Event types: `readiness_checked`, `preview_requested`, `preview_completed`, `approval_intent_recorded`, `approval_intent_rejected`, `integrity_refused`, `adapter_error`, `auth_denied`.
Writes are synchronous before the response is returned for requests that reach the signer; an unwritable audit log blocks the call (fail closed). Operator-side events (typed confirmation, submission) are recorded by the signer's own state file;
the console imports its status read-only if a later design allows, and never writes to it.

## 10. Limits of this contract

* It protects against the console being a path to key use or to executing without an operator; it does **not** protect against an attacker who controls the signer host or the operator's account (see the trust boundary in the security architecture).
* The unresolved runtime hazard that `powershell.exe` and `icacls` are started by bare name with an inherited environment applies to the signer host regardless of the console, and is a blocker for any execution (not for building the console).
* The role model, identity provider, transport between backend and adapter (same host, loopback or a named pipe) and the audit store are decisions for the console design; this contract fixes only the boundaries above.
