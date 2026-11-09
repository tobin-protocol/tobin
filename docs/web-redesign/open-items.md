# Open items: what only the owner can verify

The rewrite (R1 to R5) was built and checked by one author with scripted Chrome runs against a throwaway console. None of the items below can be closed from this environment. Until each is done the app stays in the experimental, testnet-only, unaudited state described in `apps/web/README.md`.

| Item | Why it is open | What closes it |
|---|---|---|
| Real Freighter | No Freighter extension is installed here, so the Connect wallet window has only been seen in its "checking" and "not found" states. The sign-in with wallet flow was never run against a real wallet in this rewrite | The owner connects Freighter (desktop Chrome, Testnet) and signs in with it; report anything that differs from `components/auth/ConnectWallet.tsx` |
| Screen reader | axe-core and a keyboard-only walkthrough pass, but no assistive technology was used | A pass with NVDA or VoiceOver on sign-in, Reviews, a session workspace, and the dialogs |
| Edge, Firefox, Safari, mobile devices | Every browser run used one Chrome; 390 and 360 px were emulated, not real phones | Run `review-r4.mjs` / `review-r5.mjs` equivalents by hand or add the browsers to the scripts |
| Hosted CI | The browser scripts are local only; only unit tests, lint, typecheck and the release gates run in CI | Decide whether to host a seeded console in CI; none is configured |
| Production app URL | `Launch app` on the landing page is disabled in production until a domain is chosen | Tell the maintainers the domain, then set `NEXT_PUBLIC_TOBIN_APP_URL` |
| Public Discover API and institution opt-in | `/discover` is an explorer with no data source; `docs/web-redesign/discover-contract.md` is the contract a backend would need. No institution has opted in to being listed | A backend that serves the contract, and a written opt-in policy and flow |
| Wallet linking and verification | The Connect a wallet button only opens the window; nothing is linked, signed or verified. An earlier decision keeps linking behind a flag until the owner's Freighter test | The Freighter test above, then a decision on enabling the link and verify routes under `/api/auth` |
| Executions and attempts | Settlement step 5 (Sign, Submit, Verify) is Not supported; execution records are read-only and no transaction is signed or submitted by this app. "Confirmed" is unreachable until an endpoint reports an independent read-back | Signing and submission are separate, owner-run tools; a backend that reports a verified read-back |
| Independent review | All checks are same-author. Nothing is audited | An independent code and security review |
| Aggregate endpoints | Cross-session pages fan out one request per session part (24 requests for 10 sessions on Reviews) | A backend aggregate for reviews, obligations and activity; then only `useCrossSession.tsx` changes |
| Notifications and password change | Not supported by the backend | Backend routes, then a design decision |
