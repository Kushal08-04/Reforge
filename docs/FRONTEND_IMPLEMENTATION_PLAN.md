# REFORGE - Frontend Implementation Plan (Finalized)

## 1. Metric Provenance & Ground-Truth Validation
Every metric displayed in the REFORGE interface is tied to its verified backend source, API endpoint, and computation. No metrics are fabricated or estimated in live mode.

| UI Metric | Endpoint | Source Field / Computation | State on Missing Data |
|---|---|---|---|
| **Pipeline Status** | `GET /api/health`, `GET /api/dashboard` | `health.status === 'ok'` & `dbState === 'connected'` | Display `DISCONNECTED` / `DEGRADED` banner |
| **Total Ingested** | `GET /api/dashboard` | `data.totalIngested` | Display `-` if API fails; `0` if empty DB |
| **Valid Observations** | `GET /api/dashboard` | `data.classificationCounts.valid` | Display `-` if API fails; `0` if empty |
| **Suspicious Observations** | `GET /api/dashboard` | `data.classificationCounts.suspicious` | Display `-` if API fails; `0` if empty |
| **Invalid Observations** | `GET /api/dashboard` | `data.classificationCounts.invalid` | Display `-` if API fails; `0` if empty |
| **Active Quarantine Pending** | `GET /api/dashboard` | `data.pendingReviewCount` | Display `-` if API fails; `0` if empty |
| **Rule/ML Agreement Rate** | `GET /api/dashboard`, `GET /api/comparison` | `data.agreementStats.agreementRate` (float 0.0-1.0) | Display `-` if total evaluated = 0 |
| **Disagreement Count** | `GET /api/dashboard`, `GET /api/comparison` | `data.agreementStats.disagreementCount` | Display `-` if total evaluated = 0 |
| **ML Inference Failures** | `GET /api/dashboard` | `data.agreementStats.mlFailuresCount` | Display `0` or integer count |
| **Average ML Latency** | `GET /api/evaluation/latest` | `evaluation.latencyMetrics.avgInferenceMs` | Display `N/A` if no benchmark run yet |
| **Verified Recoveries** | `GET /api/repairs?state=VERIFIED` | `proposals.filter(p => p.lifecycleState === 'VERIFIED').length` | Display exact integer count |
| **Active Model Version** | `GET /api/dashboard`, `GET /api/models` | `systemStatus.activeModel` | Display model name and version tag |
| **Decision Engine Mode** | `GET /api/dashboard` | `systemStatus.validationMode` (`shadow` \| `hybrid` \| `rule_only`) | Display read-only badge |
| **Per-Entity Metrics** | `GET /api/dashboard` | `data.perEntity` (`total`, `valid`, `suspicious`, `invalid`, `avgRiskScore`) | Table format, empty indicator if none |

---

## 2. Repair Operation Safety & Backend State Machine

### Exact Lifecycle State Machine (`models/RepairProposal.js` & `sandboxService.js`)
```
[ DETECTED ] ──► [ DIAGNOSING ] ──► [ PROPOSED ]
                                         │
                                         ▼ (POST /api/repairs/:id/sandbox)
                                 [ SANDBOX_RUNNING ]
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
   (Tests pass AND semantic risk < 0.30)     (Tests fail OR semantic risk >= 0.30 OR error)
              [ VERIFIED ]                              [ SANDBOX_FAILED ]
                    │                                         │
         ┌──────────┴──────────┐                              │
         ▼                     ▼                              ▼
(POST /:id/create-pr)   (PATCH /:id/review)           (PATCH /:id/review)
  [ PR_CREATED ]        decision: "approved"          decision: "rejected"
         │                     │                              │
         ▼                     ▼                              ▼
(PATCH /:id/review)       [ APPROVED ]                   [ REJECTED ]
decision: "approved"
         │
         ▼
    [ APPROVED ]
```

### Safety Rules Enforced in UI:
1. **Never mark repair as successful on execution completion alone**:
   * Exit code 0 is NOT sufficient.
   * `sandboxResult.status === "PASS"` AND `proposal.lifecycleState === "VERIFIED"` (risk score verified $< 0.30$) are required before displaying a green Verified state.
