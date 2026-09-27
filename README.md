# ⚡ Reforge

### Context-Aware Intelligent ETL Pipeline for IoT Sensor Data

<p align="center">
  <b>Detect • Validate • Explain • Correct • Verify</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active%20Development-blue" alt="Status">
  <img src="https://img.shields.io/badge/Domain-IoT%20%7C%20Data%20Engineering-purple" alt="Domain">
  <img src="https://img.shields.io/badge/ML-Anomaly%20Detection-orange" alt="ML">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## 📌 Overview

**Reforge** is an intelligent, context-aware ETL pipeline designed to detect, validate, explain, and correct anomalous **IoT sensor data** before it reaches downstream systems.

Traditional ETL pipelines mainly verify whether incoming data follows the expected schema and data types. Reforge goes further by determining whether sensor readings are **semantically and contextually correct**.

It combines:

* Rule-based validation
* Statistical analysis
* Temporal behavior analysis
* Cross-sensor correlation
* Machine-learning anomaly detection
* Semantic/contextual verification
* Confidence-based correction
* Quarantine and audit mechanisms

> **Core Principle:** Syntactically valid data is not necessarily semantically correct.

---

## 🎯 Problem

IoT systems continuously generate large volumes of sensor data. A pipeline may successfully process a record even when the value itself is incorrect.

For example:

```text
Previous Temperature → 24°C
Current Temperature  → 72°C
Next Temperature     → 25°C
```

The value `72°C` is syntactically valid, but its context strongly suggests an anomaly.

Reforge identifies such problems before they propagate into analytics, monitoring, and downstream decision-making systems.

---

## 💡 How Reforge Works

```text
┌─────────────────┐
│  IoT Sensors    │
│  / Simulator    │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Data Ingestion  │
│ REST / CSV /    │
│ JSON            │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Raw Data Store  │
└────────┬────────┘
         ↓
┌─────────────────┐
│ ETL Processing  │
└────────┬────────┘
         ↓
┌─────────────────────────────┐
│ Validation & Intelligence   │
│                             │
│ • Schema / Type             │
│ • Range / Unit              │
│ • Missing / Duplicate       │
│ • Temporal Behaviour        │
│ • Statistical Analysis      │
│ • Cross-Sensor Context      │
│ • ML Anomaly Detection      │
└──────────────┬──────────────┘
               ↓
      ┌────────┴────────┐
      ↓                 ↓
   VALID             ANOMALY
      │                 │
      │        ┌────────┴────────┐
      │        ↓                 ↓
      │    CORRECT           QUARANTINE
      │        │
      └────────┴───────────────┐
                               ↓
                       Verified Dataset
                               ↓
                       Admin Dashboard
```

---

## ✨ Key Features

### 🔍 Intelligent Validation

Detect schema errors, invalid types, missing values, duplicates, impossible ranges, and inconsistent units.

### 📈 Temporal Analysis

Analyze historical sensor behavior, rolling statistics, sudden spikes, drops, and sensor drift.

### 🤖 ML-Based Anomaly Detection

Use machine-learning models to identify abnormal sensor behavior that traditional validation rules may miss.

### 🌐 Cross-Sensor Context

Compare related sensors to identify geographically or logically inconsistent measurements.

### 🧠 Semantic Verification

Combine multiple evidence sources to determine whether a sensor reading is contextually trustworthy.

### 🔧 Safe Correction

Automatically correct high-confidence deterministic errors while preserving the original record.

### 🚨 Quarantine

Uncertain or high-risk records are isolated for administrator review instead of being silently modified.

### 📝 Complete Audit Trail

Track original values, corrected values, reasons, confidence, evidence, and administrative actions.

### 📊 Admin Dashboard

Monitor pipeline health, sensor trends, anomalies, corrections, quarantined records, and verification results.

---

# 🏗️ Architecture

