# REFORGE - Architecture (MVP)

## What REFORGE does

REFORGE ingests sensor-style observations, runs them through a two-stage
validation pipeline, and routes anything questionable into a human review
queue with a full audit trail:

```
POST /api/ingest
       │
       ▼
Raw Storage (RawObservation - immutable, never mutated)
       │
       ▼
Schema/Structural Validation (Joi: required fields, types, format)
       │
       ├── invalid ──► classification = "invalid" (semantic engine skipped)
       │
       └── valid
            │
            ▼
     Semantic Feature Construction (featureBuilder.js)
       - rolling mean/std over this entity's last 20 readings
       - rate of change vs. previous reading
       - cross-sensor comparison vs. same-type peers in nearby zones
            │
            ▼
     Rule Engine (ruleEngine.js) - 4 explainable rules
       - rateOfChangeRule
       - historicalZScoreRule
       - crossSensorRule
       - implausibleJumpRule
            │
            ▼
     Scoring Engine (scoringEngine.js)
       weighted sum of triggered severities → risk score [0,1]
       → classification: valid / suspicious / invalid
            │
            ▼
ValidationResult saved (schema result + features + evidence + score)
            │
            ├── valid ──────────────► done, available on the dashboard
            │
            └── suspicious/invalid ─► QuarantineRecord created
                                              │
                                              ▼
                                    Human review via
                                    PATCH /api/quarantine/:id/review
                                    (approve / reject / correct)

AuditLog: one append-only entry written at every step above
          (ingested, schema_validated, semantic_validated, quarantined,
          review_approved / review_rejected / review_corrected)
```

## Why entities are named `<zone>-<type>`

To get "cross-sensor context" (Section 6 of the project handoff) without a
separate sensor-relationship config table, this MVP uses a naming
convention: `entityId = "<zone>-<type>"`, e.g. `zone-a-temperature`,
`zone-b-temperature`, `zone-c-temperature`. The feature builder groups
peers by matching `<type>` across zones - sensors of the same kind in
different zones are expected to broadly agree, so if one diverges sharply
from the others in the same time window, that's cross-sensor evidence.

This is a simplification explicitly appropriate for a hackathon-scoped
MVP (see `ways-of-working`: "mock and simplify ruthlessly"). A production
version would look up real sensor relationships instead of inferring them
from a naming convention.

## Data model

```
RawObservation          (immutable - the ground truth of what was received)
   │ referenced by
   ▼
ValidationResult        (schema result + feature snapshot + rule evidence
                          + risk score + classification)
   │ if suspicious/invalid, spawns
   ▼
QuarantineRecord         (reviewStatus: pending → approved/rejected/corrected;
                           correctedValues stored separately from the raw value)

AuditLog                 (append-only, references RawObservation directly,
                           one entry per pipeline step and per review action)
```

## Backend structure

```
server/
├── src/
│   ├── app.js                        Express entry point, route wiring
│   ├── config/db.js                  MongoDB Atlas connection
│   ├── models/                       RawObservation, ValidationResult,
│   │                                 QuarantineRecord, AuditLog
│   ├── services/
│   │   ├── schemaValidator.js        Joi structural validation
│   │   ├── featureBuilder.js         rolling stats + cross-sensor context
│   │   ├── ruleEngine.js             4 explainable semantic rules
│   │   ├── scoringEngine.js          weighted score → classification
│   │   ├── auditService.js           audit log helper
│   │   ├── validationPipeline.js     orchestrates the full flow end-to-end
│   │   └── datasetGenerator.js       synthetic multi-sensor dataset + labels
│   ├── controllers/                  one per resource (ingest, validate,
│   │                                 quarantine, audit, dashboard)
│   ├── routes/                       Express routers, mounted in app.js
│   ├── scripts/
│   │   ├── seedDataset.js            generates + ingests the demo dataset
│   │   └── evaluate.js               precision/recall/F1 vs. ground truth
│   └── utils/verifyModels.js         DB connectivity checkpoint script
└── package.json
```

## Frontend structure

```
frontend/
├── src/
│   ├── api/client.js                 axios instance (VITE_API_BASE_URL)
│   ├── app/store.js                  Redux Toolkit store
│   ├── features/
│   │   ├── dashboard/dashboardSlice.js
│   │   ├── quarantine/quarantineSlice.js   (list, detail, review thunks)
│   │   └── audit/auditSlice.js
│   ├── components/                   Navbar, StatCard, ClassificationBadge
│   ├── pages/
│   │   ├── DashboardPage.jsx         counts, chart, per-entity health,
│   │   │                             recent events
│   │   ├── QuarantinePage.jsx        review queue with status filter
│   │   ├── RecordDetailPage.jsx      evidence + history + review actions
│   │   └── AuditPage.jsx             full decision/review timeline
│   ├── App.jsx                       routes
│   └── index.css                     design tokens + component styles
└── package.json
```

## API summary

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + DB connectivity |
| POST | `/api/ingest` | ingest one observation or `{ records: [...] }` |
| GET | `/api/validation/:id` | fetch a validation result |
| GET | `/api/quarantine` | list quarantine records (`?status=`, `?classification=`) |
| GET | `/api/quarantine/:id` | full review context for one record |
| PATCH | `/api/quarantine/:id/review` | `{ action: approve\|reject\|correct, ... }` |
| GET | `/api/audit/:id` | full audit lineage for a raw observation |
| GET | `/api/dashboard` | aggregate pipeline health metrics |

## What's intentionally out of scope for this MVP

Per the approved implementation plan and `ways-of-working` principles:
Kafka/MQTT streaming, multi-protocol ingestion, authentication/RBAC, a
separate Python ML microservice, and Docker/production deployment
topology. The rule-based engine here is the full semantic differentiator;
a Python + Isolation Forest hybrid layer remains a clearly separable
stretch addition (`engineMode: "hybrid"` is already a valid enum value on
`ValidationResult`, ready for that extension without a schema change).
