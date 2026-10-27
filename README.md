# ⚡ REFORGE

### Semantic Validation Engine for IoT Data Pipelines

<p align="center">
  <b>Ingest • Validate • Analyze • Explain • Verify • Quarantine</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-MVP-blue" alt="Status">
  <img src="https://img.shields.io/badge/Domain-IoT%20%7C%20Data%20Engineering-purple" alt="Domain">
  <img src="https://img.shields.io/badge/Semantic%20Validation-Rule--Based-orange" alt="Semantic Validation">
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB" alt="Frontend">
  <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-green" alt="Backend">
</p>

---

## 📌 Overview

**Reforge** is a semantic validation engine for IoT sensor data pipelines.

Traditional ETL pipelines primarily determine whether incoming records are structurally valid-for example, whether required fields exist, data types are correct, and values follow the expected schema.

Reforge goes one step further.

It evaluates whether a sensor observation is **contextually believable** based on:

* Rate of change
* Historical sensor behavior
* Cross-sensor agreement
* Statistical context
* Physical plausibility
* Previously observed patterns

Each incoming observation is classified as:

```text
VALID
SUSPICIOUS
INVALID
```

Suspicious and invalid observations can be quarantined for human review while the original data is preserved. Every decision and administrative action is recorded in an append-only audit trail.

> **Core Principle:** Syntactically valid data is not necessarily semantically correct.

---

# 🎯 The Problem

IoT systems continuously generate large volumes of sensor data. A record can successfully pass schema validation while still representing an incorrect physical observation.

For example:

```text
Previous Temperature → 24°C
Current Temperature  → 72°C
Next Temperature     → 25°C
```

The value `72°C` is:

* Structurally valid
* Numerically valid
* Correctly formatted

But in its temporal context, it is highly suspicious.

A conventional ETL pipeline may accept it.

Reforge evaluates the **context surrounding the observation** before allowing it to become trusted data.

---

# 💡 What Reforge Does

Reforge processes sensor observations through the following pipeline:

```text
Incoming Sensor Data
        │
        ▼
┌─────────────────────┐
│ Ingestion            │
│ JSON / API / Dataset │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Schema Validation   │
│ Type & Structure    │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Feature Construction│
│ History + Context   │
└──────────┬──────────┘
           ▼
┌────────────────────────────┐
│ Semantic Validation Engine │
│                            │
│ • Rate of Change           │
│ • Historical Z-Score       │
│ • Cross-Sensor Agreement   │
│ • Implausible Jump         │
└────────────┬───────────────┘
             ▼
      Weighted Risk Score
             │
       ┌─────┼─────┐
       ▼     ▼     ▼
     VALID SUSPICIOUS INVALID
             │       │
             └───┬───┘
                 ▼
           Quarantine
                 │
                 ▼
          Human Review
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
    Approve    Reject    Correct
                 │
                 ▼
           Audit Trail
```

---

# ✨ Key Features

## 🔍 Structural Validation

The ingestion layer validates:

* Required fields
* Data types
* Timestamp format
* Sensor identifiers
* Payload structure
* Basic input constraints

The MVP uses **Joi** for structural validation.

---

## 🧠 Semantic Validation

Reforge's primary differentiator is its explainable semantic engine.

The current MVP implements four semantic rules:

### 1. Rate-of-Change Detection

Checks whether the change from the previous observation is unusually large.

```text
Current Value - Previous Value
--------------------------------
       Time Difference
```

This helps identify sudden spikes and drops.

### 2. Historical Z-Score

Compares the current observation against the sensor's historical behavior.

```text
Z = (x - μ) / σ
```

Large deviations indicate that the observation may not belong to the sensor's normal operating pattern.

### 3. Cross-Sensor Disagreement

Compares a sensor's observation with related sensors.

Example:

```text
TEMP-001 → 24°C
TEMP-002 → 25°C
TEMP-003 → 73°C  ← suspicious
TEMP-004 → 24°C
```

The disagreement provides contextual evidence that the observation may be anomalous.

### 4. Implausible Jump

Detects unusually large changes that are inconsistent with expected sensor behavior.

These rules generate explainable evidence rather than producing an opaque anomaly label.

---

# 📊 Risk Scoring

