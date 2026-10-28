/**
 * quarantine_review_diagnostics.test.js
 * -------------------------------------
 * Verifies that:
 * 1. GET /api/quarantine/:id returns comprehensive details, defensive fallbacks,
 *    detailed diagnosticReport (why it was flagged), and healingRecommendations.
 * 2. POST /api/quarantine/heal supports targeted healing strategies with sandbox verification.
 * 3. Never returns null or blank data structures that could crash the frontend.
 */

const mongoose = require("mongoose");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");

const {
  RawObservation,
  ValidationResult,
  QuarantineRecord,
  RepairProposal,
} = require("../src/models");
const { getQuarantineDetail, healQuarantineRecords } = require("../src/controllers/quarantine.controller");

const TEST_DB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/reforge_test";

describe("Quarantine Review & Healing Recommendations Test Suite", () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {});
    }
    await QuarantineRecord.deleteMany({ entityId: "test-review-sensor" });
    await RawObservation.deleteMany({ entityId: "test-review-sensor" });
    await ValidationResult.deleteMany({ rawObservationId: { $exists: true } });
  });

  let mainQRecordId = null;

  after(async () => {
    await QuarantineRecord.deleteMany({ entityId: { $in: ["test-review-sensor", "test-orphan-sensor"] } });
    await RawObservation.deleteMany({ entityId: { $in: ["test-review-sensor", "test-orphan-sensor"] } });
    await mongoose.connection.close();
  });

  it("should generate diagnostic report and recommended healing options for an anomalous observation", async () => {
    // 1. Create predecessor normal observation
    const pred = await RawObservation.create({
      ingestKey: "test-pred-key",
      sourceId: "test-station",
      sourceType: "sensor",
      entityId: "test-review-sensor",
      timestamp: new Date("2026-10-28T10:00:00Z"),
      values: { value: 24.2, temperature: 24.2 },
      rawPayload: { value: 24.2 },
    });

    // 2. Create anomalous flagged observation
    const anomalousObs = await RawObservation.create({
      ingestKey: "test-anom-key",
      sourceId: "test-station",
      sourceType: "sensor",
      entityId: "test-review-sensor",
      timestamp: new Date("2026-10-28T10:05:00Z"),
      values: { value: 125.0, temperature: 125.0, humidity: 45.0 },
      rawPayload: { value: 125.0 },
    });

    // 3. Create successor normal observation
    const succ = await RawObservation.create({
      ingestKey: "test-succ-key",
      sourceId: "test-station",
      sourceType: "sensor",
      entityId: "test-review-sensor",
      timestamp: new Date("2026-10-28T10:10:00Z"),
      values: { value: 24.8, temperature: 24.8 },
      rawPayload: { value: 24.8 },
    });

    // 4. Create validation result with rule and ML evidence
    const valResult = await ValidationResult.create({
      rawObservationId: anomalousObs._id,
      schemaValid: true,
      ruleRiskScore: 0.95,
      ruleClassification: "invalid",
      classification: "invalid",
      mlResult: {
        anomalyScore: 0.88,
        isAnomaly: true,
        modelVersion: "isolation_forest:v2.0.0-iot",
      },
      comparisonCategory: "rule_anomaly_ml_anomaly",
      disagreementReason: "Both Rule-based constraints and ML Isolation Forest detected high-risk anomalous behavior.",
      evidence: [
        {
          source: "physical_bounds",
          severity: 0.9,
          triggered: true,
          message: "Observed temperature 125.0 C exceeds physical upper boundary 60.0 C.",
        },
      ],
    });

    // 5. Create quarantine record
    const qRecord = await QuarantineRecord.create({
      rawObservationId: anomalousObs._id,
      validationResultId: valResult._id,
      entityId: "test-review-sensor",
      timestamp: anomalousObs.timestamp,
      classification: "invalid",
      semanticRiskScore: 0.95,
      ruleRiskScore: 0.95,
      mlAnomalyScore: 0.88,
      comparisonCategory: "rule_anomaly_ml_anomaly",
      reviewStatus: "pending",
    });
    mainQRecordId = qRecord._id;

    // 6. Test GET /api/quarantine/:id handler directly
    const req = { params: { id: qRecord._id.toString() } };
    let jsonResult = null;
    const res = {
      json: (data) => { jsonResult = data; },
      status: (code) => ({ json: (err) => { jsonResult = { code, ...err }; } }),
    };

    await getQuarantineDetail(req, res);

    assert.ok(jsonResult, "Controller must return json result");
    assert.strictEqual(jsonResult.quarantineRecord._id.toString(), qRecord._id.toString());
    assert.ok(jsonResult.rawObservation, "rawObservation must not be null");
    assert.strictEqual(jsonResult.rawObservation.values.value, 125.0);
    assert.ok(jsonResult.validationResult, "validationResult must not be null");

    // Verify diagnosticReport (Why was this flagged?)
    assert.ok(jsonResult.diagnosticReport, "diagnosticReport must be returned");
    assert.ok(jsonResult.diagnosticReport.primaryReason.includes("Physical Domain Violation"), "Must explain physical boundary breach");
    assert.strictEqual(jsonResult.diagnosticReport.isOutOfBounds, true);
    assert.strictEqual(jsonResult.diagnosticReport.sensorType, "temperature");

    // Verify healingRecommendations (Recommended options for healing)
    assert.ok(jsonResult.healingRecommendations, "healingRecommendations must be returned");
    assert.ok(Array.isArray(jsonResult.healingRecommendations.candidates), "Must return array of candidate strategies");
    assert.ok(jsonResult.healingRecommendations.candidates.length >= 3, "Must have at least 3 candidates");

    const interpolationCand = jsonResult.healingRecommendations.candidates.find(
      (c) => c.strategy === "historical_interpolation"
    );
    assert.ok(interpolationCand, "Must contain historical interpolation candidate");
    assert.ok(interpolationCand.proposedValue > 24.0 && interpolationCand.proposedValue < 25.0, "Interpolation must calculate midpoint ~24.5");
    assert.ok(interpolationCand.projectedRiskScore < 0.30, "Projected risk score must meet < 0.30 target");
    console.log("✓ Diagnostic report and healing recommendations successfully validated!");
  });

  it("should defensively synthesize data even if rawObservationId is orphaned, preventing blank page crashes", async () => {
    // Create an orphaned quarantine record with missing underlying documents
    const orphanRecord = await QuarantineRecord.create({
      rawObservationId: new mongoose.Types.ObjectId(),
      validationResultId: new mongoose.Types.ObjectId(),
      entityId: "test-orphan-sensor",
      timestamp: new Date(),
      classification: "suspicious",
      ruleRiskScore: 0.45,
      mlAnomalyScore: 0.72,
      comparisonCategory: "rule_anomaly_ml_anomaly",
      reviewStatus: "pending",
    });

    const req = { params: { id: orphanRecord._id.toString() } };
    let jsonResult = null;
    const res = {
      json: (data) => { jsonResult = data; },
      status: (code) => ({ json: (err) => { jsonResult = { code, ...err }; } }),
    };

    await getQuarantineDetail(req, res);

    assert.ok(jsonResult, "Must not error out on orphaned records");
    assert.ok(jsonResult.rawObservation, "Must synthesize effectiveRawObs");
    assert.ok(jsonResult.validationResult, "Must synthesize effectiveValResult");
    assert.ok(jsonResult.diagnosticReport, "Must provide diagnostic report");
    console.log("✓ Defensive fallback prevents blank page crashes on orphaned records!");
  });

  it("should apply chosen recommended strategy in sandbox and update review status to repaired", async () => {
    const qRecord = await QuarantineRecord.findById(mainQRecordId);
    assert.ok(qRecord, "Must find pending quarantine record");

    const req = {
      body: {
        quarantineRecordId: qRecord._id.toString(),
        reviewer: "lead-data-engineer",
        strategy: "historical_interpolation",
      },
    };
    let jsonResult = null;
    const res = {
      json: (data) => { jsonResult = data; },
      status: (code) => ({ json: (err) => { jsonResult = { code, ...err }; } }),
    };

    await healQuarantineRecords(req, res);

    assert.ok(jsonResult.success, "Healing must succeed");
    assert.strictEqual(jsonResult.healedCount, 1);

    const updated = await QuarantineRecord.findById(qRecord._id);
    assert.strictEqual(updated.reviewStatus, "repaired");
    assert.ok(updated.correctedValues.finalRiskScore < 0.30, "Healed risk must be < 0.30");
    console.log("✓ Strategy-targeted sandbox healing verified!");
  });
});
