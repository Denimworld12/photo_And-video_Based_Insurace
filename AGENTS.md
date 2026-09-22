# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Layout

Three independent pieces: `backend/` (Express + Mongoose API), `frontend/`, and the Python
computer-vision pipeline.

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

- `npm test` covers the pipeline-integration contract, OTP verification, request validation and
  upload handling. There is no HTTP-level or database-level test harness; changes to controllers
  need manual verification against a running server.
- The backend starts without MongoDB: policies fall back to seed data, claims to an in-memory cache,
  and login issues a development-only farmer session. None of these fallbacks apply when
  `NODE_ENV=production`, where `server.js` refuses to start without `MONGODB_URI`, `ALLOWED_ORIGINS`
  and real OTP delivery.
- `backend/.env.example` is the authoritative list of configuration; keep it current when adding a
  variable.

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
