/**
 * endpoints.js
 * ------------
 * Central verified API client layer.
 * Strictly separates Live Mode (real backend requests & honest connection errors)
 * from Explicit Demo Mode (deterministic offline scenarios).
 */

import apiClient from "./client";
import {
  DEMO_DASHBOARD,
  DEMO_QUARANTINE_LIST,
  DEMO_QUARANTINE_DETAIL,
  DEMO_REPAIR_PROPOSALS,
  DEMO_COMPARISON,
  DEMO_EVALUATION,
  DEMO_MODELS,
  DEMO_AUDIT_TRAIL,
} from "./demoData";

// Data mode state management
export function getDataMode() {
  if (typeof window === "undefined") return "live";
  return localStorage.getItem("reforge_data_mode") || "live";
}

export function setDataMode(mode) {
  if (typeof window !== "undefined") {
    localStorage.setItem("reforge_data_mode", mode);
    window.dispatchEvent(new Event("reforge-datamode-change"));
  }
}

export function isDemoMode() {
  return getDataMode() === "demo";
}

// -------------------------------------------------------------
// 1. Health & System
// -------------------------------------------------------------
export async function fetchHealth() {
  if (isDemoMode()) {
    return {
      status: "ok",
      service: "reforge-server (DEMO MODE)",
      timestamp: new Date().toISOString(),
      database: { state: "connected", name: "demo-synthetic-db" },
      isDemo: true,
    };
  }
  const res = await apiClient.get("/health");
  return res.data;
}

// -------------------------------------------------------------
// 2. Dashboard Overview Aggregates
// -------------------------------------------------------------
export async function fetchDashboardData() {
  if (isDemoMode()) {
    return { ...DEMO_DASHBOARD, isDemo: true };
  }
  const res = await apiClient.get("/dashboard");
  return res.data;
}

// -------------------------------------------------------------
// 3. Quarantine & Evidence Investigation
// -------------------------------------------------------------
export async function fetchQuarantineRecords(params = {}) {
  if (isDemoMode()) {
    let list = [...DEMO_QUARANTINE_LIST];
    if (params.status) list = list.filter((r) => r.reviewStatus === params.status);
    if (params.classification) list = list.filter((r) => r.classification === params.classification);
    return { count: list.length, records: list, isDemo: true };
  }
  const res = await apiClient.get("/quarantine", { params });
  return res.data;
}

export async function fetchQuarantineDetail(id) {
  if (isDemoMode()) {
    return { ...DEMO_QUARANTINE_DETAIL, isDemo: true };
  }
  const res = await apiClient.get(`/quarantine/${id}`);
  return res.data;
}

export async function submitQuarantineReview({ id, action, correctedValues, reviewer, notes }) {
  if (isDemoMode()) {
    return {
      quarantineRecord: {
        ...DEMO_QUARANTINE_LIST[0],
        reviewStatus: action === "approve" ? "approved" : action === "reject" ? "rejected" : "corrected",
        correctedValues,
        reviewer: reviewer || "demo-reviewer",
        reviewNotes: notes || "",
        reviewedAt: new Date().toISOString(),
      },
      isDemo: true,
    };
  }
  const res = await apiClient.patch(`/quarantine/${id}/review`, {
    action,
    correctedValues,
    reviewer,
    notes,
  });
  return res.data;
}

export async function triggerCascadeHealing({ tier, recordIds, quarantineRecordId, reviewer }) {
  if (isDemoMode()) {
    return {
      success: true,
      tier: tier || "low_risk",
      totalTargeted: 1,
      healedCount: 1,
      failedCount: 0,
      remainingPending: 85,
      results: [
        {
          quarantineRecordId: quarantineRecordId || "demo-q-001",
          success: true,
          healedValue: 24.85,
          finalRiskScore: 0.08,
          strategy: "composite_optimal",
        },
      ],
      isDemo: true,
    };
  }
  const res = await apiClient.post("/quarantine/heal", {
    tier,
    recordIds,
    quarantineRecordId,
    reviewer,
  });
  return res.data;
}