Evidence from multiple semantic checks is combined into a weighted risk score.

Conceptually:

```text
                  ┌──────────────────┐
                  │ Rate of Change   │
                  └────────┬─────────┘
                           │
                  ┌────────▼─────────┐
                  │ Historical Score  │
                  └────────┬─────────┘
                           │
                  ┌────────▼─────────┐
                  │ Cross-Sensor      │
                  │ Agreement        │
                  └────────┬─────────┘
                           │
                  ┌────────▼─────────┐
                  │ Implausible Jump  │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Weighted Risk    │
                  │ Score            │
                  └────────┬─────────┘
                           ▼
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
           VALID       SUSPICIOUS      INVALID
```

The exact thresholds and weights are configurable and can be tuned during research evaluation.

---

# 🚨 Classification

Every processed observation receives one of three semantic classifications:

| Classification | Meaning                                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| **VALID**      | Observation is structurally valid and contextually believable                        |
| **SUSPICIOUS** | Evidence suggests an anomaly, but confidence is insufficient for automatic rejection |
| **INVALID**    | Strong evidence indicates that the observation is not trustworthy                    |

Suspicious and invalid records can be moved into the quarantine workflow.

---

# 🗃️ Quarantine & Human Review

Reforge does not silently discard questionable sensor observations.

Instead:

```text
Suspicious / Invalid
        │
        ▼
   Quarantine
        │
        ▼
   Human Review
        │
 ┌──────┼───────┐
 ▼      ▼       ▼
Approve Reject Correct
```

Reviewers can:

* Approve the observation
* Reject the observation
* Correct the value
* Review semantic evidence
* Inspect sensor history
* Examine previous actions

The original observation remains preserved.

---

# 📝 Audit Trail

Reforge maintains an append-only audit trail covering the complete lifecycle of a record.

An audit entry can capture:

```text
Record ID
Sensor ID
Original Value
Classification
Triggered Rules
Risk Score
Evidence
Reviewer Action
Corrected Value
Timestamp
```

This provides traceability for both automated decisions and human interventions.

---

# 🧪 Synthetic Dataset & Fault Injection

The project includes a synthetic multi-sensor dataset generator for reproducible testing.

The generator produces normal observations and controlled anomalies.

Supported fault types include:

```text
Normal Data
Missing Values
Duplicate Records
Outliers
Sudden Spikes
Sudden Drops
Sensor Drift
Unit Errors
Timestamp Errors
Cross-Sensor Conflicts
Semantic Errors
```

Each injected anomaly can retain ground-truth information such as:

```text
Original Value
Corrupted Value
Correct Value
Fault Type
Injection Parameters
Sensor ID
Timestamp
```

This allows Reforge's output to be compared against known ground truth.

---

# 🧪 Research Evaluation

The evaluation pipeline is:

```text
Clean Dataset
      │
      ▼
Fault Injection
      │
      ▼
   Reforge
      │
      ▼
Semantic Detection
      │
      ▼
Classification
      │
      ▼
Correction / Quarantine
      │
      ▼
Compare With Ground Truth
```

## Evaluation Metrics

The project can evaluate:

* Precision
* Recall
* F1 Score
* False Positive Rate
* False Negative Rate
* Detection Latency
* Correction Accuracy
* Safe Correction Rate

No experimental performance percentages should be claimed until the benchmark has actually been executed.

A target research benchmark is **at least 400 controlled fault cases** distributed across multiple anomaly categories.

---

# 🏗️ Current MVP Architecture

The implemented MVP intentionally uses a simpler architecture so the semantic-validation research problem can be evaluated without unnecessary infrastructure complexity.

```text
                    ┌─────────────────────┐
                    │ Sensor / Simulator   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Node.js + Express    │
                    │ REST API             │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Joi Schema           │
                    │ Validation            │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Feature Construction │
                    │                      │
                    │ • History Statistics │
                    │ • Cross-Sensor Data  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Semantic Rule Engine │
                    │                      │
                    │ • Rate of Change     │
                    │ • Historical Z-Score │
                    │ • Cross-Sensor       │
                    │ • Implausible Jump   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Weighted Risk Score  │
                    └──────────┬──────────┘
                               │
                   ┌───────────┼───────────┐
                   ▼           ▼           ▼
                 VALID     SUSPICIOUS   INVALID
                               │           │
                               └─────┬─────┘
                                     ▼
                              ┌─────────────┐
                              │ Quarantine  │
                              └──────┬──────┘
                                     ▼
                              ┌─────────────┐
                              │ Human Review│
                              └──────┬──────┘
                                     ▼
                              ┌─────────────┐
                              │ Audit Trail │
                              └─────────────┘
```

