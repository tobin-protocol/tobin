# 05 Functional and backend audit

Backend: `apps/web-console` (Next.js route handlers, SQLite through `node:sqlite`, single instance, binds to 127.0.0.1:8787; `package.json`, `lib/db/database.ts`). The web app reaches only `/api/auth/*` and `/api/registry/*` through its proxy (`lib/proxy-policy.ts`); `/api/stellar/*`, `/api/rpc`, `/api/bootstrap`, `/api/health`, `/api/w0/*` are deliberately not forwarded (e2e `smoke.spec.ts` expects 404).

Classification: **B** fully backend-connected, **D** derived in the frontend from backend reads, **P** partial, **F** frontend-only, **PH** placeholder, **PL** planned/unsupported.

Tests: backend tests exist in `apps/web-console/test/` (registry, sessions, clearing, authorization, settlement, wallet auth and sign-in, backend db/security, guards; ~45 files). Frontend tests: `apps/web/test/*.test.ts` (9 files, 744 lines: logic, netting, no-confirmed, org-wallets-settings, redesign, sessions, settlement, signin, stages) test pure `lib/` functions; `e2e/smoke.spec.ts` (5 Playwright smoke tests, no backend). **None of these were run by this audit** [reported-not-rerun in repo docs; unknown current pass state].

## Feature matrix

