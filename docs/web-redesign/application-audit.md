# Application audit (PRD 20.1)

Scope: `apps/web` after Phases A to E, before the redesign pass. Every finding is labelled **Design** (fixable in the UI) or **Backend** (the console API cannot provide it; shown as Not supported or Derived, never faked).

## 1. Route inventory

Top navigation (seven): Overview, Sessions, Obligations, Activity, Wallets, Organization, Settings. Outside the top nav: Approvals (`/approvals`, reachable from the Overview, the badge and the session workspace), Notifications (Not supported), Sign-in, Onboarding, `/dev/components`. Session workspace `/sessions/[id]` tabs: Overview, Participants, Obligations, Netting, Approvals, Settlement, Activity. Added in this pass: `/discover` (Not supported, outside the top nav).

## 2. Workflows

Sign in, onboard, create a session, add participants, record and void obligations, run netting, review a calculation (one reviewer), prepare a settlement batch, review the batch, read the execution record. Signing, submitting and verifying have no backend routes.

## 3. Findings

| # | Finding | Kind | Resolution in this pass |
|---|---|---|---|
| 1 | Overview listed counts but no sessions; the user could not tell which session to open | Design | "Sessions that matter now" (up to 5, ranked by what needs the viewer), each linking to the right tab |
| 2 | Competing actions at the top of the Overview | Design | One primary "Create session" (disabled with a reason for non-admins) plus a Quick links group |
| 3 | A role-help card on the Overview repeated Settings | Design | Removed; role help stays in Settings |
| 4 | Hints such as "Real" and "Derived" were jargon | Design | Plain hints ("All sessions", "From the sessions read") |
| 5 | The workspace Overview mixed application, calculated, approval, settlement and chain facts | Design | "State, layer by layer": five layers; the blockchain layer is always "Not recorded" |
| 6 | The Stepper was not navigable | Design | Each group links to its section |
| 7 | The global Approvals list showed only names | Design | Amounts (gross, net moved, instruction totals) and organization |
| 8 | A reviewer saw a decision form without the thing being decided | Design | "What is being reviewed" card |
| 9 | Running netting replaced a calculation with no confirmation (PRD 16.5) | Design | Confirmation dialog stating what is included and left out |
| 10 | Activity rows named no entity and gave no way to reach it | Design | Entity label and "Open <section>" link |
| 11 | Global obligations rows opened the session, not the obligation | Design | Deep link `?tab=obligations&ob=<id>`; history shows transitions |
| 12 | Invitation attention row was a disabled "Opens in Phase E" | Design | Links to the invitations tab |
| 13 | Sessions list gave no sense of content | Design | Participants and obligations counts for visible rows (derived) |
| 14 | `ButtonLink` dropped `aria-label` and `title` | Design (defect) | Fixed |
| 15 | Some mobile tap targets under 44px (session links, Stepper) | Design | Fixed; scan shows none under 44px at 390px |
| 16 | Overview, Obligations, Activity and Approvals pages cover at most 10 sessions | Backend (no cross-session endpoints) | Unchanged; each says "Showing N of M sessions" |
| 17 | No notifications, global search, cross-org sessions, N-of-M approval, sign/submit/verify, Confirmed state, active-session list | Backend | Not supported pages or absent; nothing mocked |
| 18 | Invitation "Rejected" state | Backend (pending, accepted, revoked; Expired derived) | Not shown |
| 19 | Global obligations cannot be sorted server-side | Backend | Left; documented gap |
| 20 | Approvals page and tab, Activity page and tab overlap | Design (accepted) | Kept: one is cross-session, one per-session |

## 4. Opportunities not taken

Wallet provider logos (not returned by the API), a new visual identity (the PRD asks for structure, not brand), editing obligations (deferred).