---

# 🛠️ Current MVP Tech Stack

| Layer             | Technology                      | Purpose                    |
| ----------------- | ------------------------------- | -------------------------- |
| Frontend          | React + Vite                    | Admin dashboard            |
| State Management  | Redux Toolkit                   | Frontend state             |
| Backend           | Node.js + Express               | API and orchestration      |
| Validation        | Joi                             | Structural validation      |
| Database          | MongoDB                         | MVP persistence            |
| Semantic Engine   | Node.js                         | Explainable semantic rules |
| Dataset Generator | Node.js / project scripts       | Synthetic sensor data      |
| Testing           | Project test/evaluation scripts | Validation and research    |
| Version Control   | Git + GitHub                    | Source management          |

---

# 🔮 Planned Architecture Evolution

The broader Reforge architecture can evolve beyond the MVP into an asynchronous, ML-assisted pipeline.

```text
                  Sensor / IoT Sources
                           │
                           ▼
                    Node.js API
                           │
                           ▼
                    Redis / BullMQ
                           │
                           ▼
                  Processing Workers
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
      Rule Engine      Statistical       ML Service
                       Analysis          FastAPI
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                Semantic Verification
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
              Trusted           Quarantine
                Data             / Review
                  │                 │
                  └────────┬────────┘
                           ▼
                  Persistent Data Store
                           │
                           ▼
                    Admin Dashboard
```

Planned infrastructure may include:

* PostgreSQL
* PostGIS
* Redis
* BullMQ
* Python/FastAPI
* Scikit-learn
* Docker
* Kubernetes
* AWS EKS
* Prometheus
* Grafana

These components are **future architectural extensions**, not prerequisites for the current MVP.

---

# 🤖 Machine Learning Roadmap

The MVP's semantic differentiator is the **explainable rule-based engine**.

Machine learning is planned as an extension for larger-scale anomaly detection and comparative research.

## Planned Models

### Isolation Forest

Unsupervised anomaly detection.

Potential features:

```text
sensor_value
rolling_mean
rolling_std
value_delta
rate_of_change
time_of_day
sensor_type
neighbor_deviation
```

### Random Forest

Potential supervised baseline for fault classification.

### XGBoost

Potential higher-performance supervised model for comparison against simpler baselines.

### Future Models

```text
Autoencoder
LSTM
Transformer-based temporal models
Adaptive anomaly models
```

ML models should be evaluated experimentally rather than assumed to outperform the explainable rule engine.

---

# 📡 Supported Sensor Data

The system is designed around IoT sensor observations such as:

```text
Temperature
Humidity
Atmospheric Pressure
Vibration
RPM
Voltage
Current
Soil Moisture
Rainfall
```

The MVP can be extended to additional sensor types through configurable validation rules.

---

# 📥 Input Format

## JSON

```json
{
  "sensor_id": "TEMP-001",
  "timestamp": "2026-09-27T08:20:00Z",
  "sensor_type": "temperature",
  "value": 24.7,
  "unit": "C",
  "device_id": "DEVICE-001"
}
```

## CSV

```csv
sensor_id,timestamp,sensor_type,value,unit,device_id
TEMP-001,2026-09-27T08:20:00Z,temperature,24.7,C,DEVICE-001
```

---

# 🔌 API

## Current MVP

### Ingest Data

```http
POST /api/ingest
```

The endpoint performs:

```text
Request
  ↓
Raw-data preservation
  ↓
Idempotency check
  ↓
Schema validation
  ↓
Semantic processing
  ↓
Classification
  ↓
Persistence
```

### Dashboard Aggregation

The backend exposes aggregation data used by the frontend dashboard.

---

## Planned API Structure

As the architecture evolves, endpoints can be organized under:

```text
/api/v1/health
/api/v1/sensors
/api/v1/ingestion/records
/api/v1/ingestion/batch
/api/v1/data
/api/v1/data/raw
/api/v1/data/processed
/api/v1/data/quarantined
/api/v1/data/corrected
/api/v1/anomalies
/api/v1/verification
/api/v1/corrections
/api/v1/pipeline/status
/api/v1/pipeline/runs
/api/v1/pipeline/statistics
```

---

# 📊 Dashboard

The React dashboard provides visibility into the complete semantic-validation workflow.

## Overview Dashboard

Displays:

* Total records
* Valid records
* Suspicious records
* Invalid records
* Classification distribution
* Per-sensor health
* Recent events

## Quarantine Queue

Provides:

* Status filtering
* Suspicious/invalid records
* Review actions
* Record inspection

## Record Detail

Shows:

* Original observation
* Sensor history
* Triggered semantic rules
* Evidence
* Risk score
* Classification
* Review actions

## Audit View

Displays the complete history of decisions and modifications for each record.

---

# 📁 Project Structure

The current MVP uses the following primary structure:

```text
reforge/
│
├── server/
│   ├── routes/
│   ├── models/
│   ├── services/
│   ├── validators/
│   ├── scripts/
│   └── ...
│
├── frontend/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── store/
│   └── ...
│
├── docs/
│   ├── SETUP_GUIDE.md
│   ├── ARCHITECTURE.md
│   └── ...
│
├── tests/
│
├── .env.example
├── README.md
└── LICENSE
```

Future services such as `ml-service/`, `simulator/`, `database/`, and Docker infrastructure can be introduced as the architecture expands.

---

# 🚀 Quick Start - Current MVP

## Prerequisites

Install:

* Node.js 20+
* MongoDB Atlas or a local MongoDB installation
* Git

---

## 1. Clone the Repository

```bash
git clone <your-repository-url>
cd reforge
```

---

## 2. Configure the Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and provide your MongoDB connection URI.

---

## 3. Verify Database Connection

```bash
npm run verify
```

A successful connection confirms that the backend can communicate with MongoDB.

---

## 4. Seed Demo Data

```bash
npm run seed
```

This populates the database with a realistic synthetic multi-sensor dataset containing labelled observations and injected anomalies.

---

## 5. Start the Backend

```bash
npm run dev
```

The API runs on:

```text
http://localhost:5000
```

---

## 6. Start the Frontend

Open another terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The Vite development server runs on:

```text
http://localhost:5173
```

For detailed setup, troubleshooting, environment variables, and custom data ingestion, see:

```text
docs/SETUP_GUIDE.md
```

For architecture details, see:

```text
docs/ARCHITECTURE.md
```

---

# 🧪 Running the Evaluation

The repository includes scripts for generating and evaluating controlled sensor anomalies.

The general workflow is:

```bash
# Generate / seed data
npm run seed

# Run evaluation
npm run evaluate
```

The evaluation compares Reforge's classification against the known ground truth.

The exact commands may vary with the implementation in `server/scripts/`.

---

# 🔐 Security & Data Integrity

The current MVP prioritizes data integrity and traceability.

Implemented or planned safeguards include:

* Raw-data preservation
* Idempotent ingestion
* Input validation
* Append-only audit records
* Environment-based configuration
* Parameterized database operations

The following are planned for a production deployment:

* API authentication
* Role-based access control
* Rate limiting
* Request-size limits
* HTTPS
* Secret management
* Production security hardening

> Never commit database credentials, API keys, tokens, or other secrets to Git.

---

# 🚫 Out of Scope for the Current MVP

The following are intentionally excluded from the current MVP:

```text
Kafka
MQTT
Authentication / RBAC
Redis / BullMQ
Separate Python ML microservice
Kubernetes
AWS EKS
Prometheus
Grafana
LLM-based repair
Automated GitHub PR generation
Automated deployment
Automated rollback
```

This keeps the MVP focused on the project's primary research problem:

> **Can contextual semantic validation identify sensor observations that structural validation alone would incorrectly accept?**

---

# 🗺️ Roadmap

## Phase 1 - Semantic Validation MVP

