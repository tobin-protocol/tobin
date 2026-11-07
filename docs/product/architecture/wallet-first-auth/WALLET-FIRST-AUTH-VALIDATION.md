# Wallet-first authentication: validation record

Date: 2026-11-07. Environment: Windows 11, Node 24, Chrome headless (CDP), SQLite through `node:sqlite`, Stellar **Testnet only**. All evidence is same-author. Nothing here is production, Mainnet or independent-audit evidence.

## What kind of evidence each result is

| Label | Meaning in this record |
|---|---|
| **Real server verification** | the real HTTP handlers, real `AuthService`/`Registry`, a real SQLite database, real ed25519 verification of signatures made with throwaway keys |
| **Mock wallet** | a function or object that imitates the Freighter API in a unit test (`wallet-signin.test.ts`) |
| **Stand-in extension (browser)** | the headless browser has no Freighter; `wallet-auth-journey.mjs` injects a script that speaks the extension's real message protocol, so the real `@stellar/freighter-api` client library and the real application code run; its signatures are made in Node with the SEP-53 scheme and verified by the real server. **It is not equivalent to a real owner-run Freighter session.** |
| **Real Freighter** | none in this work. The only real-Freighter evidence is the earlier owner-run MVP-1.5 (a message signature accepted by the server, reported as SEP-53 by the owner) |
| **Real Stellar Testnet reads or transactions** | none. Wallet sign-in does not touch the network; nothing was submitted, minted or changed |

## Final results (after the last application code change)

| Check | Result |
|---|---|
| Typecheck (`npm run typecheck`, all workspaces) | 0 errors |
| Production build | succeeded |
| Web-console unit and integration suite, no Rust bridge | **494 tests, 486 pass, 0 fail, 8 skipped** (the real-contract tests that need the bridge) |
| Same, with the existing Rust bridge exe (built 2026-10-28, not rebuilt) | **494 tests, 494 pass, 0 fail, 0 skipped** |
| of which new in this work | 29: `wallet-auth.test.ts` 21 (real server verification), `wallet-signin.test.ts` 8 (mock wallet, mock HTTP) |
| SDK suite, with the bridge / without | 64 tests: 63 pass, 0 fail, 1 skipped / 55 pass, 0 fail, 9 skipped |
| Release-scan tests (`scripts/release/scan.test.mjs`) | 16 tests, 16 pass (8 earlier, 8 for the evidence exception) |
| Release scan | **911 files, 0 findings**; `private-remote-backup` and `public-source-release` gates PASS; `versioned-release` and `production` remain BLOCKED (unrelated gates); a clean scan does not pass G09 by itself |
| New wallet-first journey (stand-in extension, real server) | **78 of 78 at 1200 px, 78 of 78 at 420 px** |
| Existing journeys at 1200 px / 420 px | W0 43/43 and 43/43; settlement 90/90 and 90/90; authorization 44/44 and 44/44; clearing 71/71 and 71/71; backend 42/42 and 42/42; sessions 78/78 and 78/78; Console journey (needs the bridge) 128/128 and 128/128 |
| Migrations | 1 to 7 untouched; 8 applies to a fresh database; a populated version-7 database (built from the accepted migrations) upgrades in place with its data and defaults intact; a second run is a no-op; constraints and triggers tested |

The journeys were run as one batch against the final build (all of them passed except the two items below, which were re-run and passed), because two journey results in that batch were affected by timing and teardown, not by product behaviour:

- The sessions journey (an accepted file) paused for a fixed 100 ms and then asserted that its test-delayed request had been intercepted; the request is issued 150 to 250 ms after the loading text appears, so the check lost a race at both widths. The pause is now a bounded wait (up to 5 s) for that condition; the assertion is unchanged. It then passed 78/78 at both widths. **No baseline of this latency from before the wallet-first changes was taken**, so it is not established whether the app became slower there.
- The Console journey (an accepted file) finished all 128 checks and then crashed while deleting its temporary browser profile (a Windows file lock, EPERM) before it printed its summary. It was re-run and passed 128/128 at both widths. That journey's cleanup was not changed.

