# Gap analysis: PRD vs the application

Legend: **Met** (already satisfied) · **Done** (implemented in this pass) · **Open** (design gap not implemented) · **Backend** (limit of the console API) · **Conflict** (PRD vs a recorded decision).

| PRD section | Requirement | Status | Notes |
|---|---|---|---|
| 2-3 | Preserve supported workflows; do not present unsupported features as working | Met | Not-supported pages; `no-confirmed` source-scan test |
| 2.3 / 20.2 | Seven main destinations; Discover only proposed | Done | Discover is a Not-supported page outside the top nav; the command panel lists "Discover (not available)" |
| 6.2 | Overview answers which sessions are relevant | Done | "Sessions that matter now" |
| 6.x | Clear primary action | Done | Single primary Create session |
| 7.5 | Separate application, calculated, approval, settlement-prep and blockchain state | Done | State layers; chain "Not recorded" |
| 8 | Session workspace as the heart; stepper | Done | Stepper links; at-a-glance section links |
| 9 | Obligations: view, record, void, history | Met / Done | Deep link, transition text. Edit is deferred |
| 10 | Netting: inputs, results, excluded | Met / Done | Confirmation before run |
| 11 | Approvals: show what is reviewed | Done | Amounts in list; "What is being reviewed" |
| 12.2 | Activity record to entity | Done | Entity label and link (to the section, since the API gives no entity id) |
| 13 | Wallets, Organization, Settings | Met | Provider logos: Backend |
| 14 | Notifications, global search | Backend | Not supported |
| 15 | Mobile: no regressions | Met | Bottom sheet kept; tap targets fixed; 390px scans clean |
| 16.5 | Confirmation for consequential actions | Done (netting) / Met (others) | Reject, void, remove, suspend already confirm |
| 17 | Accessibility preserved | Met | axe: no violations on 66 page and width combinations; keyboard walkthrough passes |
| 18 | Invitation Rejected state | Backend | Not shown |
| 19 | Sortable global lists | Open | Global obligations sort not implemented |
| 20 | Deliverables: audit, IA, flows, wireframes, hi-fi, prototype | Partly | Audit and gap analysis written; the implemented app is the hi-fi; wireframes, flow diagrams and prototype not produced |
| 22 | Roles | Conflict | PRD role names differ from the real Admin, Member, Reviewer; decision D5 keeps the real ones |
| 24 | Discover explorer | Backend | Needs an indexer, public API, verification, privacy policy; the page says so |