```text
                         ┌────────────────────┐
                         │    IoT Sensors     │
                         │   / Data Simulator │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │   Node.js / API    │
                         │     Ingestion      │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │   Redis / BullMQ   │
                         │   Queue & Buffer   │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ Processing Worker   │
                         └─────────┬──────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 ▼                 ▼                 ▼
           ┌───────────┐    ┌────────────┐    ┌─────────────┐
           │  Rules    │    │ Statistics │    │ ML Service  │
           │ Validation│    │  Analysis  │    │  FastAPI    │
           └─────┬─────┘    └─────┬──────┘    └──────┬──────┘
                 │                │                    │
                 └────────────────┼────────────────────┘
                                  ▼
                       ┌─────────────────────┐
                       │ Semantic / Context  │
                       │ Verification Engine │
                       └──────────┬──────────┘
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                    ┌─────────┐      ┌────────────┐
                    │ Valid / │      │ Quarantine │
                    │Corrected│      │  / Review  │
                    └────┬────┘      └─────┬──────┘
                         │                 │
                         └────────┬────────┘
                                  ▼
                       ┌─────────────────────┐
                       │ PostgreSQL/PostGIS  │
                       │ Data + Audit Store  │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │ React Admin         │
                       │ Dashboard           │
                       └─────────────────────┘
```

---

# 🛠️ Tech Stack

| Layer             | Technology                     | Purpose                   |
| ----------------- | ------------------------------ | ------------------------- |
| Frontend          | React + TypeScript + Vite      | Admin dashboard           |
| Backend           | Node.js + Express + TypeScript | API & orchestration       |
| ML Service        | Python + FastAPI               | ML/anomaly processing     |
| Data Processing   | Pandas + NumPy                 | Transformation & analysis |
| ML                | Scikit-learn                   | Anomaly detection         |
| Database          | PostgreSQL                     | Persistent storage        |
| Geospatial        | PostGIS                        | Sensor location/context   |
| Queue             | Redis + BullMQ                 | Async processing          |
| Containers        | Docker                         | Service isolation         |
| Testing           | Jest / Pytest                  | Automated testing         |
| Future            | Kubernetes / AWS EKS           | Production deployment     |
| Future Monitoring | Prometheus + Grafana           | Observability             |

---

# 🤖 Machine Learning

## Current Models

### Isolation Forest

Used for unsupervised anomaly detection.

Features can include:

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

Used as a supervised baseline for fault classification.

### XGBoost

Used for higher-performance fault classification and comparison against baseline models.

---

# 🔎 Detected Anomalies

Reforge can identify:

```text
✓ Missing Values
✓ Duplicate Records
✓ Type Errors
✓ Physical Range Errors
✓ Outliers
✓ Sudden Spikes
✓ Sudden Drops
✓ Sensor Drift
✓ Stale Data
✓ Timestamp Errors
✓ Unit Inconsistency
✓ Temporal Inconsistency
✓ Cross-Sensor Inconsistency
✓ Semantic Errors
✓ Corrupted Payloads
```

---

# 📡 Supported Input

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

# 🚀 Getting Started

## Prerequisites

Install:

* Node.js 20+
* Python 3.11+
* Docker
* Docker Compose
* Git

---

## 1. Clone Repository

```bash
git clone https://github.com/<your-username>/reforge.git
cd reforge
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Update the required database, Redis, API, and ML-service configuration.

---

## 3. Start Infrastructure

```bash
docker compose up -d postgres redis
```

---

## 4. Install Backend

```bash
cd backend
npm install
npm run dev
```

---

## 5. Start ML Service

```bash
cd ml-service
python -m venv .venv
```

### Windows

```bash
.venv\Scripts\activate
```

### Linux/macOS

```bash
source .venv/bin/activate
```

Then:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 6. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

---

# 🧪 Sensor Data Simulator

Reforge includes a development simulator for generating controlled sensor streams.

Example:

```bash
cd simulator
python generate.py
```

The simulator can generate:

```text
Normal Data
Missing Values
Duplicates
Outliers
Spikes
Drops
Sensor Drift
Unit Errors
Timestamp Errors
Cross-Sensor Conflicts
Semantic Errors
```

Each injected fault maintains ground-truth information for testing and research evaluation.

---

# 🔌 API Usage

### Health Check

```http
GET /api/v1/health
```

### Send Sensor Data

```http
POST /api/v1/ingestion/records
```

Example:

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

### Get Anomalies

```http
GET /api/v1/anomalies
```

### Get Pipeline Statistics

```http
GET /api/v1/pipeline/statistics
```

### Get Processed Data

```http
GET /api/v1/data/processed
```

---

# 📊 Dashboard

The Reforge dashboard provides:

* 📈 Pipeline health
* 🌡️ Sensor monitoring
* 🚨 Anomaly detection
* 🔍 Record inspection
* 🔧 Correction review
* 🗃️ Quarantine management
* 📋 Audit history
* 📊 Processing statistics
* 🧠 Semantic verification evidence

---

# 🧪 Research & Evaluation

Reforge supports reproducible fault-injection experiments.

The evaluation pipeline is:

```text
Clean Dataset
     ↓