// -------------------------------------------------------------
// 4. Repair Operations Lifecycle
// -------------------------------------------------------------
export async function fetchRepairsList(params = {}) {
  if (isDemoMode()) {
    let proposals = [...DEMO_REPAIR_PROPOSALS];
    if (params.state) proposals = proposals.filter((p) => p.lifecycleState === params.state);
    if (params.entityId) proposals = proposals.filter((p) => p.entityId === params.entityId);
    return { count: proposals.length, proposals, isDemo: true };
  }
  const res = await apiClient.get("/repairs", { params });
  return res.data;
}

export async function fetchRepairDetail(id) {
  if (isDemoMode()) {
    const proposal = DEMO_REPAIR_PROPOSALS.find((p) => p._id === id) || DEMO_REPAIR_PROPOSALS[0];
    return { proposal, isDemo: true };
  }
  const res = await apiClient.get(`/repairs/${id}`);
  return res.data;
}

export async function diagnoseRepair({ quarantineRecordId, reviewer, mode }) {
  if (isDemoMode()) {
    return {
      proposal: {
        ...DEMO_REPAIR_PROPOSALS[0],
        _id: `demo-rep-${Date.now()}`,
        lifecycleState: "PROPOSED",
        sandboxResult: { status: "NOT_RUN" },
      },
      isDemo: true,
    };
  }
  const res = await apiClient.post("/repairs/diagnose", {
    quarantineRecordId,
    reviewer,
    mode,
  });
  return res.data;
}

export async function executeSandboxVerification(id, reviewer = "lead-data-engineer") {
  if (isDemoMode()) {
    return {
      proposal: {
        ...DEMO_REPAIR_PROPOSALS[0],
        _id: id,
        lifecycleState: "VERIFIED",
        sandboxResult: {
          status: "PASS",
          exitCode: 0,
          testsPassed: 4,
          testsTotal: 4,
          semanticChecksPassed: true,
          correctedValue: 24.85,
          executionTimeMs: 142,
          stdout: "[REFORGE SANDBOX] Isolated run verified: risk < 0.30.",
        },
      },
      isDemo: true,
    };
  }
  const res = await apiClient.post(`/repairs/${id}/sandbox`, { reviewer });
  return res.data;
}

export async function createPullRequest(id, reviewer = "lead-data-engineer") {
  if (isDemoMode()) {
    return {
      proposal: {
        ...DEMO_REPAIR_PROPOSALS[0],
        _id: id,
        lifecycleState: "PR_CREATED",
        githubIntegration: {
          prNumber: 42,
          prUrl: "https://github.com/Kushal08-04/Reforge/pull/42",
          branchName: "reforge/fix-zone-a-jump",
          ciStatus: "pending",
        },
      },
      isDemo: true,
    };
  }
  const res = await apiClient.post(`/repairs/${id}/create-pr`, { reviewer });
  return res.data;
}

export async function reviewRepairProposal({ id, decision, reviewer, notes }) {
  if (isDemoMode()) {
    return {
      proposal: {
        ...DEMO_REPAIR_PROPOSALS[0],
        _id: id,
        lifecycleState: decision === "approved" ? "APPROVED" : "REJECTED",
        humanReview: {
          decision,
          reviewer: reviewer || "demo-reviewer",
          reviewedAt: new Date().toISOString(),
          notes: notes || "",
        },
      },
      isDemo: true,
    };
  }
  const res = await apiClient.patch(`/repairs/${id}/review`, {
    decision,
    reviewer,
    notes,
  });
  return res.data;
}

// -------------------------------------------------------------
// 5. Rule vs ML Comparison
// -------------------------------------------------------------
export async function fetchComparisonData(params = {}) {
  if (isDemoMode()) {
    let records = [...DEMO_COMPARISON.records];
    if (params.category) records = records.filter((r) => r.comparisonCategory === params.category);
    return {
      summary: DEMO_COMPARISON.summary,
      records,
      isDemo: true,
    };
  }
  const res = await apiClient.get("/comparison", { params });
  return res.data;
}

// -------------------------------------------------------------
// 6. Evaluation Benchmarks
// -------------------------------------------------------------
export async function fetchLatestEvaluation() {
  if (isDemoMode()) {
    return { evaluation: DEMO_EVALUATION, isDemo: true };
  }
  const res = await apiClient.get("/evaluation/latest");
  return res.data;
}

