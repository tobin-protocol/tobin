# Demo recording guide (SCF reviewer demonstration)

**DRAFT: to be confirmed by the live rehearsal once the demo accounts exist.** The accounts Demo Admin, Demo Reviewer and Demo Participant are not created yet; the steps below assume they will exist. Nothing here has been rehearsed on the deployed system.

**Status:** guide for recording a demonstration of the hosted web application (https://app.tobinprotocol.xyz) on Stellar Testnet, 2026-11-09.
**Evidence basis:** the verified source journey in `apps/web` and `apps/web-console` at `origin/main` `8b2030d` ([implementation-truth-matrix.md](implementation-truth-matrix.md)); the Testnet records in [testnet-engineering-evidence.md](testnet-engineering-evidence.md). Label: **our own recommended documentation**.

## 1. Recommended recording order

1. Sign in and the workspace.
2. Dashboard.
3. Create a session with participants.
4. Record obligations.
5. Run netting and show conservation.
6. Reviewer approves the calculation.
7. Admin prepares the settlement batch.
8. A different reviewer approves the batch (or the same reviewer who approved the calculation, see section 4).
9. Show the execution step (read-only).
10. Switch to the repository files and the Horizon re-read (the Testnet evidence, shown separately).
11. Limitations and closing statement.

## 2. Accounts and one browser profile per identity

| Identity | Role | Used for |
|---|---|---|
| Demo Admin | organization administrator | create the session, add participants, record obligations, run netting, prepare the batch |
| Demo Reviewer | member with the reviewer grant (an administrator grants it) | approve the calculation; approve the batch |
| Demo Participant | member, added to the session as a participant | appears as a debtor or creditor; may be shown viewing the session |

Use one browser profile (or one private window per profile) for each identity, signed in at the same time, so no recording step needs a sign-out. The calculation approval rule blocks whoever ran the calculation or recorded or changed any of its obligations, so the administrator cannot approve their own calculation; the reviewer must be a different account.

## 3. Pages to show and what to do

| Step | Identity | Page and action | Say |
|---|---|---|---|
| Sign in | Demo Admin | Sign-in page, password sign-in | The hosted app is Testnet only; registration is open on this deployment and email is not verified |
| Workspace | Demo Admin | Choose the demo organization | Organization membership and roles are separate from any wallet |
| Dashboard | Demo Admin | Overview | Counts are real. Status figures are derived from the newest 10 sessions, and the page says how many sessions it read |
| Create session | Demo Admin | Sessions, New session; add the participants | A session is an application record, not an on-chain object |
| Obligations | Demo Admin | Session, record 3 obligations in the supported asset (a triangle such as A owes B 100, B owes C 100, C owes A 50) | Whole base units; a void is one-way; there is no edit feature in this app |
| Netting | Demo Admin | Run netting; show the net positions summing to zero | Net = outgoing minus incoming; conservation is checked and a result that does not sum to zero is discarded. The engine produces a default plan |
| Approve calculation | Demo Reviewer | Reviews or the session's authorization panel; approve the calculation | A reviewer decision is a database record, not a signature. The person who ran the calculation or recorded its obligations is blocked |
| Prepare batch | Demo Admin | Session, settlement tab, prepare the batch | Instructions for the net amounts only. A prepared batch is an application record, not a contract object |
| Approve batch | Demo Reviewer | Settlement tab, approve the batch | The preparer cannot approve their own batch. Today the person who approved the calculation may approve the batch; a rule requiring a different reviewer is planned, not implemented |
| Execution | Demo Admin | Settlement tab, execution section | This step is read-only in the hosted app. Approving a batch does not execute it. Signing and submission happen in separate, local, owner-run tools |

## 4. Screenshots to capture

Sign-in; workspace; dashboard with the coverage sentence; the session with participants; the obligation list; the netting result with the zero-sum line; the reviewer's approval of the calculation (including a blocked attempt by Demo Admin, if shown); the prepared batch; the batch approval; the read-only execution step; Discover with "No data" tiles. Use the same window width for all. Do not capture any page that shows an environment value, a token or an account's private details.

## 5. The Testnet evidence, shown separately

Show [testnet-engineering-evidence.md](testnet-engineering-evidence.md) and the files it cites (`settlement-reconciliation-2026-11-07.json`, `settlement-run-2026-11-07.jsonl`, `contracts/deployments/testnet.json`) as **repository files**, then the Horizon re-read of 2026-11-09 (a read-only GET of `https://horizon-testnet.stellar.org/transactions/<hash>`; ledger, source account and fee matched; the contract call contents were not decoded). State explicitly that this is a fixed, hard-coded one-unit scenario run by local owner tools. It is **not** the demo batch: no code connects a database-approved batch to the Stellar path.

## 6. What to say about limitations

Testnet only, test assets; same-author evidence and one run; no independent security review and no fuzzing; the hosted app records and prepares but does not sign, submit or confirm; confirmed outcomes are not written back to application records; registration is open and email is unverified; SQLite on one Railway volume, no backup or restore test; wallet and multisig verification is incomplete (Freighter in Edge only); resources and fees are not measured; netting benefit on real flows is an unproven hypothesis.

## 7. What not to claim

- End-to-end hosted settlement, or that approving a batch executes it.
- An institutional pilot, customers, volume, users, partners, revenue or letters of intent.
- Independent audit or review.
- Mainnet readiness (Mainnet is not authorized, not built and not part of this submission).
- On-chain indexing (Discover lists opted-in organizations from the application database; its statistics are null).
- A universal independent-reviewer rule (only the preparer is blocked from approving their batch).
- Contract enforcement of the 10-ledger authorization lifetime (it is a constant in the owner tool and is not checked on attach).
- That the Testnet transactions came from the demo organization's session or batch.

## 8. Closing statement

"What you saw is a Testnet application that records obligations, computes net positions, requires reviewer approval of the exact result and prepares settlement instructions. The next planned milestones, all on Stellar Testnet, are MVP-1.6 (institutional operations and reconciliation: persisting read-backs and reconciling an approved batch), MVP-1.7 (security, governance and infrastructure hardening) and MVP-1.8 (controlled institutional usage). They are planned, not started."

## 9. Things to avoid on screen

Passwords and the sign-in form while typing; environment values, the proxy secret, deployment dashboards with variables; personal data and private email addresses; the browser's saved-password prompts. **Do not click "Connect a wallet" (or "Connect Freighter") while signed in:** it runs wallet sign-in and switches to a different or new wallet-only account, ending the current session. Wallet linking is not available in the new interface.

## 10. Known on-screen issues (say nothing unprompted; do not hide them if asked)

- The Discover Institutions tab's empty state reads "Public settlement data is not available yet." (the wrong noun for institutions; `apps/web/lib/discover/view.ts:26`). Discover shows "No data" for three figures and 0 institutions opted in until an organization chooses public visibility.
- The sessions status filter acts on the current page of 10 rows only; search, sort and paging happen in the browser.
- An unknown route redirects a signed-out visitor to the sign-in page.
- Notifications, global search, password change and the session list are placeholders.