Fault Injection
     ↓
Reforge
     ↓
Detection
     ↓
Correction / Quarantine
     ↓
Compare with Ground Truth
```

## Evaluation Metrics

```text
Precision
Recall
F1 Score
False Positive Rate
False Negative Rate
Detection Latency
Correction Accuracy
Safe Correction Rate
```

The initial research benchmark should contain at least **400 controlled fault cases**, distributed across multiple failure categories.

---

# 📁 Project Structure

```text
reforge/
│
├── frontend/
├── backend/
├── ml-service/
├── simulator/
├── database/
├── tests/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── research.md
│
├── docker-compose.yml
├── .env.example
├── README.md
└── LICENSE
```

---

# 🔐 Security

Reforge follows basic security practices including:

* API authentication
* Role-based authorization
* Request validation
* Rate limiting
* Environment-based secrets
* Parameterized database queries
* Request-size limits
* Immutable raw data
* Audit logging

Secrets should **never** be committed to the repository.

---

# 🗺️ Roadmap

### Phase 1 — MVP

* [x] Core architecture
* [ ] Sensor ingestion
* [ ] CSV/JSON support
* [ ] PostgreSQL integration
* [ ] Redis/BullMQ
* [ ] Validation engine
* [ ] Statistical anomaly detection
* [ ] Isolation Forest
* [ ] Semantic verification
* [ ] Correction engine
* [ ] Quarantine
* [ ] Admin dashboard
* [ ] Automated tests

### Phase 2 — Advanced Intelligence

* [ ] LSTM-based temporal analysis
* [ ] Autoencoder anomaly detection
* [ ] Advanced cross-sensor modelling
* [ ] Automated model evaluation
* [ ] Adaptive thresholds
* [ ] Model retraining

### Phase 3 — Self-Healing ETL

* [ ] Failure diagnosis
* [ ] LLM-assisted repair generation
* [ ] Docker sandbox execution
* [ ] Semantic repair verification
* [ ] GitHub PR generation
* [ ] Automated deployment
* [ ] Monitoring
* [ ] Automated rollback

### Phase 4 — Production

* [ ] Kubernetes
* [ ] AWS EKS
* [ ] Horizontal scaling
* [ ] Prometheus
* [ ] Grafana
* [ ] Distributed processing
* [ ] Production security hardening

---

# 🧠 Research Principle

Reforge is built around a simple distinction:

```text
             Traditional ETL

        Schema Valid?
             ↓
            YES
             ↓
        Store Data


             Reforge

        Schema Valid?
             ↓
            YES
             ↓
        Context Valid?
             ↓
       ┌─────┴─────┐
      YES          NO
       ↓            ↓
    TRUST        ANALYZE
                    ↓
             CORRECT / REVIEW
```

> **Successful processing does not prove data correctness.**

Reforge therefore treats **semantic verification as a safety gate between raw processing and trusted data**.

---

# 🤝 Contributing

Contributions are welcome.

```bash
git checkout -b feature/your-feature
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

Then open a Pull Request with:

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

**Reforge — Intelligent Context-Aware ETL Pipeline**

Built as a research-oriented project exploring reliable IoT data processing, semantic validation, anomaly detection, and the foundations of self-healing data pipelines.

**Core idea:**

### `Raw Data → Intelligence → Verification → Trusted Data`