## Issues found and fixed in the final validation round

1. **Sign-in page weight (a real regression, fixed).** The new sign-in component imported the Freighter helper, which statically imports the whole Stellar SDK, so the sign-in page shipped it. A journey that types into the email form right after navigation then occasionally clicked before the page was interactive. The wallet-detection code moved to `freighter-core.ts` (no SDK); `freighter.ts` re-exports it and keeps the SDK-dependent signing. The built sign-in page is now 4 script chunks, about 63 KB, none containing the Stellar SDK.
2. **Intermittent blank-document reads in browser journeys.** Across about 45 journey runs, three runs (authorization at 420 px, settlement at 420 px, settlement at 1200 px) failed once each with "`innerText` of null" on a document that was still loading, and each passed on every re-run (the first two occurred before any wallet-first work; the settlement journey then passed 6 of 6 consecutive re-runs). A fourth failed run was caused by issue 1 above. The shared `waitFor` in `test/browser/cdp.mjs` now keeps waiting through such transient errors and reports the last page error if the condition never becomes true, and the settlement journey's `main` helper waits for the main region. These are synchronization fixes; no assertion was weakened.
3. Temporary-artifact cleanup at the end of the settlement and wallet journeys is now best effort (a locked browser profile on Windows no longer crashes a run whose results are already computed).

## Migration validation: what was and was not done

A copy of an owner-run database was **not** upgraded: a copy of `C:/tmp/owner-run/owner3.sqlite` and its write-ahead log exposed no tables when opened in isolation (the original was never opened and its hash was checked unchanged). The upgrade claim therefore rests on the populated version-7 test above, **not on a real owner database**.

## Browser journey coverage (stand-in extension, both widths)

Welcome screen; Freighter unavailable (with install guidance); locked wallet; connection declined; wrong network; signature declined; challenge expiry (client side); successful sign-in and HttpOnly cookie check; first-time onboarding with progress kept after a reload; institution creation with type and jurisdiction; creator is not a reviewer; invitation bound to a wallet (a different wallet is refused with the same generic message, the invited wallet joins with exactly the offered role, the code cannot be reused); returning user goes straight to the workspace; second institution, workspace switcher and the remembered workspace; suspension removes access and shows in the member list; Freighter account change banner; Freighter network change banner; account switch during signing is caught; account page (add a wallet with a fresh proof, refusal for a wallet owned by another user, only-wallet removal refused, sign out everywhere); logout; unauthorized pages and APIs; the public join page; the owner Testnet tools return 403 to an ordinary wallet; no unexpected JavaScript exception. Screenshots were inspected for the welcome, onboarding and account screens.

Challenge expiry on the **server** is tested in `wallet-auth.test.ts` with a moved clock; the browser journey only covers the client's own refusal to send an expired challenge. Testnet-only ownership proof is tested in `wallet-auth.test.ts` (Testnet accepted end to end; twelve other network values rejected; nothing stored) and `wallet-ops.test.ts`.

## Known limitations of this validation

- **Real Freighter was not used for this flow.** A real-extension run by the owner (including Edge) is recommended before relying on it.
- Only one browser engine (Chrome headless). No Edge, mobile device or screen-reader run; accessibility was checked structurally (labels, captions, scopes, one main region). Visible focus styles are defined in CSS, but keyboard-only navigation was not exercised and no assistive technology was used.
- Single process and single SQLite file; no concurrency across processes; no load or fuzz testing.
- The Console journey and the bridge-dependent tests used a bridge executable built earlier from the repository contracts; it was not rebuilt.
- The security review is same-author; see `WALLET-FIRST-AUTH-SECURITY-REVIEW.md` for residual risks. See `RELEASE-SCAN-EXCEPTIONS.md` for the scanner exception, the Testnet-only decision and the deferred account-recovery policy.
