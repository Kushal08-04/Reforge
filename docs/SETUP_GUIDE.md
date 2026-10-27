# ⚡ REFORGE - Comprehensive Local Setup & Evaluation Guide
## Hybrid Semantic Validation, ML Anomaly Detection, Sandbox Verification & Agentic ETL Repair

This guide walks you through setting up and running **REFORGE** on your local machine (`localhost`). It covers both **Bare-Metal Development** (recommended for active development) and **Docker Compose** (recommended for 1-command deployment), along with instructions for seeding datasets, running automated tests, and demonstrating the complete end-to-end workflow.

---

## 1. System Requirements & Architecture

REFORGE is a multi-tier platform comprising:
1. **Core Backend (Node.js & Express):** Runs on port `5000`. Handles raw ingestion, schema validation, feature building, rule-based semantic evaluation, and the hybrid decision engine.
2. **ML Microservice (Python & FastAPI):** Runs on port `8000`. Serves unsupervised Isolation Forest anomaly detection, supervised Random Forest models, and model lifecycle endpoints.
3. **Frontend Dashboard (React 19, Redux Toolkit, Vite):** Runs on port `5173`. Interactive 9-page dashboard for pipeline monitoring, comparison, evaluations, repairs, and audit trails.
4. **Sandbox Runner (Node.js & Docker):** Isolated ephemeral runtime for verifying candidate ETL patches with memory, CPU, and network boundaries.
5. **Persistence (MongoDB):** MongoDB Atlas or local MongoDB (v6.0+ / v7.0+).

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Python**: v3.10, v3.11, v3.12, or v3.13
- **pip & virtualenv**
- **Docker Desktop** *(optional for bare-metal testing; required for containerized sandbox verification and Docker Compose)*
- **Git**

---

## 2. Quick Start: 1-Command Docker Compose (Easiest)

If you have Docker Desktop installed and running, you can boot the entire stack (including local MongoDB) with a single command:

```bash
# 1. Clone repository (if not already cloned)
git clone https://github.com/Kushal08-04/Reforge.git
cd Reforge

# 2. Copy environment template
cp .env.example .env

# 3. Start all services (MongoDB, ML service, Node server, React frontend)
docker compose up --build
```

