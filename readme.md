<p align="center">
  <img src="frontend/public/logo192.png" alt="PBI AgriInsure Logo" width="120" />
</p>

<h1 align="center">PBI AgriInsure</h1>

<p align="center">
  <strong>AI-Powered Photo & Video Based Crop Insurance Platform</strong>
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

## 📋 Table of Contents

- [About the Application](#-about-the-application)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Setup & Installation](#-setup--installation)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup-nodejs)
  - [3. Python Pipeline Setup](#3-python-pipeline-setup)
  - [4. Frontend Setup](#4-frontend-setup-react)
- [Environment Variables Reference](#-environment-variables-reference)
- [Running the Application](#-running-the-application)
- [API Endpoints](#-api-endpoints)
- [File Reference](#-file-reference)
- [PWA Installation](#-pwa-installation)
- [Build for Production](#-build-for-production)
- [Troubleshooting](#-troubleshooting)

---

## 🌾 About the Application

**PBI AgriInsure** is a full-stack, AI-powered crop insurance platform that revolutionizes the agricultural insurance process using photo and video-based evidence verification. Farmers can submit insurance claims by uploading geotagged photos/videos of their damaged crops, and the system uses **AI (Google Gemini)**, **computer vision (OpenCV/PyTorch)**, and **geospatial analysis** to automatically verify and process claims.

The platform eliminates the need for manual field inspections by:

- **Extracting GPS coordinates** from photo EXIF metadata to verify the claim location matches the insured farm
- **Analyzing crop damage** using AI vision models and vegetation indices (Excess Green Index / Excess Red Index)
- **Cross-referencing weather data** to validate reported natural disasters (floods, droughts, hailstorms)
- **Detecting fraud** through image manipulation analysis and metadata consistency checks
- **Auto-scoring claims** with configurable approval/rejection thresholds

### User Roles

| Role | Capabilities |
|------|-------------|
| **Farmer (User)** | Register, buy policies, submit claims with photos/videos, track claim status, view notifications |
| **Admin** | Review claims, approve/reject with remarks, manage policies, view analytics, manage users |

---

## ✨ Key Features

- 📱 **Progressive Web App (PWA)** — Install on any device, works offline
- 🤖 **Gemini AI Integration** — Intelligent damage assessment and claim analysis
- 📸 **Photo/Video Evidence** — Upload geotagged media for automated verification
- 🗺️ **GPS & Geofencing** — EXIF coordinate extraction, farm boundary verification
- 🌦️ **Weather Verification** — Cross-references claims with historical weather data
- 🔍 **Fraud Detection** — Image manipulation analysis, metadata consistency checks
- 🌿 **Vegetation Index Analysis** — RGB-based crop health scoring (ExG/ExR indices)
- 📊 **Admin Dashboard** — Real-time analytics, claim management, policy oversight
- 🔐 **OTP Authentication** — Phone-based login via Twilio SMS
- ☁️ **Cloud Image Storage** — Cloudinary integration for secure media handling
- 📄 **PDF Reports** — Generate claim and policy documents
- 🎨 **5 Theme Options** — Emerald, Bumblebee, Halloween, Forest, Lemonade (DaisyUI)
- 🛡️ **Security** — Helmet, rate limiting, JWT tokens, CORS protection

---

## 🛠 Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.1.1 | UI framework |
| Tailwind CSS | 4.1.13 | Utility-first CSS |
| DaisyUI | 5.5.19 | Component library (5 themes) |
| CRACO | 7.1.0 | CRA config override |
| Framer Motion | — | Animations |
| GSAP | — | Advanced animations |
| Axios | — | HTTP client |
| Lucide React | — | Icon library |
| jsPDF | — | Client-side PDF generation |
| React Router | v6 | Client-side routing |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.18.2 | Web framework |
| MongoDB / Mongoose | 8.0.0 | Database & ODM |
| JWT | 9.0.2 | Authentication tokens |
| Cloudinary | 1.41.0 | Image/video cloud storage |
| Google Generative AI | 0.24.1 | Gemini AI integration |
| Twilio | 4.19.0 | SMS OTP service |
| Helmet | 7.1.0 | HTTP security headers |
| Sharp | 0.32.6 | Image processing |
| Multer | 1.4.4 | File upload handling |
| Joi | 17.11.0 | Request validation |
| jsPDF | 2.5.1 | Server-side PDF generation |

### Python Pipelines
| Technology | Purpose |
|-----------|---------|
| OpenCV | Image processing & vegetation analysis |
| Pillow (PIL) | EXIF metadata extraction |
| NumPy | Numerical computations |
| PyTorch + TorchVision | AI damage classification (optional) |
| Shapely | Geospatial boundary analysis (optional) |

---

## 📁 Project Structure

```
photo_And-video_Based_Insurace/
│
├── pipeline.py                      # Root AI pipeline (EXIF, geofencing, PyTorch)
├── README.md                        # This file
│
├── backend/                         # Node.js Express API Server
│   ├── server.js                    # Entry point — Express app setup (v4.0.0)
│   ├── package.json                 # Node dependencies & scripts
│   ├── .env.example                 # Environment variable template
│   ├── data/                        # Local data files
│   ├── services/                    # Standalone service modules
│   │   ├── geolocation-service.js   # Coordinate & boundary utilities
│   │   └── weather-service.js       # Weather API integration
│   └── src/
│       ├── config/
│       │   └── database.js          # MongoDB connection config
│       ├── controllers/
│       │   ├── auth.controller.js   # OTP login, register, token refresh
│       │   ├── policy.controller.js # CRUD for insurance policies
│       │   ├── claim.controller.js  # Claim submission & processing
│       │   ├── admin.controller.js  # Admin actions & analytics
│       │   ├── user.controller.js   # User profile management
│       │   └── notification.controller.js
│       ├── middleware/
│       │   ├── auth.js              # JWT verification middleware
│       │   ├── roleGuard.js         # Role-based access control
│       │   ├── upload.js            # Multer file upload config
│       │   └── validate.js          # Joi request validation
│       ├── models/
│       │   ├── User.js              # User schema (farmer/admin)
│       │   ├── Policy.js            # Insurance policy schema
│       │   ├── Claim.js             # Claim schema with evidence
│       │   ├── Notification.js      # Notification schema
│       │   ├── AdminAction.js       # Admin activity log schema
│       │   └── index.js             # Model exports
│       ├── routes/
│       │   ├── auth.routes.js       # POST /api/auth/*
│       │   ├── policy.routes.js     # /api/insurance/*
│       │   ├── claim.routes.js      # /api/claims/*
│       │   ├── admin.routes.js      # /api/admin/*
│       │   ├── user.routes.js       # /api/user/*
│       │   └── notification.routes.js
│       └── services/
│           ├── cloudinary.service.js  # Image upload to Cloudinary
│           ├── gemini.service.js      # Google Gemini AI integration
│           ├── otp.service.js         # Twilio OTP send/verify
│           └── python.service.js      # Python pipeline child-process runner
│
├── cropfarmPY/                      # Python Computer Vision Pipeline
│   ├── main_pipeline.py             # Entry — RGB vegetation index analysis
│   ├── requirements.txt             # Python dependencies
│   ├── input_samples/               # Sample test images
│   ├── test_images/                 # Test image set
│   └── modules/
│       ├── crop_damage_insurance.py  # Core damage assessment logic
│       ├── exif_area_calculator.py   # EXIF GPS area computation
│       ├── fraud_detector.py         # Image manipulation detection
│       ├── geolocation_verifier.py   # Location verification
│       └── weather_verifier.py       # Weather cross-reference
│
└── frontend/                        # React PWA Frontend
    ├── package.json                 # React dependencies & scripts
    ├── craco.config.js              # CRACO webpack/PostCSS override
    ├── public/
    │   ├── index.html               # HTML template with PWA meta tags
    │   ├── manifest.json            # PWA manifest
    │   └── service-worker.js        # Service worker (cache + offline)
    └── src/
        ├── App.js                   # Root component & route definitions
        ├── index.js                 # Entry point (SW registration)
        ├── index.css                # Global styles (Tailwind v4, DaisyUI)
        ├── global.css               # Additional global styles
        ├── serviceWorkerRegistration.js  # SW registration utility
        ├── components/
        │   ├── ProtectedRoute.js    # Auth route guard
        │   ├── ThemeSwitcher.js     # Theme toggle (5 themes)
        │   └── layouts/
        │       ├── UserLayout.js    # Farmer sidebar layout
        │       └── AdminLayout.js   # Admin sidebar layout
        ├── contexts/
        │   ├── AuthContext.js       # Auth state (JWT, user)
        │   ├── ClaimContext.js      # Claim wizard state
        │   └── ThemeContext.js      # Theme persistence
        ├── hooks/
        │   └── usePWAInstall.js     # PWA install prompt hook
        ├── utils/
        │   ├── api.js               # Axios instance & interceptors
        │   ├── config.js            # Runtime config / env helpers
        │   └── constants.js         # App-wide constants
        └── pages/
            ├── Landing.js           # Public landing page
            ├── auth/
            │   └── Login.js         # OTP-based login/register
            ├── user/
            │   ├── Dashboard.js     # Farmer dashboard
            │   ├── Policies.js      # View/buy insurance policies
            │   ├── SubmitClaim.js    # Multi-step claim wizard
            │   ├── MediaCapture.js  # Camera/upload for evidence
            │   ├── ClaimStatus.js   # Track claim progress
            │   ├── ClaimResults.js  # AI analysis results
            │   ├── Profile.js       # User profile management
            │   ├── Settings.js      # App settings & themes
            │   ├── Notifications.js # Notification center
            │   └── AppInstallGuide.js # PWA installation guide
            └── admin/
                ├── AdminDashboard.js   # Admin analytics overview
                ├── ClaimVerification.js # Review & verify claims
                ├── PolicyManagement.js  # Manage policy catalog
                ├── UserManagement.js    # Manage users
                └── ActivityLogs.js      # Admin action history
```

---

## 📦 Prerequisites

Before setting up the project, make sure you have the following installed:

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18.x or later | [nodejs.org](https://nodejs.org/) |
| **npm** | 9.x or later | Comes with Node.js |
| **Python** | 3.8 or later | [python.org](https://www.python.org/downloads/) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### Required Accounts / API Keys

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **MongoDB Atlas** | Cloud database | [mongodb.com/atlas](https://www.mongodb.com/atlas) |
| **Cloudinary** | Image/video cloud storage | [cloudinary.com](https://cloudinary.com/) |
| **Twilio** | SMS OTP authentication | [twilio.com](https://www.twilio.com/) |
| **Google AI Studio** | Gemini AI API key | [aistudio.google.com](https://aistudio.google.com/) |

> **Note:** For local development, you can set `OTP_MOCK_MODE=true` to bypass Twilio and use a mock OTP code.

---

## 🚀 Setup & Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd photo_And-video_Based_Insurace
```

---

### 2. Backend Setup (Node.js)

<details>
<summary><strong>🍎 macOS / Linux</strong></summary>

```bash
# Navigate to backend
cd backend

# Install Node.js dependencies
npm install

# Create environment file from template
cp .env.example .env

# Open .env and fill in your credentials
nano .env    # or use any text editor (code .env / vim .env)

# Start the backend server (development mode with auto-reload)
npm run dev

# OR start without auto-reload
npm start
```

</details>

<details>
<summary><strong>🪟 Windows (PowerShell / CMD)</strong></summary>

```powershell
# Navigate to backend
cd backend

# Install Node.js dependencies
npm install

# Create environment file from template
copy .env.example .env

# Open .env and fill in your credentials
notepad .env

# Start the backend server (development mode with auto-reload)
npm run dev

# OR start without auto-reload
npm start
```

</details>

The backend runs at **http://localhost:5001** by default.

> **Verify:** Open http://localhost:5001/health — you should see a JSON response with `"status": "OK"`.

---

### 3. Python Pipeline Setup

There are **two** Python pipelines in this project. Both should be set up in virtual environments.

#### 3a. CropFarm Computer Vision Pipeline (`cropfarmPY/`)

This pipeline handles RGB vegetation-index damage analysis, fraud detection, and weather verification.

<details>
<summary><strong>🍎 macOS / Linux</strong></summary>

```bash
# Navigate to the cropfarmPY directory
cd cropfarmPY

# Create a Python virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install required packages
pip install -r requirements.txt

# Verify installation
python -c "import numpy; import cv2; from PIL import Image; print('All packages installed successfully!')"

# Deactivate when done
deactivate
```

</details>

<details>
<summary><strong>🪟 Windows (PowerShell)</strong></summary>

```powershell
# Navigate to the cropfarmPY directory
cd cropfarmPY

# Create a Python virtual environment
python -m venv venv

# Activate the virtual environment
venv\Scripts\Activate.ps1
# If you get a script execution policy error, run:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install required packages
pip install -r requirements.txt

# Verify installation
python -c "import numpy; import cv2; from PIL import Image; print('All packages installed successfully!')"

# Deactivate when done
deactivate
```

</details>

<details>
<summary><strong>🪟 Windows (CMD)</strong></summary>

```cmd
cd cropfarmPY
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
python -c "import numpy; import cv2; from PIL import Image; print('All packages installed successfully!')"
deactivate
```

</details>

#### 3b. Root AI Pipeline (`pipeline.py`)

This is the advanced pipeline with EXIF GPS extraction, geofencing (Shapely), and PyTorch-based AI damage classification. It has **optional** dependencies — the script runs in fallback mode if some packages are missing.

<details>
<summary><strong>🍎 macOS / Linux</strong></summary>

```bash
# From the project root directory
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install core dependencies
pip install Pillow numpy

# Install optional dependencies (for full AI + geospatial features)
pip install torch torchvision shapely

# Deactivate when done
deactivate
```

</details>

<details>
<summary><strong>🪟 Windows</strong></summary>

```powershell
# From the project root directory
python -m venv venv

# Activate the virtual environment
venv\Scripts\Activate.ps1

# Install core dependencies
pip install Pillow numpy

# Install optional dependencies (for full AI + geospatial features)
pip install torch torchvision shapely

# Deactivate when done
deactivate
```

</details>

> **Note:** PyTorch can be large (~2 GB). For CPU-only install: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`

---

### 4. Frontend Setup (React)

<details>
<summary><strong>🍎 macOS / Linux</strong></summary>

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create .env file (if not already present)
echo "REACT_APP_API_URL=http://localhost:5001" > .env

# Start the development server
npm start
```

</details>

<details>
<summary><strong>🪟 Windows (PowerShell / CMD)</strong></summary>

```powershell
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create .env file (if not already present)
echo REACT_APP_API_URL=http://localhost:5001 > .env

# Start the development server
npm start
```

</details>

The frontend runs at **http://localhost:3000** by default.

---

## 🔐 Environment Variables Reference

### Backend (`backend/.env`)

Create this file by copying `.env.example`:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port (default: 5001) | `5001` |
| `NODE_ENV` | No | Environment mode | `development` |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/agriinsure` |
| `JWT_SECRET` | **Yes** | Secret key for JWT tokens (min 32 chars) | `your-super-secret-key-here-min-32-chars` |
| `JWT_EXPIRES_IN` | No | Token expiration time | `7d` |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | Cloudinary cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | **Yes** | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | **Yes** | Cloudinary API secret | `abcdefghijk...` |
| `TWILIO_ACCOUNT_SID` | **Yes*** | Twilio account SID | `ACxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | **Yes*** | Twilio auth token | `your-twilio-auth-token` |
| `TWILIO_PHONE_NUMBER` | **Yes*** | Twilio phone number | `+1234567890` |
| `GEMINI_API_KEY` | **Yes** | Google Gemini AI API key | `AIzaSy...` |
| `FRONTEND_URL` | No | Frontend URL for CORS | `http://localhost:3000` |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed origins | `http://localhost:3000` |
| `PYTHON_COMMAND` | No | Python binary path | `python3` |
| `WEATHER_API_KEY` | No | Weather API key (Open-Meteo is free) | — |
| `MAX_FILE_SIZE` | No | Max upload size in bytes | `52428800` (50MB) |
| `ADMIN_PHONE_NUMBER` | No | Default admin phone | `+917777777777` |
| `OTP_MOCK_MODE` | No | Skip real SMS, use mock OTP | `true` |
| `CLAIM_AUTO_APPROVE_THRESHOLD` | No | Auto-approve score threshold | `80` |
| `CLAIM_REJECT_THRESHOLD` | No | Auto-reject score threshold | `30` |

> *Twilio variables are optional if `OTP_MOCK_MODE=true`

### Frontend (`frontend/.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `REACT_APP_API_URL` | **Yes** | Backend API base URL | `http://localhost:5001` |

---

## ▶️ Running the Application

### Quick Start (All Services)

Open **three terminal windows/tabs**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Python Pipeline (activate venv):**
```bash
cd cropfarmPY
source venv/bin/activate     # macOS/Linux
# venv\Scripts\activate.bat  # Windows CMD
# venv\Scripts\Activate.ps1  # Windows PowerShell
```

**Terminal 3 — Frontend:**
```bash
cd frontend
npm start
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend (React) | http://localhost:3000 |
| Backend API | http://localhost:5001 |
| Health Check | http://localhost:5001/health |
| API Root | http://localhost:5001/ |

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to phone number |
| POST | `/api/auth/verify-otp` | Verify OTP and get JWT token |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/me` | Get current user profile |

### Insurance Policies (`/api/insurance`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/insurance/policies` | List available policies |
| POST | `/api/insurance/purchase` | Purchase a policy |
| GET | `/api/insurance/my-policies` | Get user's purchased policies |

### Claims (`/api/claims`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/claims/submit` | Submit a new insurance claim |
| GET | `/api/claims/my-claims` | Get user's claims |
| GET | `/api/claims/:id` | Get specific claim details |
| GET | `/api/claims/:id/results` | Get AI analysis results |

### Admin (`/api/admin`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Admin analytics data |
| GET | `/api/admin/claims` | List all claims |
| PUT | `/api/admin/claims/:id/verify` | Approve/reject a claim |
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/activity-logs` | View admin action history |

### User (`/api/user`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/profile` | Get user profile |
| PUT | `/api/user/profile` | Update user profile |

### Notifications (`/api/notifications`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get user notifications |
| PUT | `/api/notifications/:id/read` | Mark notification as read |

---

## 📖 File Reference

### Backend Files

| File | Description |
|------|-------------|
| `server.js` | Express app entry point — middleware setup, route mounting, graceful shutdown |
| `src/config/database.js` | MongoDB connection with Mongoose, retry logic |
| `src/controllers/auth.controller.js` | OTP send/verify, user registration, JWT issuance |
| `src/controllers/claim.controller.js` | Claim creation, image upload to Cloudinary, Python pipeline invocation, AI scoring |
| `src/controllers/policy.controller.js` | Policy CRUD, purchase flow |
| `src/controllers/admin.controller.js` | Admin dashboard stats, claim verification actions |
| `src/controllers/user.controller.js` | Profile retrieval and updates |
| `src/controllers/notification.controller.js` | Notification management |
| `src/models/User.js` | User schema — phone, name, role (user/admin), farm details |
| `src/models/Policy.js` | Policy schema — crop type, coverage, premium, terms |
| `src/models/Claim.js` | Claim schema — evidence images, GPS, AI scores, status |
| `src/models/Notification.js` | Notification schema — type, message, read status |
| `src/models/AdminAction.js` | Admin action log schema — who, what, when |
| `src/services/cloudinary.service.js` | Cloudinary upload/delete with transformations |
| `src/services/gemini.service.js` | Gemini AI prompt engineering for damage analysis |
| `src/services/otp.service.js` | Twilio SMS OTP send/verify with mock mode |
| `src/services/python.service.js` | Spawns Python child process for pipeline analysis |
| `src/middleware/auth.js` | JWT token verification and user extraction |
| `src/middleware/roleGuard.js` | Role-based access (user vs admin) |
| `src/middleware/upload.js` | Multer config — file size limits, allowed types |
| `src/middleware/validate.js` | Joi schema validation middleware |

### Python Pipeline Files

| File | Description |
|------|-------------|
| `pipeline.py` (root) | 806-line standalone pipeline — EXIF GPS extraction, coordinate matching, geofencing with Shapely, weather cross-reference, PyTorch AI damage classification. Runs in fallback mode without optional deps. |
| `cropfarmPY/main_pipeline.py` | 410-line RGB vegetation-index pipeline — Excess Green/Red Index analysis, damage percentage scoring, orchestrates all modules |
| `cropfarmPY/modules/crop_damage_insurance.py` | Core damage assessment — vegetation indices, coverage calculation |
| `cropfarmPY/modules/exif_area_calculator.py` | Extracts GPS from EXIF, calculates farm area from photo coordinates |
| `cropfarmPY/modules/fraud_detector.py` | Detects image manipulation — metadata inconsistencies, copy-move detection |
| `cropfarmPY/modules/geolocation_verifier.py` | Verifies photo location matches claimed farm coordinates |
| `cropfarmPY/modules/weather_verifier.py` | Cross-references claim date/location with actual weather data |

### Frontend Files

| File | Description |
|------|-------------|
| `src/App.js` | Root component — all routes and layout structure |
| `src/index.js` | Entry point — renders App, registers service worker |
| `src/index.css` | Global styles — Tailwind v4, DaisyUI plugin, Safari fixes |
| `src/serviceWorkerRegistration.js` | PWA service worker registration logic |
| `src/pages/Landing.js` | Public landing page — hero, features, team, CTA |
| `src/pages/auth/Login.js` | OTP-based phone authentication |
| `src/pages/user/Dashboard.js` | Farmer dashboard — stats, quick actions, recent claims |
| `src/pages/user/Policies.js` | Browse and purchase insurance policies |
| `src/pages/user/SubmitClaim.js` | Multi-step claim submission wizard |
| `src/pages/user/MediaCapture.js` | Camera capture / file upload for evidence photos |
| `src/pages/user/ClaimStatus.js` | Track submitted claim progress |
| `src/pages/user/ClaimResults.js` | View AI-generated analysis results |
| `src/pages/user/Profile.js` | User profile management |
| `src/pages/user/Settings.js` | App settings, theme selection |
| `src/pages/user/Notifications.js` | Notification center |
| `src/pages/user/AppInstallGuide.js` | PWA installation guide with platform-specific instructions |
| `src/pages/admin/AdminDashboard.js` | Admin analytics — charts, stats, pending claims |
| `src/pages/admin/ClaimVerification.js` | Review claims — view evidence, AI scores, approve/reject |
| `src/pages/admin/PolicyManagement.js` | Create/edit/archive insurance policies |
| `src/pages/admin/UserManagement.js` | View/manage registered users |
| `src/pages/admin/ActivityLogs.js` | Admin action history and audit trail |
| `src/components/layouts/UserLayout.js` | Farmer sidebar navigation layout |
| `src/components/layouts/AdminLayout.js` | Admin sidebar navigation layout |
| `src/components/ProtectedRoute.js` | Auth guard — redirects unauthenticated users |
| `src/components/ThemeSwitcher.js` | Theme dropdown (5 DaisyUI themes) |
| `src/contexts/AuthContext.js` | Authentication state provider (JWT, user data) |
| `src/contexts/ClaimContext.js` | Claim wizard state management |
| `src/contexts/ThemeContext.js` | Theme persistence (localStorage) |
| `src/hooks/usePWAInstall.js` | PWA install prompt hook (beforeinstallprompt) |
| `src/utils/api.js` | Axios instance with auth interceptor |
| `src/utils/config.js` | Runtime config helpers, env variable access |
| `src/utils/constants.js` | App-wide constants (crop types, statuses, etc.) |

---

## 📲 PWA Installation

PBI AgriInsure is a **Progressive Web App** — it can be installed on any device for a native app-like experience.

### Chrome / Edge (Desktop & Android)
1. Open the app in your browser
2. Click the **"Install App"** button in the navbar, or
3. Click the install icon (➕) in the address bar

### Safari (iOS / macOS)
1. Open the app in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"**

### Features After Installation
- Opens in its own window (no browser chrome)
- Works offline for cached pages
- Automatic updates when new versions are deployed
- Push notification support (future)

---

## 🏗 Build for Production

### Frontend Production Build

```bash
cd frontend
npm run build
```

This creates an optimized production build in `frontend/build/` with:
- Minified JavaScript and CSS
- Asset hashing for cache busting
- Service worker for offline support
- Source maps removed

### Backend Production

```bash
cd backend
NODE_ENV=production npm start
```

On Windows:
```powershell
cd backend
set NODE_ENV=production
npm start
```

### Serve Frontend from Backend (Optional)

To serve the React build from Express, copy the build folder:

```bash
# Build frontend
cd frontend && npm run build

# Copy to backend
cp -r build ../backend/public
```

Then add static serving in `server.js`:
```javascript
app.use(express.static(path.join(__dirname, 'public')));
```

---

## 🔧 Troubleshooting

### Common Issues

<details>
<summary><strong>❌ "JWT_SECRET environment variable is not set"</strong></summary>

The backend requires `JWT_SECRET` to be set in `backend/.env`. Make sure you've created the `.env` file:
```bash
cd backend
cp .env.example .env
# Then edit .env with your values
```
</details>

<details>
<summary><strong>❌ npm install fails on Sharp (Windows)</strong></summary>

Sharp requires native dependencies. Try:
```powershell
npm install --platform=win32 --arch=x64 sharp
```
Or install Windows build tools:
```powershell
npm install -g windows-build-tools
```
</details>

<details>
<summary><strong>❌ Python venv activation fails (Windows PowerShell)</strong></summary>

If you get a script execution policy error:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then retry activation:
```powershell
venv\Scripts\Activate.ps1
```
</details>

<details>
<summary><strong>❌ OpenCV (cv2) import error</strong></summary>

On some systems, you may need the headless version:
```bash
pip uninstall opencv-python
pip install opencv-python-headless
```
</details>

<details>
<summary><strong>❌ MongoDB connection error</strong></summary>

- Ensure your MongoDB Atlas cluster is running
- Check that your IP address is whitelisted in Atlas → Network Access
- Verify the `MONGODB_URI` in `.env` is correct
- Test connection: Visit http://localhost:5001/health and check `"database"` field
</details>

<details>
<summary><strong>❌ "CORS policy violation" error</strong></summary>

Add your frontend URL to `ALLOWED_ORIGINS` in `backend/.env`:
```
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```
</details>

<details>
<summary><strong>❌ Tailwind CSS styles not applying</strong></summary>

This project uses Tailwind CSS v4 with CSS-first configuration (no `tailwind.config.js`). Ensure:
1. You're running `npm start` (not `react-scripts start` directly)
2. CRACO is properly configured — check `craco.config.js`
3. Delete any stale `postcss.config.js` in the frontend root
</details>

---

## 📄 License

This project is developed for educational and demonstration purposes.

---

<p align="center">
  Built with ❤️ for Indian Farmers
</p>