| Feature | Class | Entry point | Components | Frontend service | API endpoints (via `/api/...`) | Backend handler | DB tables | Permissions / validation / failure |
|---|---|---|---|---|---|---|---|---|
| Email register/login | B | `/sign-in` | sign-in page | `client.auth.register/login` | `POST auth/register`, `auth/login` | `lib/auth/http.ts` -> auth service | `users`, `auth_sessions`, `rate_events` | zod: email contains "@", password >= 8; errors shown inline; cookie session |
| Wallet sign-in (Freighter SEP-53) | B (with browser extension) | `/sign-in` | WalletSignIn | `lib/wallet/signin.ts`, `freighter.ts`, `client.auth.walletChallenge/Verify` | `POST auth/wallet/challenge`, `auth/wallet/verify` | auth http + `wallet-challenge.ts` | `auth_challenges`, `user_wallets`, `users` | 15 named states; server provides the text to sign and verifies; testnet only; wallet logic not tested against real extension in repo tests (stated in `freighter.ts` header) |
| Session / sign out / sign out all | B | Account menu, Settings | AccountMenu, Settings | `auth.logout/logoutAll` | `POST auth/logout`, `auth/logout-all` | auth http | `auth_sessions` | no list of sessions (limit) |
| Onboarding | B | `/onboarding` | onboarding page | `auth.setProfile`, `organizations.create`, `acceptInvitation`, `auth.setWorkspace` | `auth/profile`, `registry/orgs`, `registry/invitations/accept`, `auth/workspace` | auth + registry http | `onboarding`, `organizations`, `memberships`, `invitations` | invite accept rate-limited server-side |
| Account audit | B | Settings | Settings | `auth.audit` | `GET auth/audit` | auth http | `auth_audit` | read-only, last 15 shown |
| Organizations (create, view, update) | B | onboarding, Organization | Organization.ProfileTab | `organizations.get/create/update` | `GET/POST registry/orgs`, `GET registry/orgs/:id`, `POST .../update` | `registry/http.ts` -> `service.ts` | `organizations` | only name/description/visibility editable; type/jurisdiction fixed; admin only |
| Org switching | B | Org selector, Settings | OrgSelector | `auth.setWorkspace` | `POST auth/workspace` | auth http | `users`/onboarding (last org) | |
| Members, roles, suspend, remove | B | Organization > Members | MembersTab | `organizations.members/setRole/setStatus/removeMember` | `GET orgs/:id/members`, `POST .../members/:u/role|status|remove` | registry http | `memberships` | roles Admin/Member only; last active admin guard (client + server); admin only |
| Reviewer grant | B | Members side panel | MembersTab | `setReviewer` | `POST orgs/:id/reviewers/:u/grant|revoke` | registry http | `org_reviewers` | separate grant, not a role |
| Invitations | B (no delivery) | Organization > Invitations | InvitationsTab | `invite`, `invitations`, `revokeInvitation` | `GET/POST orgs/:id/invitations`, `.../:i/revoke` | registry http | `invitations` | no email is sent (limit); one-time token returned once; Expired derived client-side |
| Wallets: view own, disconnect | B | `/wallets` | Wallets | `auth.removeWallet` | `POST auth/wallet/remove` | auth http | `user_wallets` | server refuses if it is the only sign-in method |
| Wallets: **link/verify a wallet** | **UI missing** | none (page text says "not built") | none | none | backend has `POST auth/wallet/link/challenge`, `auth/wallet/link/verify` | auth http | `user_wallets` | **Backend present, no UI** |
| Org wallet claims | P | Organization > Wallets (read) | OrgWallets | `organizations.claims`, `verifications` | `GET orgs/:id/wallets`, `.../wallet-verifications` | registry http | `org_wallets`, `wallet_verifications` | `POST orgs/:id/wallets` (claim) and `wallet-challenges` exist; no UI. Claims are "unproven" |
| Signer sets | Backend only | none | none | none | `POST/GET orgs/:id/signer-sets...` (needs RPC, 503 `CHAIN_UNAVAILABLE`) | registry http | `signer_set_snapshots` | no UI |
| Sessions (create/list/read) | B (local draft) | `/sessions`, `/sessions/new` | SessionsList, CreateSession | `sessions.list/get/create` | `GET/POST orgs/:id/sessions`, `GET .../:sid` | registry http | `sessions`, `activity` | only `label` accepted (1-80 chars); id server-generated 64-hex; "local draft" not on-chain |
| Session ready / reopen / close | **UI missing** | none | none | none | `POST .../:sid/ready|reopen|close` exist | registry http | `sessions` | **Backend present, no UI**; UI therefore cannot leave `configuring` |
| Participants | B | workspace tab | ParticipantsTab, CreateSession | `participants.list/add/remove` | `GET/POST .../participants`, `.../:u/remove` | registry http | `session_participants_v2` | admin + configuring only; must be org members |
| Obligations record/void/read | B | workspace tab | ObligationsTab, RecordObligation | `obligations.listBySession/record/void`, `assets.list` | `GET/POST .../obligations`, `.../:o/void`, `GET .../settlement` (assets) | registry http | `obligations`, `supported_assets_v2` | server validates every field and its message is shown; amount whole base units; asset code vs supported list (list empty means plain code accepted); admin + configuring. **No UI for `.../:o/update`** (backend route exists) |
| Netting | B | Netting tab | NettingTab | `netting.run`, `sessions.calculation/readiness` | `POST .../calculate`, `GET .../calculation`, `.../readiness` | registry http + `clearing.ts` | `calculations` | admin; calculation replaced on rerun; stale when inputs change |
| Calculation review | B | Approvals tab | ReviewPanel | `authorization.get/decide` | `GET .../authorization`, `POST .../authorization/approve|reject` | registry http + `authorization.ts` | `authorization_decisions`, `authorization_invalidations` | reviewer grant; one decision per calculation; separation of duties by server; reject reason 1-500 |
| Settlement preparation | B | Settlement tab | SettlementPanel | `settlement.prepare/list/batch` | `POST .../settlement/prepare`, `GET .../settlement`, `.../batches/:b` | registry http + `settlement.ts` | `settlement_batches_v2`, `settlement_instructions_v2`, `..._invalidations_v2` | admin; needs approved current calculation; attempt counter for re-prepare |
| Settlement batch review | B | Settlement tab | SettlementPanel | `settlement.decide` | `POST .../batches/:b/approve|reject` | registry http | `settlement_batch_reviews_v2` | reviewer, not preparer; must send `instructionsHash` of the batch seen; client also re-checks reconciliation (`lib/settlement/diff.ts`) |
| Execution record (read) | P | Settlement tab | SettlementTab, StageRail | `settlement.execution/attempts` | `GET .../batches/:b/execution`, `.../execution/attempts` | registry http + `settlement-state.ts` | `settlement_executions`, `settlement_attempts`, ... | **read only**. Backend can `start` an execution and `begin` attempts (routes exist) but no UI calls them |
| **Sign** | PL | Settlement tab | NotSupported card | none | none over HTTP | none | `settlement_attempt_transactions` table exists | "No route exists" per UI text |
| **Submit** | PL | same | same | none | none | none | | |
| **Verify / Confirmed** | PL | same | StageRail | none | none | none | | `stages.ts`: Confirmed only with `verifiedReadBack===true`; the adapter always passes `false` |
| Activity | D | `/activity`, session tab, Overview | ActivityView | `sessions.get` (`workspace.activity.items`) | `GET .../sessions/:sid` | registry http | `activity` | per-session only; no org-level events |
| Overview / global lists | D | `/`, `/obligations`, `/approvals`, `/activity` | see 01 | `lib/derived/*`, `lib/activity/derive.ts` | many per-session GETs | | | **capped at 10 sessions**, labelled |
| Notifications | PH | bell | `/notifications` | `NOT_SUPPORTED` constant | none | none | none | |
| Search (global) | PL | command panel | CommandPanel | cache read (`qc.getQueryData(["sessions", org])`) | none | none | | searches only loaded session labels |
| Discover | PH | `/discover` | page | none | none | none | none | see below |
| Sample-data mode | F | env flag | MockAdapter | `NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1` | none | | | bannered |