export async function runEvaluationBenchmark() {
  if (isDemoMode()) {
    return {
      evaluation: {
        ...DEMO_EVALUATION,
        evaluatedAt: new Date().toISOString(),
      },
      isDemo: true,
    };
  }
  const res = await apiClient.post("/evaluation/run");
  return res.data;
}

export async function fetchEvaluationHistory() {
  if (isDemoMode()) {
    return { history: [DEMO_EVALUATION], isDemo: true };
  }
  const res = await apiClient.get("/evaluation/history");
  return res.data;
}

// -------------------------------------------------------------
// 7. Models Registry
// -------------------------------------------------------------
export async function fetchModelsRegistry() {
  if (isDemoMode()) {
    return { ...DEMO_MODELS, isDemo: true };
  }
  const res = await apiClient.get("/models");
  return res.data;
}

export async function triggerModelTraining({ modelType = "isolation_forest", hyperparameters = {}, testSize = 0.25 }) {
  if (isDemoMode()) {
    return {
      message: "Model trained successfully and registered as candidate.",
      candidateModel: {
        modelName: modelType,
        version: `v${Date.now()}`,
        algorithm: modelType === "random_forest" ? "RandomForestClassifier" : "IsolationForest",
        status: "candidate",
        metrics: { precision: 0.865, recall: 0.890, f1: 0.877, roc_auc: 0.935 },
      },
      isDemo: true,
    };
  }
  const res = await apiClient.post("/models/train", { modelType, hyperparameters, testSize });
  return res.data;
}

export async function promoteModelVersion(version, modelName, reviewer = "authorized-admin") {
  if (isDemoMode()) {
    return { status: "promoted", activeModel: { version, modelName }, isDemo: true };
  }
  const res = await apiClient.post(`/models/${version}/promote`, { modelName, reviewer });
  return res.data;
}

export async function rollbackModelVersion() {
  if (isDemoMode()) {
    return { status: "rolled_back", activeModel: { version: "v1.0.0" }, isDemo: true };
  }
  const res = await apiClient.post("/models/rollback");
  return res.data;
}

// -------------------------------------------------------------
// 8. Audit Trail & Lineage
// -------------------------------------------------------------
export async function fetchAuditTrail(rawObservationId) {
  if (isDemoMode()) {
    return {
      rawObservation: DEMO_QUARANTINE_DETAIL.rawObservation,
      auditTrail: DEMO_AUDIT_TRAIL,
      isDemo: true,
    };
  }
  const res = await apiClient.get(`/audit/${rawObservationId}`);
  return res.data;
}

// -------------------------------------------------------------
// 9. Dataset Ingestion (Test Ingest)
// -------------------------------------------------------------
export async function ingestTelemetry(payload) {
  if (isDemoMode()) {
    return {
      rawObservationId: "demo-raw-new",
      entityId: payload.entityId || "zone-a-temperature",
      timestamp: new Date().toISOString(),
      classification: "valid",
      semanticRiskScore: 0.08,
      schemaValid: true,
      quarantined: false,
      deduplicated: false,
      isDemo: true,
    };
  }
  const res = await apiClient.post("/ingest", payload);
  return res.data;
}

// -------------------------------------------------------------
// 10. File Exports (CSV, XLSX, PDF) & GitHub Snapshot
// -------------------------------------------------------------
export async function downloadExportFile(format, filename) {
  if (isDemoMode()) {
    alert(`Demo Mode: Simulated download of ${filename} (${format.toUpperCase()}) with verified baseline dataset.`);
    return;
  }
  const res = await apiClient.get(`/export/${format}`, { responseType: "blob" });
  const blob = new Blob([res.data]);
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(link.href);
}

export async function exportToGitHub(commitMessage = "chore(data): publish cleansed dataset with verified sandbox repairs") {
  if (isDemoMode()) {
    return {
      success: true,
      message: "Simulated commit pushed to branch reforge-dataset-cleansed (Demo Mode).",
      commitSha: "9a2f7c10b48e3",
      isDemo: true,
    };
  }
  const res = await apiClient.post("/export/github", { commitMessage });
  return res.data;
}
