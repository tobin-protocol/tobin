# Web app redesign (PRD: Tobin Web App UI/UX Redesign, Unified)

Input: `docs/Tobin_Web_App_UI_UX_Redesign_PRD_Unified.docx` (designer brief, owner's document).

| Document | What it answers |
|---|---|
| [application-audit.md](application-audit.md) | PRD 20.1: what the app is today, its usability problems, and which are design problems and which are backend limits |
| [gap-analysis.md](gap-analysis.md) | PRD section by section: met, implemented in this pass, not implemented, backend limit, conflict |
| `../web-app-plan.md` section 13 | Decisions recorded for this redesign pass |

The implemented app is the high-fidelity result. Wireframes, flow diagrams and a clickable prototype (PRD 20) were not produced: the owner asked for the changes to be implemented in `apps/web`. Screenshots of the new behaviour: `docs/screenshots/stage-f/` (only 1440px is committed).

## Rewrite (2026-11-09 onward)

| Document | What it is |
|---|---|
| [spec.md](spec.md) | The design specification for the rewrite (access model, light design system, screens) |
| [plan.md](plan.md) | Route map, modules, what is kept and deleted, phases R1 to R5, risks |
| [verified.md](verified.md) | The audit's claims checked against the source, and where the audit or spec was wrong |
| [discover-contract.md](discover-contract.md) | The public data contract a backend would need for Discover |
| [contrast.md](contrast.md) | Computed contrast of every text and background pair (generated) |
| [audit/](audit/) | The read-only audit of the app before the rewrite |
