# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Layout

Three independent parts: `backend/` (Express + MongoDB), `frontend/` (React 19 via CRACO),
`cropfarmPY/` (the Python assessment pipeline). `readme.md` documents setup, every environment
variable and the full API surface; keep it in step when you change any of them.

`pipeline.py` at the repo root is a standalone experiment and is **not** wired into the app.
The backend spawns `cropfarmPY/main_pipeline.py` from `backend/src/services/python.service.js`.

## Frontend design system

`frontend/src/index.css` is the single source of truth for every colour, type step, radius and
spacing step — a "harvest ledger" palette (parchment canvas, ink text, one honey-amber accent)
expressed as a Tailwind v4 `@theme` block plus a custom daisyUI theme named `harvest`.

Rules that the whole of `src/` already follows, and that changes must keep:

- No hardcoded hex, inline style colours or ad-hoc px sizes. Add the value to `index.css` first.
  The one unavoidable exception is the canvas photo watermark, which reads the palette at runtime
  through `src/utils/theme.js`.
- No emoji anywhere in the UI. Use `lucide-react`.
- No drop shadows. Surfaces separate by warm colour-temperature shifts and hairline borders.
- No blue, red or other saturated primaries. Because the status colour range is deliberately
  narrow, **no state may be signalled by colour alone** — pair it with an icon and a word.
- Shared UI lives in `src/components/ui/` (Field, Modal, ConfirmDialog, Toast, States, PageHeader,
  StatTile, StatusBadge, Pagination). Reach for these before writing a new one; `StatusBadge` is the
  single claim-status vocabulary, keyed exactly on the underscore status enum in
  `backend/src/models/Claim.js` — the only spelling the backend writes.

Gotcha: the design system's layout spacing steps are named (`spacing-hair`, `-tight`, `-section`,
`-gutter`, `-bay`, `-chapter`), not numbered. Binding `4px` to the numeric key `4` would redefine
Tailwind's whole numeric scale and collapse every `w-4 h-4` icon to 4px.

## Verification

There is **no automated test suite** anywhere in this repo — `frontend`'s `npm test` has no test
files and `backend`'s exits with an error. Verify frontend work with `cd frontend && CI=true npx
craco build` (CI=true turns lint warnings into failures) and by exercising the pages in a browser.

Form components must be defined at module scope. A component declared inside a render body gets a
new type each render, so React remounts its inputs and the field loses focus on every keystroke.

## Known gaps

Recorded in `readme.md` under "Known gaps": `nodemon` is undeclared in `backend/package.json`,
`frontend/.env.production` still holds a placeholder API URL, `OTP_MOCK_MODE` defaults to on and
accepts any code, and the `Lateral` webfont files are not vendored.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