2. **Approval Gate Guard**:
   * "Approve" button is disabled unless state is `VERIFIED`, `PR_CREATED`, or `NEEDS_REVIEW`.
   * Displays clear explanation: *"Requires verified sandbox execution (risk < 0.30) before human approval."*
3. **PR Creation Guard**:
   * "Create GitHub PR" disabled unless state is `VERIFIED`.
4. **Duplicate Submission Prevention**:
   * Double-click prevention & optimistic loading states on all diagnostic, sandbox, and PR actions.
5. **Partial Failures & Error Handling**:
   * If sandbox crashes (`EXECUTION_ERROR`) or Docker is unavailable (`UNAVAILABLE`), displays raw stderr/stdout and failure reason from `proposal.sandboxResult.failureReason`.

---

## 3. Separation of Live Mode and Explicit Demo Mode
* **No silent mock fallbacks**: Live mode strictly displays live backend responses or connection failure screens.
* **Explicit Demo Mode**:
  * Activated ONLY when user toggles `[Data Mode: Demo]` or clicks `Try Demo Mode` upon backend connection failure.
  * Prominent, persistent top banner: `[DEMO DATA MODE ACTIVE - SHOWING DETERMINISTIC TEST SCENARIOS]`.
  * Every table and chart displays a `[DEMO]` watermark.
  * Deterministic test scenarios: Normal Multi-sensor stream, Rate-of-Change spike (24.5°C to 72.8°C), Historical Drift, Spatial Disagreement, Cascade Sandbox Healing (<0.30 risk), Failed Sandbox Patch.

---

## 4. Truthful Pipeline Map Architecture
* **Actual 8-Stage Architecture**:
  1. *IoT Ingestion* (`POST /api/ingest`, Joi schema validator)
  2. *Raw Storage* (`RawObservation`, immutable preservation)
  3. *Feature Builder* (`featureBuilder.js`, 13 rolling & cross-sensor spatial features)
  4. *Dual Validation* (Deterministic `ruleEngine.js` + ML FastAPI Isolation Forest)
  5. *Hybrid Arbiter* (`hybridDecisionEngine.js`, `shadow` / `hybrid` / `rule_only`)
  6. *Quarantine & Sandbox* (`dataRepairService.js`, `sandboxService.js`)
  7. *Post-Repair Semantic Verification* (Re-verification check < 0.30 risk)
  8. *Clean Overlays & Audit* (`DatasetVersion`, `AuditLog`, GitHub PR)
* **Metric Truthfulness**:
  * Displays verified counts: Total Ingested, Valid Count, Suspicious Count, Invalid Count, Quarantine Count, Verified Repairs Count, ML Latency.
  * Omitted or explicitly marked `N/A (Not Monitored)`: Stage queue depths, live streaming Mbps, per-stage microsecond timestamps.

---

## 5. UI Preferences vs Operational Settings Separation
* **Frontend UI Preferences** (Stored in `localStorage`):
  * Theme (`dark` / `light`).
  * Telemetry Polling Rate (5s / 10s / 30s / Manual Pause).
  * Data Mode (Live Backend vs Deterministic Demo).
  * Sidebar Collapse State.
* **Operational Settings** (Read from Backend / APIs):
  * Validation Decision Mode (`shadow`, `hybrid`, `rule_only`): Read-only status badge from `systemStatus.validationMode`.
  * Risk Score Thresholds (0.30 suspicious, 0.60 invalid): Read-only configuration values.
  * Model Registry Actions: Active Model Training (`POST /api/models/train`), Model Promotion (`POST /api/models/:version/promote`), and Rollback (`POST /api/models/rollback`).

---

## 6. Implementation Sequence
1. Phase 1: API Contracts Verification & Project Baseline
2. Phase 2: Design Tokens, Dual Themes & Application Shell
3. Phase 3: Overview Dashboard & Reusable Chart Engine
4. Phase 4: Live Telemetry Monitoring & Anomaly Explorer
5. Phase 5: Repair Operations & Interactive Truthful Pipeline Map
6. Phase 6: Analytics, Audit Logs, Settings, Verification, Testing, and Build
