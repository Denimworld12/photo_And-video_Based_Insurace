# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Layout

Three independent pieces: `backend/` (Express + Mongoose API), `frontend/` (React 19 via CRACO), and
the Python computer-vision pipeline in `cropfarmPY/`. `readme.md` documents setup, every environment
variable and the full API surface; keep it in step when you change any of them.

## Backend and Python pipeline

- `backend/src/services/python.service.js` shells out to **`cropfarmPY/main_pipeline.py`** and
  nothing else. The root **`pipeline.py` is not wired to the backend** — it is a standalone script
  with a different CLI (positional `<img> <lat> <lon>` triples plus a GeoJSON parcel file). Changing
  it does not affect the claim flow.
- The two sides talk over stdout JSON. The contract is documented in `main_pipeline.py`'s module
  docstring; `assertUsableResult` in `python.service.js` enforces it on the Node side. Keep both in
  step when adding fields.
- The pipeline **measures**; the backend **decides**. `main_pipeline.py` emits its own
  recommendation plus the calculated `payout_amount`, and `determineDecision` applies the
  `CLAIM_AUTO_APPROVE_THRESHOLD` / `CLAIM_REJECT_THRESHOLD` thresholds. The two use different
  thresholds by design — do not make the pipeline zero out figures based on its own verdict.
- `main_pipeline.py` writes **only** the result JSON to stdout; every failure goes to stderr with a
  non-zero exit code. Anything printed to stdout from a module breaks the caller's `JSON.parse`.
- A pipeline failure must never produce an automatic approval or rejection. It routes to
  `manual_review` via `undeterminedDecision`, and `fallbackResult` deliberately reports null damage
  and a zero payout rather than stand-in numbers.
- Python deps are in `cropfarmPY/requirements.txt` (needs `requests`, `numpy`, `opencv-python`,
  `Pillow`). The interpreter is set by `PYTHON_COMMAND`.

## Running and testing the backend

```bash
cd backend
npm install
npm test          # node --test, no database or network needed
npm run dev       # nodemon; JWT_SECRET must be set
```

- `npm test` covers the pipeline-integration contract, OTP verification, request validation,
  upload handling, Claim schema defaults, and controller helpers exported under a `_` prefix. There
  is no HTTP-level or database-level test harness; controller request flows need manual
  verification against a running server.
- The backend starts without MongoDB: policies fall back to seed data, claims to an in-memory cache,
  and login issues a development-only farmer session. None of these fallbacks apply when
  `NODE_ENV=production`, where `server.js` refuses to start without `MONGODB_URI`, `ALLOWED_ORIGINS`
  and real OTP delivery.
- `backend/.env.example` is the authoritative list of configuration; keep it current when adding a
  variable.

## Frontend design system

`frontend/src/index.css` is the single source of truth for every colour, type step, radius and
spacing step — a "harvest ledger" palette (parchment canvas, ink text, one honey-amber accent)
expressed as a Tailwind v4 `@theme` block plus a custom daisyUI theme named `harvest`.

Rules that the whole of `frontend/src/` already follows, and that changes must keep:

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
- Form components must be defined at module scope. A component declared inside a render body gets
  a new type each render, so React remounts its inputs and the field loses focus on every keystroke.

Gotcha: the design system's layout spacing steps are named (`spacing-hair`, `-tight`, `-section`,
`-gutter`, `-bay`, `-chapter`), not numbered. Binding `4px` to the numeric key `4` would redefine
Tailwind's whole numeric scale and collapse every `w-4 h-4` icon to 4px.

The frontend has **no test suite** (`npm test` finds no test files). Verify frontend work with
`cd frontend && CI=true npx craco build` (CI=true turns lint warnings into failures) and by
exercising the pages in a browser.

## Conventions

- No emoji in log output, error strings or user-facing text anywhere in `backend/`, `cropfarmPY/`
  or `pipeline.py`. Logs use a `[AREA:ACTION]` prefix instead.
- Ownership is enforced in the controller, not the route: claim endpoints resolve a claim through
  `loadAccessibleClaim`, which reports another user's claim as 404. Admin-only routes go through
  `roleGuard('admin')`.
- Every endpoint taking user input validates it with a Joi schema from `src/middleware/validate.js`.
  On `/api/claims/upload`, multer runs before validation, so a rejected request must clean up the
  file it already wrote to disk (`removeOrphanedUploads`).
- `uploads/` is served as static content. The stored file extension comes from the media-type
  allowlist in `src/middleware/upload.js`, never from the client's filename.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
