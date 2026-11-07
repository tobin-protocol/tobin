# Session experience: acceptance matrix

Status values: PASS, FAIL, BLOCKED, NOT TESTED. Evidence is the real-browser journey (74 checks per width after the navigation change; 74/74 at 1200px and 74/74 at 420px; Chrome 156.0.8078.81) unless stated.

| # | Requirement | Status | Evidence / note |
|---|---|---|---|
| 1 | /sessions loads in a real browser | PASS | journey A3, both widths |
| 2 | Organization context visible | PASS | selector shows "Demo Institution (fixture data)" |
| 3 | Fixture session listed with name, short ID, status, participants, date, provenance badge, activity | PASS | A3 row check |
| 4 | Full session ID available | PASS | title on the short ID; full ID in Overview |
| 5 | Session opens from the listing (mouse and keyboard) | PASS | A3, G |
| 6 | Loading state | PASS | test-delayed request |
| 7 | Error state with retry | PASS | test-injected 500 |
| 8 | Empty state | NOT TESTED | browser: unit-tested only (`listingState`) |
| 9 | Creation form usable, required validation | PASS | B |
| 10 | Invalid submission handled clearly | PASS | defect 2 fixed |
| 11 | Valid submission creates a local draft that is listed | PASS | B |
| 12 | UI states the draft is not on-chain | PASS | form, notice, banner |
| 13 | No UI field for session ID or provenance | PASS | B (one input) |
| 14 | Five tabs reachable, banner above every tab | PASS | C |
| 15 | Fixture data labelled FIXTURE | PASS | D |
| 16 | Nets A +30, B -20, C -10; gross 250; moved 30 | PASS | D |
| 17 | Draft: Local draft banner, nothing fabricated | PASS | E |
| 18 | Chain-read / chain-confirmed workspace in the browser | NOT TESTED | no route or reader exists by design; unit tests only |
| 19 | Organization isolation with uniform 404 | PASS | F |
| 20 | No horizontal overflow at 420px | PASS | every view |
| 21 | Tabs accessible at 420px | PASS | wrap to two rows, all visible |
| 22 | Tables readable at 420px | PASS | listing becomes cards after defect 3 fix |
| 23 | Desktop layout | PASS | 1200px |
| 24 | Keyboard reachability and visible focus | PASS | G |
| 25 | Accessible names, labels, captions, tab selected state | PASS | structure audit |
| 26 | Contrast sufficient | NOT TESTED | not measured; dark theme only |
| 27 | Screen-reader behaviour | NOT TESTED | |
| 28 | Light theme | NOT TESTED | |
| 29 | /sessions reachable from existing console navigation | PASS | Option A approved by the owner: new route group app/(institution) with its own layout and an Institution nav (Sessions link, aria-current active state, keyboard reachable, 420px and 1200px). The root layout is unchanged; /w0 and / have no such nav and no link to /sessions (journey step N). Note: / and /w0 still do not link to Sessions, by design |
| 30 | Root header suitable for the current experience | PASS | accurate for local use; decision needed for hosted use (see issues) |
| 31 | Screenshots at both widths | PASS | 8 views x 2 widths |
| 32 | No browser console errors | PASS | H |
| 33 | No wallet, signing, Stellar dependency, chain reader, new endpoint, database or identity change | PASS | changes limited to the session component, session CSS, the institutional layout and nav component, one package script, the journey and docs; the 74-check journey covers /w0 and / having no link to /sessions |

## Command results
| Command | Result |
|---|---|
| `npm run build:console` (repository root; re-run for this review, after the navigation change) | succeeded. Route list: see "Route inventory" below |
| `TOBIN_WIDTH=1200 node test/browser/sessions-journey.mjs <absolute dir>` | 74 of 74 passed |
| `TOBIN_WIDTH=420 node test/browser/sessions-journey.mjs <absolute dir>` | 74 of 74 passed |
| `npm test` (web-console; includes registry 8 and sessions 10) | 285 tests, 277 pass, 0 fail, 8 skipped |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Release scan (`scanFile`), LATEST run (after the navigation change): institution nav component, `app/(institution)`, `test/browser`, mvp-1.2 docs | 13 files, 0 findings |
| Release scan, earlier run (before the navigation change; historical): registry, session component, session CSS, tests, W2 and mvp-1.2 files | 35 files, 0 findings. The latest run covered a narrower file set, so the registry and unit tests were not re-scanned after navigation; they were not modified by the navigation change |

## Route inventory (from the production build output of this review)
Public URL paths (page routes): `/`, `/sessions`, `/w0`, plus the framework `/_not-found`.
API routes: `/api/bootstrap`, `/api/registry/[...path]`, `/api/rpc`, `/api/w0/[...path]`.
All are dynamic (server-rendered on demand) except `/_not-found` (static). Proxy (middleware) is active.
The route group directory `app/(institution)` is a source-tree name only; Next.js does not include it in the URL, so the Sessions page is `/sessions`. Routes added by MVP-1.2 work: `/sessions` and `/api/registry/[...path]`. `/`, `/w0`, `/api/bootstrap`, `/api/rpc` and `/api/w0/[...path]` pre-date it.

## Execution context
- Browser: headless Chrome 156.0.8078.81, viewport emulation at 1200x1500 and 420x1500; not a physical mobile device, no touch.
- Dark theme only; the light theme was not rendered.
- The existing W0 journey was not re-run.
- NOT TESTED in a browser: the empty-list state, and chain-read and chain-confirmed states.
- NOT COMPLETED: screen-reader verification and contrast-ratio measurement.
- Desktop navigation screenshot (`screenshots/navigation-1200.png`) inspected by eye in the final review: nav aligned with the header and content edges, active Sessions entry visible, identity banner visible, no overlap, clipping or overflow. The 420px one was inspected earlier.

Verdict: READY FOR REVIEW. Items 8, 18, 26, 27 and 28 are not tested.