### Access URLs:
- **Frontend Dashboard:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:5000/api](http://localhost:5000/api)
- **ML Service OpenAPI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **MongoDB:** `localhost:27017`

---

## 3. Step-by-Step Local Development Setup (Bare-Metal)

For development or debugging individual components, run each service locally:

### Step 3.1: Python ML Microservice Setup
Open Terminal 1:
```bash
cd ml-service

# Create and activate Python virtual environment
# Windows (PowerShell):
python -m venv venv
.\venv\Scripts\Activate.ps1

# macOS / Linux:
# python3 -m venv venv && source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run ML unit tests
python -m unittest test_service.py

# Start ML FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Verify: Open [http://localhost:8000/health](http://localhost:8000/health) in your browser. You should receive `{"status": "healthy", ...}`.

---

### Step 3.2: Node.js Backend Setup
Open Terminal 2:
```bash
cd server

# Install Node dependencies
npm install

# Configure environment
cp .env.example .env
```

Open `server/.env` in your editor and configure your `MONGODB_URI`:
- **If using MongoDB Atlas:** Paste your connection string:  
  `MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/reforge?retryWrites=true&w=majority`
- **If using local MongoDB:**  
  `MONGODB_URI=mongodb://localhost:27017/reforge`

#### Seed the Database and Run Evaluation Benchmark:
```bash
# Seed realistic synthetic multi-sensor dataset with labelled anomalies:
npm run seed -- --reset

# Run evaluation benchmark comparing Rule vs ML vs Hybrid:
npm run evaluate
```

#### Run Automated Test Suites:
```bash
node test/runTests.js
```
*(All 4 test suites for Semantic Rules, Hybrid Decision Engine, Sandbox Runner, and GitHub Integration should pass).*

#### Start the Server:
```bash
npm run dev
```
Verify: Server listens on `http://localhost:5000`.

---

### Step 3.3: React Frontend Setup
Open Terminal 3:
```bash
cd frontend

# Install frontend dependencies
npm install

# Start Vite development server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. The REFORGE dashboard will open immediately.

---

## 4. End-to-End Walkthrough & Feature Demo

Once all three services are running:

### 1. Ingestion & Semantic Validation (`/ingest`)
- Navigate to the **Ingest** tab.
- Click **"Inject Demo Batch"** or upload a CSV/JSON file.
- The pipeline processes the payload through structural schema validation, feature extraction, 4 semantic rules, and ML anomaly inference in parallel.

### 2. Live Dashboard (`/`)
- View real-time KPIs: Total Observations, Valid, Suspicious, Invalid, and Quarantined counts.
- Inspect the **Rule / ML Agreement Rate** badge and the current active validation mode (`shadow` or `hybrid`).

### 3. Rule vs. ML Comparison (`/comparison`)
- Inspect the matrix classifying every observation into:
  - `Rule Normal / ML Normal` (Consensus valid)
  - `Rule Anomaly / ML Anomaly` (High-confidence anomaly)
  - `Rule Anomaly / ML Normal` (Physical or historical threshold alert)
  - `Rule Normal / ML Anomaly` (Multivariate anomaly detected by Isolation Forest)
- Filter by date range, entity ID, or specific sensor types.

### 4. Benchmark & Metrics Evaluation (`/evaluation`)
- View the **Confusion Matrix** (TP, FP, TN, FN).
- Review Precision, Recall, F1-Score, and Specificity.
- Inspect the **Anomaly Breakdown table** showing detection rates across Implausible Jumps, Historical Deviations, Cross-Sensor Contradictions, and Gradual Drift.

### 5. Quarantine & Human Review (`/quarantine`)
- View all quarantined records requiring human sign-off.
- Click **"Inspect"** to see raw observation values, z-scores, peer group readings, and audit evidence.
- Accept or reject with audit comments.

### 6. Agentic ETL Repair & Sandbox Verification (`/repairs`)
- From any quarantined anomaly, click **"Diagnose & Propose Repair"**.
- The diagnostic engine analyzes the failure category (e.g. `transformation_error`, `schema_drift`) and uses the configured LLM provider to draft a surgical code patch.
- Click **"Run Sandbox Verification"**:
  - The patch is mounted into an ephemeral, isolated container with `--network none` and strict RAM/CPU limits.
  - The patch is verified for syntax, runtime stability, and semantic correctness (does it resolve the anomaly without introducing regressions?).
- Click **"Create Pull Request"**:
  - Upon sandbox approval, REFORGE generates a dedicated Git branch and PR with formatted evidence.
- An authorized reviewer can click **"Approve Patch"** to complete the lifecycle.

### 7. Model Governance & Registry (`/models`)
- View active and historical ML models in the model registry.
- Inspect baseline samples, hyperparameters, and contamination rates.
- Promote new candidate models or roll back with 1-click safety guarantees.

---

## 5. Configuration Reference (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port for Express backend |
| `MONGODB_URI` | *required* | MongoDB Atlas connection string or local MongoDB URI |
| `VALIDATION_MODE` | `shadow` | Decision mode: `rule_only`, `shadow`, or `hybrid` |
| `RISK_THRESHOLD_SUSPICIOUS` | `0.3` | Score threshold for suspicious classification |
| `RISK_THRESHOLD_INVALID` | `0.6` | Score threshold for invalid classification |
| `ML_SERVICE_URL` | `http://localhost:8000` | URL for FastAPI ML microservice |
| `ML_TIMEOUT_MS` | `2000` | Timeout before safe rule-based fallback |
| `LLM_PROVIDER` | `mock` | Repair LLM: `mock` (offline heuristic), `gemini`, or `openai` |
| `GEMINI_API_KEY` | *(optional)* | Required only if `LLM_PROVIDER=gemini` |
| `OPENAI_API_KEY` | *(optional)* | Required only if `LLM_PROVIDER=openai` |
| `GITHUB_REPO` | `Kushal08-04/Reforge` | GitHub repository for automated repair PRs |
| `GITHUB_TOKEN` | *(optional)* | Personal access token with repo scope (operates in safe mock mode if omitted) |

---

## 6. Troubleshooting & FAQ

#### Q: PowerShell blocks virtual environment activation (`Activate.ps1`)
**Fix:** Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your PowerShell window, then run `.\venv\Scripts\Activate.ps1`.

#### Q: Docker is not running on my machine. Can I still test repair verification?
**Yes.** `sandboxService.js` automatically detects if Docker Desktop is available. If Docker is offline, it securely executes the patch test suite in an isolated Node subprocess fallback while preserving all verification assertions.

#### Q: What happens if the ML microservice is stopped or crashes?
**Zero downtime.** The Node.js `mlClient.js` includes non-blocking timeouts (default 2s) and circuit protection. If the ML service is unreachable, REFORGE logs the outage, gracefully falls back to the authoritative rule-based engine, and continues ingesting without dropping records.

#### Q: How do I wipe the local database and restart with clean demo data?
**Run:**
```bash
cd server
npm run seed -- --reset
npm run evaluate
```