* [x] Sensor ingestion
* [x] Raw-data preservation
* [x] Idempotent ingestion
* [x] Schema validation
* [x] Historical feature construction
* [x] Cross-sensor feature construction
* [x] Rate-of-change detection
* [x] Historical z-score detection
* [x] Cross-sensor disagreement detection
* [x] Implausible-jump detection
* [x] Weighted risk scoring
* [x] Valid/Suspicious/Invalid classification
* [x] Quarantine workflow
* [x] Human review
* [x] Audit trail
* [x] Dashboard
* [x] Synthetic dataset generation
* [x] Ground-truth evaluation

## Phase 2 - Advanced Data Intelligence

* [ ] Isolation Forest
* [ ] Random Forest baseline
* [ ] XGBoost
* [ ] Advanced temporal modelling
* [ ] Adaptive thresholds
* [ ] Automated model comparison
* [ ] Model retraining
* [ ] Larger fault-injection benchmark

## Phase 3 - Scalable Data Pipeline

* [ ] Redis
* [ ] BullMQ
* [ ] PostgreSQL
* [ ] PostGIS
* [ ] Python ML service
* [ ] Asynchronous processing
* [ ] Distributed ingestion
* [ ] Real-time sensor streams

## Phase 4 - Self-Healing ETL

* [ ] Automated failure diagnosis
* [ ] LLM-assisted repair generation
* [ ] Isolated repair execution
* [ ] Semantic repair verification
* [ ] GitHub PR generation
* [ ] Automated deployment
* [ ] Monitoring
* [ ] Automated rollback

## Phase 5 - Production Infrastructure

* [ ] Dockerized services
* [ ] Kubernetes
* [ ] AWS EKS
* [ ] Horizontal scaling
* [ ] Prometheus
* [ ] Grafana
* [ ] Production security hardening

---

# 🧠 Research Principle

Traditional ETL commonly follows:

```text
Incoming Data
     │
     ▼
Schema Valid?
     │
    YES
     │
     ▼
Process / Store
```

Reforge introduces an additional safety gate:

```text
Incoming Data
     │
     ▼
Schema Valid?
     │
    YES
     │
     ▼
Contextually Valid?
     │
 ┌───┴────┐
YES       NO
 │         │
 ▼         ▼
TRUST    ANALYZE
           │
     ┌─────┴─────┐
     ▼           ▼
  CORRECT      REVIEW
```

The fundamental research proposition is:

> **Successful processing does not prove data correctness.**

Reforge therefore treats **semantic verification as a safety layer between structurally valid data and trusted downstream data**.

---

# 🔬 Research Direction

The project is designed to investigate whether combining multiple contextual signals can improve the reliability of IoT data validation.

The core evidence sources are:

```text
Structural Evidence
        +
Temporal Evidence
        +
Historical Evidence
        +
Cross-Sensor Evidence
        +
Statistical Evidence
        ↓
Semantic Decision
```

The research can compare:

```text
Schema-only Validation
        vs.
Rule-based Semantic Validation
        vs.
ML-based Detection
        vs.
Hybrid Validation
```

Performance should be reported using measured experimental results rather than assumed improvements.

---

# 🤝 Contributing

Contributions are welcome.

Create a feature branch:

```bash
git checkout -b feature/your-feature
```

Commit using a descriptive message:

```bash
git commit -m "feat: add semantic validation rule"
```

Push the branch:

```bash
git push origin feature/your-feature
```

Then open a Pull Request containing:

* Description of the change
* Implementation details
* Tests
* Screenshots where applicable
* Known limitations

---

# 📄 License

This project is licensed under the **MIT License**.

---

# 👨‍💻 Project

**Reforge - Semantic Validation Engine for IoT Data Pipelines**

A research-oriented project exploring:

* Reliable IoT data processing
* Semantic validation
* Context-aware anomaly detection
* Explainable data-quality decisions
* Human-in-the-loop data correction
* Trusted data pipelines
* Foundations of self-healing ETL systems

### Core Idea

```text
Raw Sensor Data
       ↓
Structural Validation
       ↓
Contextual Intelligence
       ↓
Semantic Verification
       ↓
Valid / Suspicious / Invalid
       ↓
Correction / Review / Quarantine
       ↓
Trusted Data
```

> **REFORGE: From structurally valid data to contextually trusted data.**
