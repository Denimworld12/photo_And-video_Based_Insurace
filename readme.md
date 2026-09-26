<p align="center">
  <img src="frontend/public/logo192.png" alt="PBI AgriInsure Logo" width="120" />
</p>

<h1 align="center">PBI AgriInsure</h1>

<p align="center">
  <strong>AI-Powered Photo &amp; Video Based Crop Insurance Platform</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.1-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Python-3.8+-3776AB?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/Gemini-AI-4285F4?logo=google" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-06B6D4?logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8" alt="PWA" />
</p>

---

## Contents

- [About](#about)
- [How a claim flows](#how-a-claim-flows)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running the application](#running-the-application)
- [API reference](#api-reference)
- [The Python pipeline](#the-python-pipeline)
- [Design system](#design-system)
- [Building for production](#building-for-production)
- [Troubleshooting](#troubleshooting)
- [Known gaps](#known-gaps)

---

## About

PBI AgriInsure lets a farmer file a crop damage claim from their phone camera instead of waiting for a field
inspector. The farmer photographs the four corners of their field and the damaged crop; the platform verifies the
evidence automatically and produces a damage assessment and a suggested payout, which an administrator reviews
before any money moves.

Verification does not rely on a single signal. Each claim is checked for:

- **Location** — GPS coordinates captured with the photo, matched against the insured parcel.
- **Damage** — vegetation indices (Excess Green / Excess Red) and AI vision analysis of the crop.
- **Weather** — the reported cause (flood, drought, hail) compared with the weather at the field location.
- **Authenticity** — EXIF metadata consistency and image manipulation checks.

Claims are then scored against configurable thresholds and either auto-approved, sent for manual review, or
auto-rejected. An administrator has the final decision on every payout.

### Roles

| Role | Can do |
|------|--------|
| **Farmer** | Browse policies, file claims, capture GPS-tagged evidence, track status, read the AI assessment, download a PDF report, resubmit a rejected claim |
| **Administrator** | Review and approve or reject claims with a payout amount, manage policies, activate and deactivate accounts, read the audit log |

A user becomes an administrator by signing in with the phone number in `ADMIN_PHONE_NUMBER`.

---

## How a claim flows

```
Farmer                        Backend                      Python pipeline
  |                              |                                |
  |-- POST /api/claims/initialize ->  create claim record         |
  |<- documentId ----------------|                                |
  |                              |                                |
  |-- POST /api/claims/upload x5 ->  store photo on Cloudinary     |
  |   (image + lat/lon + client_ts)  read EXIF, keep coordinates   |
  |                              |                                |
  |-- POST /api/claims/complete -->  spawn main_pipeline.py -----> | analyse images
  |                              |                                | verify location
  |                              |                                | check weather
  |                              |<---- JSON assessment ----------| score damage
  |                              |  apply approve/reject thresholds
  |<- GET /api/claims/results/:id -  assessment + suggested payout |
  |                              |                                |
  |                       Administrator reviews and decides
  |<---------------------- notification + payout ------------------|
```

---

## Tech stack

### Frontend (`frontend/`)

| | |
|---|---|
| Framework | React 19.1 with React Router 7 |
| Build | CRACO over Create React App (`react-scripts` 5) |
| Styling | Tailwind CSS v4 with daisyUI 5, single custom theme (see [Design system](#design-system)) |
| Icons | `lucide-react` — the UI contains no emoji |
| Motion | `framer-motion`, `gsap` |
| HTTP | `axios`, with a bearer-token request interceptor and a 401 redirect |
| PDF | `jspdf` for the farmer's downloadable assessment report |
| Offline | Service worker registration for PWA install and asset caching |

### Backend (`backend/`)

| | |
|---|---|
| Runtime | Node.js with Express |
| Database | MongoDB via Mongoose |
| Auth | Phone number and OTP, issuing a JWT |
| SMS | Twilio (mockable — see `OTP_MOCK_MODE`) |
| Media | Cloudinary, with `multer` for uploads and `sharp` for processing |
| Metadata | `exifr` for reading photo EXIF |
| AI | `@google/generative-ai` (Gemini) for the plain-language claim summary |
| Hardening | `helmet`, `cors`, `express-rate-limit`, `joi` validation |

### Python (`cropfarmPY/`, `pipeline.py`)

| | |
|---|---|
| `cropfarmPY/main_pipeline.py` | The pipeline the backend actually runs. Needs `numpy`, `opencv-python`, `Pillow`, `requests`. |
| `cropfarmPY/modules/` | `crop_damage_insurance`, `exif_area_calculator`, `fraud_detector`, `geolocation_verifier`, `weather_verifier` |
| `pipeline.py` (repo root) | A standalone experimental script. Not invoked by the backend. |

---

## Project structure

```
agri-insurance/
├── backend/
│   ├── server.js                  Express app, middleware, route mounting, /health
│   ├── data/                      Sample geotagged images and a parcel.geojson
│   ├── test/                      node --test suites (npm test)
│   └── src/
│       ├── config/                database.js, cloudinary.js
│       ├── controllers/           auth, claim, policy, admin, user, notification
│       ├── middleware/            auth (JWT), roleGuard, upload (multer), validate (joi)
│       ├── models/                User, Claim, Policy, Notification, AdminAction
│       ├── routes/                One router per controller, mounted under /api
│       └── services/              cloudinary, gemini, otp, python (spawns the pipeline)
│
├── cropfarmPY/
│   ├── main_pipeline.py           CLI entry point the backend spawns; its docstring is the stdout contract
│   ├── modules/                   Damage, EXIF area, fraud, geolocation, weather
│   ├── requirements.txt           numpy, opencv-python, Pillow, requests
│   ├── config.pkl                 Pre-computed pipeline configuration
│   ├── input_samples/             Example inputs
│   └── test_images/               Fixtures for manual pipeline runs
│
├── frontend/
│   ├── craco.config.js            Patches every postcss-loader for Tailwind v4
│   ├── public/                    index.html, manifest.json, service-worker.js, images
│   └── src/
│       ├── index.css              THE design system: palette, type scale, daisyUI theme
│       ├── App.js                 Routes and the role-aware route guard
│       ├── components/
│       │   ├── layouts/           PortalLayout (shared shell), UserLayout, AdminLayout
│       │   └── ui/                Field, Modal, ConfirmDialog, Toast, States,
│       │                          PageHeader, StatTile, StatusBadge, Pagination
│       ├── contexts/              AuthContext
│       ├── hooks/                 usePWAInstall
│       ├── pages/
│       │   ├── admin/             Dashboard, UserManagement, PolicyManagement,
│       │   │                      ClaimVerification, ActivityLogs
│       │   ├── auth/              Login (phone + OTP)
│       │   ├── user/              Dashboard, Policies, SubmitClaim, MediaCapture,
│       │   │                      ClaimStatus, ClaimResults, Notifications,
│       │   │                      Profile, Settings, AppInstallGuide
│       │   └── Landing.js         Public marketing page
│       └── utils/                 api (axios), config, constants, theme
│
├── pipeline.py                    Standalone experimental script (not used by the backend)
└── readme.md
```

---

## Prerequisites

| Software | Version | |
|----------|---------|---|
| Node.js | 18 or later | [nodejs.org](https://nodejs.org/) |
| npm | 9 or later | ships with Node.js |
| Python | 3.8 or later | [python.org](https://www.python.org/downloads/) |
| Git | any recent | [git-scm.com](https://git-scm.com/) |

### Accounts you will need

| Service | Used for | Required? |
|---------|----------|-----------|
| [MongoDB Atlas](https://www.mongodb.com/atlas) | Database | In production. Development without it runs on seed policies and in-memory claims |
| [Cloudinary](https://cloudinary.com/) | Storing claim photos | No — if an upload to Cloudinary fails the photo is kept in `backend/uploads/` |
| [Twilio](https://www.twilio.com/) | Sending OTP by SMS | In production, where the server refuses to start without its credentials. SMS sending is not implemented yet — see [Known gaps](#known-gaps) |
| [Google AI Studio](https://aistudio.google.com/) | Gemini claim summaries | No — a deterministic summary is shown instead |
| [OpenWeather](https://openweathermap.org/api) | Weather cross-referencing | No — without a key the weather check runs on mock data |

---

## Setup

### 1. Clone

```bash
git clone https://github.com/Denimworld12/photo_And-video_Based_Insurace.git
cd photo_And-video_Based_Insurace
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit .env with your credentials
```

Start it:

```bash
npm start                 # node server.js
npm test                  # node --test suites; no database or network needed
```

The server listens on `PORT` (default `5001`). Check it with `curl http://localhost:5001/health`. Only
`JWT_SECRET` is needed to start in development.

> `npm run dev` runs `nodemon server.js`, but **nodemon is not listed in `backend/package.json`**. Either install
> it globally (`npm i -g nodemon`) or use `npm start` and restart manually.

### 3. Python pipeline

Only `cropfarmPY` needs dependencies — it is what the backend spawns.

**macOS / Linux**

```bash
cd cropfarmPY
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -c "import cv2, numpy, PIL, requests; print('pipeline dependencies OK')"
deactivate
```

**Windows (PowerShell)**

```powershell
cd cropfarmPY
python -m venv venv
.\venv\Scripts\Activate.ps1
# If blocked: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
pip install -r requirements.txt
python -c "import cv2, numpy, PIL, requests; print('pipeline dependencies OK')"
deactivate
```

The backend spawns the pipeline with whatever `PYTHON_COMMAND` names (default `python`). If you installed the
dependencies into a virtual environment, point `PYTHON_COMMAND` at that interpreter, for example
`PYTHON_COMMAND=/absolute/path/to/cropfarmPY/venv/bin/python`. Otherwise install `numpy`, `opencv-python`,
`Pillow` and `requests` into the interpreter `python` resolves to.

If the pipeline cannot be run, the backend does not fail the claim and never decides it automatically — the claim
goes to manual review with no damage figure and a zero suggested payout.

> The root `pipeline.py` needs no installation. Its heavier imports (PyTorch, torchvision, shapely, Pillow, numpy)
> are all optional and guarded, so it runs on the standard library alone with those features disabled. Nothing in
> the backend calls it.

### 4. Frontend

```bash
cd frontend
npm install
npm start
```

This opens `http://localhost:3000` and talks to the API at `REACT_APP_API_URL` (`frontend/.env`, default
`http://localhost:5001`).

---

## Environment variables

All of these live in `backend/.env`. Copy `backend/.env.example` as your starting point; it is the authoritative
and complete list, with a comment on each setting.

### Server

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `5001` | Port the API listens on |
| `NODE_ENV` | `development` | `production` turns on the startup checks below and disables every development fallback |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins. Enforced only in production, where it is required; development accepts any origin |
| `TRUST_PROXY` | unset | Proxy hop count (e.g. `1`) when running behind a load balancer, so rate limiting and audit-log IPs see the client. Any value other than a non-negative integer stops startup |

### Database and auth

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_URI` | In production | MongoDB Atlas connection string. Without it, development serves seed policies, keeps claims in memory and signs everyone in as a farmer |
| `JWT_SECRET` | Yes | The server will not start without it; production requires at least 32 characters |
| `JWT_EXPIRES_IN` | No (`7d`) | Token lifetime |
| `ADMIN_PHONE_NUMBER` | No | The phone number granted the admin role at login. Unset means no account is an administrator |

### OTP

| Variable | Default | Notes |
|----------|---------|-------|
| `OTP_MOCK_MODE` | `true` | Outside production, mock delivery is on unless this is exactly `false`: no SMS is sent, and the code is printed in the backend log and returned as `devOTP` in the send-otp response. The code is still verified. Production refuses `true` |
| `TWILIO_ACCOUNT_SID` | — | Required in production |
| `TWILIO_AUTH_TOKEN` | — | Required in production |
| `TWILIO_PHONE_NUMBER` | — | Required in production |

### Media and AI

| Variable | Required | Notes |
|----------|----------|-------|
| `CLOUDINARY_CLOUD_NAME` | Yes | |
| `CLOUDINARY_API_KEY` | Yes | |
| `CLOUDINARY_API_SECRET` | Yes | |
| `MAX_FILE_SIZE` | No (`52428800`) | Upload ceiling in bytes. The frontend independently rejects anything over 10 MB. |
| `GEMINI_API_KEY` | No | Without it the "plain-language summary" falls back to a deterministic summary built from the assessment figures, shown normally with a "Generated by fallback" footer |
| `WEATHER_API_KEY` | No | OpenWeatherMap key, passed to the pipeline as `--api-key`. Without it the weather check runs on mock data |

### Pipeline

| Variable | Default | Notes |
|----------|---------|-------|
| `PYTHON_COMMAND` | `python` | Interpreter used to spawn `cropfarmPY/main_pipeline.py` |
| `PYTHON_PIPELINE_TIMEOUT_MS` | `120000` | How long to wait for the pipeline. A timeout sends the claim to manual review |
| `CLAIM_AUTO_APPROVE_THRESHOLD` | `0.7` | Confidence at or above this is auto-approved |
| `CLAIM_REJECT_THRESHOLD` | `0.3` | Confidence at or above this goes to manual review; below it is auto-rejected |
| `DEFAULT_SUM_INSURED` | `100000` | Sum insured (INR) used when a claim's policy cannot be resolved |
| `MAX_RESUBMISSIONS` | `3` | How many times a rejected claim may be resubmitted |

### Frontend

`frontend/.env` and `frontend/.env.production` hold a single variable:

| Variable | Notes |
|----------|-------|
| `REACT_APP_API_URL` | The backend origin. Baked into the bundle at build time, so changing it requires a rebuild. **`.env.production` still contains the placeholder `https://your-backend-url.herokuapp.com` — set it before building for production.** |

---

## Running the application

Three terminals, or three processes under a supervisor:

```bash
# 1. Backend
cd backend && npm start                  # http://localhost:5001

# 2. Frontend
cd frontend && npm start                 # http://localhost:3000

# 3. Nothing to run for Python — the backend spawns it per claim
```

Sign in at `http://localhost:3000/login` with any 10-digit Indian mobile number (starting 6–9). With
`OTP_MOCK_MODE` left at its default, no SMS is sent: the code is printed in the backend's log (`[OTP] Mock
delivery ...`) and returned as `devOTP` in the send-otp response. The login screen does not display it. Sign in with
`ADMIN_PHONE_NUMBER` to reach the admin portal at `/admin`; that needs MongoDB, because without a database every
login is a farmer session.

---

## API reference

Every route is mounted under `/api`. All except `/api/auth/send-otp`, `/api/auth/verify-otp` and the public policy
reads require an `Authorization: Bearer <token>` header. `/api/admin/*` and the policy writes additionally require
the `admin` role. A claim belonging to another user is reported as not found.

### Auth — `/api/auth`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/send-otp` | Send a one-time code to a phone number |
| `POST` | `/verify-otp` | Verify the code and receive a JWT |
| `GET` | `/me` | The signed-in user |

### Claims — `/api/claims`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/list` | The caller's claims. Query: `page`, `limit`. Also returns `statusCounts`, per-status totals across all of the caller's claims rather than just this page |
| `POST` | `/initialize` | Open a claim from a policy and a form payload; returns a `documentId` |
| `POST` | `/upload` | Upload one evidence photo (multipart: `image`, `lat`, `lon`, `client_ts`, `parcel_id`, `step_id`). `lat` and `lon` are optional but go together: leave both out when the device gave no location, and the pipeline skips location and weather verification; JPEG, PNG, WebP and HEIC/HEIF are accepted |
| `POST` | `/complete` | Close evidence collection and run the assessment pipeline |
| `GET` | `/results/:documentId` | The assessment for a claim, plus its recorded decision: `status`, `payoutAmount`, and, once an admin has reviewed it, `manuallyReviewed`, `reviewNotes` and `reviewedAt` |
| `GET` | `/summarize/:documentId` | Gemini plain-language summary. Query: `refresh=1` to regenerate |
| `POST` | `/resubmit/:documentId` | Open a fresh claim from a rejected one, up to `MAX_RESUBMISSIONS` times |

### Policies — `/api/insurance`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/list` | Published policies (the seed policies while none is published) |
| `GET` | `/admin/list` | Policies by publication state (admin). Query: `status=active\|inactive\|all`; returns per-state `counts` |
| `GET` | `/:id` | One policy |
| `POST` | `/` | Create a policy (admin) |
| `PUT` | `/:id` | Update a policy (admin). `isActive: true` republishes an unpublished one |
| `DELETE` | `/:id` | Withdraw a policy (admin). Soft delete — sets `isActive: false`, so it disappears from `/list` but the record is kept and listed by `/admin/list?status=inactive` |

### User — `/api/user`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/profile` | The caller's profile |
| `PUT` | `/profile` | Update name, email, address and farm details (including `primaryCrop` and `soilType`). An empty string for an optional field clears it |

### Notifications — `/api/notifications`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Notifications plus an unread count |
| `PATCH` | `/:id/read` | Mark one as read |
| `PATCH` | `/read-all` | Mark all as read |

### Admin — `/api/admin`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/dashboard` | Platform statistics and recent claims. `totalPayout` sums `payoutAmount` over paid-out claims only |
| `GET` | `/users` | Accounts. Query: `page`, `limit`, `search` |
| `PATCH` | `/users/:id/toggle-active` | Activate or deactivate an account |
| `GET` | `/claims` | All claims, with `confidenceScore` (null when nothing measured it). Query: `page`, `limit`, `status`, `search` |
| `GET` | `/claims/:id` | One claim in full, with evidence and AI assessment |
| `PATCH` | `/claims/:id/review` | Record a decision. Body: `status`, `reviewNotes`, `payoutAmount`. An explicit `payoutAmount: 0` approves with nothing due; omitting it adopts the pipeline's figure |
| `GET` | `/activity-logs` | Audit trail. Query: `page`, `limit` |

### Health

`GET /health` returns service status and is not under `/api`.

---

## The Python pipeline

The backend spawns `cropfarmPY/main_pipeline.py` per claim and reads JSON from its stdout, waiting up to
`PYTHON_PIPELINE_TIMEOUT_MS` (two minutes by default). The output contract is documented in the module docstring of
`main_pipeline.py`. You can run the same command by hand:

```bash
cd cropfarmPY
python main_pipeline.py <image1> <image2> ... \
  --field-size 7500 \
  --sum-insured 100000 \
  --user-lat 30.7333 --user-lon 76.7794 \
  --api-key <weather-api-key>
```

| Flag | Default in the backend |
|------|------------------------|
| `--field-size` | Not sent; the pipeline assumes `imageCount × 1500` m² |
| `--sum-insured` | The policy's maximum coverage, or `DEFAULT_SUM_INSURED` |
| `--user-lat` / `--user-lon` | The capture coordinates, sent only when the claim carried them |
| `--api-key` | `WEATHER_API_KEY`, sent only when set |

Only the result JSON is written to stdout. Errors are printed to stderr as JSON with a non-zero exit code, so that
stdout stays parseable. The weather check calls OpenWeatherMap's current-conditions endpoint once per claim, at the
capture location.

The pipeline measures and the backend decides: `python.service.js` applies the approve and reject thresholds to the
pipeline's confidence score, and a pipeline failure always routes the claim to manual review.

---

## Design system

The whole frontend is themed from one file: **`frontend/src/index.css`**. Nothing under `src/` hardcodes a colour,
a font size or a radius — if a value is needed it is added there first and used as a utility class.

The palette is a warm, paper-like "harvest ledger": a parchment canvas, ink-dark text and a single honey-amber
accent. Surfaces are flat and separate by warm colour-temperature shifts and hairline borders rather than drop
shadows. There are no blues, no reds and no other saturated primaries.

| Token | Value | Used for |
|-------|-------|----------|
| `parchment` | `#fcfaf1` | The page canvas |
| `pure-white` | `#ffffff` | Elevated cards |
| `bone` | `#efe9e0` | Hairline borders, subtle fills |
| `loam` / `bark` / `saddle` | `#c7bcaf` / `#96897b` / `#50463c` | Muted text and borders, light to dark |
| `ink` | `#211b15` | Body text |
| `charcoal-olive` | `#252a23` | Inverted high-emphasis panels |
| `deep-olive` / `sage` | `#434f40` / `#7a9779` | Secondary surfaces, positive states |
| `honey-amber` / `wheat` | `#e8b672` / `#f0c891` | The one accent, and its lighter tint |

Conventions: primary buttons are filled honey-amber with ink text at a 3.75px radius and no shadow; secondary
buttons are thin ink-bordered outlines; cards use a 7.5px radius with a hairline border; small uppercase eyebrow
labels introduce sections; headings use the display face at weight 500, not 700.

Because status colour range is deliberately narrow, **no state is ever signalled by colour alone** — every status
in both portals carries a `lucide-react` icon and a word. There are no emoji anywhere in the UI.

The `Lateral` type family named in the theme is not vendored in this repository. Each font stack ends in a full
system fallback, so the UI renders on the system sans until the webfont files are added to `public/fonts` and
declared with `@font-face` in `index.css`.

---

## Building for production

```bash
# Frontend — set REACT_APP_API_URL in frontend/.env.production first
cd frontend
npm run build          # outputs to frontend/build/

# Backend — serve with a process manager
cd backend
NODE_ENV=production npm start
```

`frontend/build/` is a static bundle; serve it from any static host or CDN. The service worker caches assets for
offline use, and a redeployed build is picked up automatically on the next app launch.

With `NODE_ENV=production` the server refuses to start unless `JWT_SECRET` has at least 32 characters,
`MONGODB_URI` and `ALLOWED_ORIGINS` are set, `OTP_MOCK_MODE` is not `true`, and the Twilio credentials are present.
Also confirm that `REACT_APP_API_URL` points at the real backend. Note that SMS sending is not implemented yet, so a
production deployment cannot log anyone in — see [Known gaps](#known-gaps).

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Every page shows "Could not load this page" | The backend is unreachable. Check it is running and that `REACT_APP_API_URL` matches its origin. |
| Browser console shows a CORS error in production | Add the frontend's origin to `ALLOWED_ORIGINS` in `backend/.env`. It is the only variable the CORS check reads; development accepts any origin. |
| `npm run dev` fails in `backend/` | `nodemon` is not a declared dependency. Install it globally or use `npm start`. |
| Claims always come back as manual review with no damage figure | The backend could not run the pipeline. Check `PYTHON_COMMAND` and that `numpy`, `opencv-python`, `Pillow` and `requests` are importable from that interpreter. |
| Pipeline times out | It is capped by `PYTHON_PIPELINE_TIMEOUT_MS` (default two minutes). Large images are the usual cause. |
| "Your location is not available" during photo capture | The browser refused or could not obtain GPS. The photos can still be submitted: they are stored with no location, and the pipeline skips location and weather verification, so the claim usually ends up in manual review. Use **Try again** to allow location, and retake any photo taken without a fix for a faster assessment. Geolocation also requires a secure context — `localhost` or HTTPS. |
| The camera will not open | `getUserMedia` needs `localhost` or HTTPS, and browser camera permission. The gallery upload path is the fallback. |
| No SMS arrives with the login code | In mock mode (the development default) none is sent; read the code from the backend log. With mock mode off, SMS sending is not implemented yet. |
| No install prompt for the PWA | Chrome and Edge only, over HTTPS or `localhost`. On iOS use Safari: Share, then Add to Home Screen. |

---

## Known gaps

Recorded here so they are not rediscovered as surprises:

- **The frontend has no automated tests.** `frontend/package.json` exposes `npm test` through CRACO, but no test
  files exist; frontend changes are verified with `CI=true npx craco build` and by exercising the app by hand. The
  backend has a `node --test` suite (`cd backend && npm test`) covering the pipeline contract, OTP verification,
  validation, uploads, the Claim schema and controller helpers, but no HTTP- or database-level tests.
- **SMS delivery is not implemented.** The Twilio send block in `backend/src/services/otp.service.js` is commented
  out, so with mock delivery off send-otp reports success without sending anything and nobody can log in. The
  server prints a warning about this on every start without mock mode.
- **`nodemon` is referenced by `backend`'s `dev` script but is not a declared dependency.**
- **`frontend/.env.production` ships a placeholder API URL** and must be set before a production build.
- **The weather check uses current conditions, not the weather on the date of loss**, and falls back to mock data
  without `WEATHER_API_KEY`. Historical weather needs a paid OpenWeatherMap plan.
- **The `Lateral` webfont files are not in the repository**; the UI renders on the system sans fallback.
- **`pipeline.py` at the repository root is not wired into the application.** It is a standalone script kept for
  experimentation.
