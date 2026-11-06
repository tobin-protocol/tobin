# Phase 2C final approval package

Written 2026-11-03. Nothing below has been done: no Friendbot request, no wallet interaction, no signature, no contract transaction, no token transfer, no mint, no deployment. Read-only queries only. Statuses: PASS, FAIL, BLOCKED, PARTIAL, NOT RUN.

## 1. Status

| Item | Status |
|---|---|
| Friendbot funding prepared | PASS (prepared); execution NOT RUN |
| Session setup plans prepared | PASS (prepared); execution NOT RUN |
| Legacy token holder identified | **PARTIAL**: holder H found and balance verified; control of H's key unconfirmed |
| Account security checks | PASS, with two honest limits (section 3) |
| T3 invocation reviewed and replaced by a safer one | PASS (section 4); T3 itself NOT RUN |
| T6, T7 | **BLOCKED** until the H transfer is approved and H's key is confirmed available |

## 2. Actions awaiting approval (exact list)

| ID | Action | Detail | Document |
|---|---|---|---|
| AP-1 | Five Friendbot POST requests (F1 to F5), Testnet only | One per address A to E; order F1 to F5; no retries in a loop | [funding plan](phase-2c-friendbot-funding-plan.md) |
| AP-2 | Two legacy-token transfers X1, X2 from holder H | H to C 10,000 base units; H to D 6,000; supply unchanged. **Also confirm you control H's key** and how it will sign | [transfer plan](phase-2c-legacy-token-transfer-plan.md) |
| AP-3 | 27 setup transactions | 6 `create_session` for the join sessions, 9 for the single-debtor session, 12 for the two-debtor session | [setup transactions](phase-2c-setup-transactions.md) |
| AP-4 | Choice of signing method for AP-3 | Option F: every setup transaction signed through Freighter (about 27 envelope prompts plus about 20 entry prompts). Option S: setup transactions signed by a local script that decrypts the disposable keys (no Freighter, no secret shown to Claude, keys already stored DPAPI-encrypted); Freighter is then used only for the test-critical signatures T3 to T9. Option S needs a helper script, which is a code change I would first show you | this document |
| AP-5 | The T3 scratch helper (from the previous report), amended in section 4 | Localhost-only page in the scratchpad; no repository change | section 4 |

Already authorized by you and not repeated here: T3 (wallet interaction), T4 to T9 and T13 test transactions (8 expected successes plus 1 deliberate expired-entry failure).

## 3. Account security confirmation (D)

| Check | Result |
|---|---|
| Secret files outside the repository | Yes. The only secret file is the DPAPI-encrypted blob in a per-user directory under the Windows local application data folder; the repository working tree has only untracked `docs/` additions |
| Public manifest has no secret | Yes. `test-accounts.public.json` holds only labels, roles, public addresses; pattern scan for secret-key strings over `docs/`, `contracts/deployments/` and `accounts/` found none |
| No secret in terminal logs or documents | The secrets were never printed: generation wrote to files, verification printed only match/mismatch. Not independently proven for tool-output history, but no secret appears in any output shown |
| Import instructions | The earlier `Set-Clipboard` snippet could have left a secret in Windows clipboard history and was **replaced**. The new `import-helper.ps1` takes the account letter at a prompt (no argv), prints nothing, flags the clipboard item with the Windows history/cloud exclusion format, and clears the clipboard. Self-test with a dummy value confirmed the format is set. That Windows really skips the history was **not verified**; test with the dummy and check Win+V once |
| Limits | DPAPI does not stop other processes of the same Windows user (including this session); the helper script lives in the key directory, not the repository |

## 4. T3 invocation review (E)

**Rejected:** `finalize_obligations(1, you)`. `1` is not a valid session id (a `BytesN<32>`), and a signed entry for a real session id where the signer is a participant could be submitted by anyone until it expires, finalizing a live session. In general, an unsubmitted but valid signed entry authorizes exactly its invocation until its expiration ledger (or until its nonce is consumed); a failed transaction rolls the nonce back, so it stays reusable until expiry.

**Source semantics (`contracts/clearing/src/lib.rs`, `finalize_obligations`).** The function first calls `load_session` (error `NoSession` if absent), then checks state, participant membership, and obligations, and only then `caller.require_auth()`.

**Proposed T3 invocation:** `finalize_obligations(R, A)` on the clearing contract, where `R` is 32 fresh random bytes generated at run time and verified not to exist (`get_session(R)` read-only must fail), `A` is account A, expiration = current ledger + 5 (within the 10-ledger policy). Why safer:

- Executing it can only fail with `NoSession`, before any state change or authorization check; the probability that `R` later becomes a real session where A is a participant is negligible (random 256-bit id).
- It still exercises the real entry structure for a real Tobin contract function (contract address, function name, arguments of the right types), so a successful signature is meaningful evidence at level L2.
- It needs no funded account, no session and no transaction. Only the owner signs, in Freighter, with network set to Testnet.
- Residual risk: none beyond a signed blob whose only possible effect is a failing call. It is not submitted, and the helper will not contain a submission path.

Limit of this evidence: it shows Freighter can sign a Tobin-shaped entry (L2), not that join or settlement entries work (L3).

## 5. Findings that change the plan

1. Legacy tokens exist and are held by a single account (H), so T6/T7 are feasible if H can sign.
2. The participant ceiling forces T7 to be exactly A, C, D, E; B appears only in join sessions.
3. The setup volume (27 transactions) makes the signing method (AP-4) the real decision.
4. The Testnet protocol version reported by the RPC is 30, while the repository tests use the Soroban host 29 (earlier local-network stages used a protocol-29 node, per the project notes). The effect on authorization entries is not examined here: listed as a remaining uncertainty.

## 6. Order of execution if approved

AP-5 and T3 first (needs nothing else); then AP-1; then AP-2; then J-1 and T4/T5; then the settlement sequences; T8 and T9 last. After each step: verify on chain and report before proceeding.