## Wallet status (Freighter / Stellar Wallet SDK)
- `@stellar/freighter-api` 6.0.1 is used for: detection (`isConnected`, `isAllowed`), `requestAccess`, `getAddress`, `getNetwork`, `signMessage` (SEP-53 sign-in). Testnet passphrase enforced; anything else is `WRONG_NETWORK`.
- **Stellar Wallet SDK (`@stellar/typescript-wallet-sdk`) and Stellar Wallets Kit are not installed or used** (decision D4 recorded in `lib/wallet/freighter.ts` header: Freighter API pinned, Wallets Kit not used). Provider is always shown as "Freighter".
- No transaction signing anywhere in `apps/web`.

## Discover: what would be needed
Today: no route, no indexer, no public API; the console binds to loopback and refuses foreign origins (`proxy.ts` of console, `Host`/`Origin` guards). No query of on-chain obligations or settlement transactions is possible: all Tobin "obligations" are application records in SQLite; sessions are "local drafts". The backend has `settlement_attempt_transactions` and `signer_set_snapshots` tables, and `apps/web-console/app/api/stellar/*` + `/api/rpc` (owner-run Testnet tools, not exposed through the web proxy), but nothing indexes contracts. A genuine explorer would need (as the page itself lists): an indexer over Tobin's contracts (the repo has `contracts/` Rust; no indexer found), a public read-only API without sign-in, a verification step to report confirmation (none exists), and a privacy policy separating private org records. Whether on-chain obligation/settlement data even exists from this app: **it does not** (nothing is submitted).

## Hard-coded, mock and static values
- `SESSION_REQUEST_CAP = 10` (`lib/derived/overview.ts`), `PAGE_SIZE = 10` (`lib/sessions/list.ts`), proxy `MAX_BODY_BYTES = 8 KiB`, reject reason max 500, void reason 200, label 80, commands list 50 loaded sessions, Settings audit 15 events, "Stellar Testnet" literals (EnvIndicator, Organization, Wallets, layout footers), `TESTNET_PASSPHRASE`, sign timeout 120s, INSTITUTION_LABEL mapping, `BACKEND_RECORDS` in `stages.ts` (only "prepared" recorded).
- Fonts: Geist stands in for "Gellix" (design spec) [layout.tsx comment].
- Mock: `MockAdapter` only with the env flag.
- Static copy about Discover and Notifications.

## Where the 10-session cap affects the experience
`selectForReading()` sorts by `createdAt` desc and slices 10. Consumers: Overview (6 counts, attention, relevant, recent; ~3 requests/session), `/obligations`, `/approvals`, `/activity`, and `useApprovalsPending` (nav badge, Overview quick link). Effects: totals other than "Clearing sessions" and "Members" are partial; older sessions' pending approvals are invisible globally (including the badge); search on `/obligations` covers only those sessions; every affected page shows `DerivedNote` "Showing 10 of N sessions, so these totals are not complete" [screenshot]. `/sessions` list, session workspace and command panel loaded-session list are not capped (but the command panel only knows sessions already fetched). Reason: no cross-session endpoints (`docs/web-app-plan.md` D6, restated in `overview.ts` header).

## UI suggests more than the backend supports? (flags)
- Nav item "Wallets" and the header wallet popover imply connecting/linking; linking exists in backend but not UI; connection alone grants nothing (UI states so).
- Stepper "Settlement" and the "Sign / Submit / Verify" steps are shown as steps but marked Not supported (honest).
- "Ready or closed" stat and the workflow labels imply a lifecycle the UI cannot drive.
- Provenance filter values `chain-read` / `chain-confirmed` imply on-chain records that this app cannot produce.
- Bell icon is rendered (muted, crossed) with an explanatory page; command-panel "Search" is a page jumper.
- Org visibility "Public" in onboarding/profile: nothing public exists (no Discover); label text may imply publication. Unknown how backend uses it beyond the field.
- Nothing in the UI claims a settlement is confirmed; `test/no-confirmed.test.ts` scans sources for the Confirmed label [per its description; not run].

## Backend limits that constrain a redesign
No cross-session/aggregate endpoints; no search; no notifications; no pagination/sorting server-side; no email delivery; no session list for auth sessions; no sign/submit/verify routes; no org-level activity; single reviewer decision (no N-of-M); only Admin/Member + Reviewer grant (no Owner/Operator/Viewer); no provider info for wallets; invitation state has pending/accepted/revoked only.
