const { RawObservation, ValidationResult, QuarantineRecord } = require("../models");
const { validateSchema } = require("./schemaValidator");
const { buildFeatures } = require("./featureBuilder");
const { evaluateRules } = require("./ruleEngine");
const { scoreAndClassify } = require("./scoringEngine");
const { predictAnomaly } = require("./mlClient");
const { evaluateHybridDecision } = require("./hybridDecisionEngine");
const { logAudit } = require("./auditService");

/**
 * validationPipeline
 * ----------------
 * The full REFORGE decision pipeline for one incoming observation.
 * Combines:
 *   1. Immutable raw storage
 *   2. Structural/envelope schema validation
 *   3. Semantic feature construction
 *   4. Explainable rule evaluation & risk scoring
 *   5. Independent ML anomaly detection
 *   6. Calibrated hybrid decision engine (rule_only | shadow | hybrid)
 *   7. Routing to quarantine for human review
 *   8. Complete append-only audit trail
 */
async function runPipeline(payload) {
  const timestamp = new Date(payload.timestamp);
  const ingestKey =
    payload.ingestKey ||
    `${payload.sourceId}:${payload.entityId}:${timestamp.toISOString()}`;

  // ---- Step 1-2: preserve raw observation (idempotent on ingestKey) ----
  let rawObservation = await RawObservation.findOne({ ingestKey });
  let isDuplicate = false;

  if (rawObservation) {
    isDuplicate = true;
  } else {
    rawObservation = await RawObservation.create({
      sourceId: payload.sourceId,
      sourceType: payload.sourceType || "sensor",
      entityId: payload.entityId,
      timestamp,
      values: payload.values,
      units: payload.units || {},
      rawPayload: payload,
      ingestKey,
    });
  }

  await logAudit({
    rawObservationId: rawObservation._id,
    action: "ingested",
    details: { isDuplicate },
  });

  // If this is a retry of an already-processed observation, return its
  // existing validation result instead of re-running the whole pipeline.
  if (isDuplicate) {
    const existingResult = await ValidationResult.findOne({
      rawObservationId: rawObservation._id,
    }).sort({ createdAt: -1 });
    if (existingResult) {
      const existingQuarantine = await QuarantineRecord.findOne({
        rawObservationId: rawObservation._id,
      });
      return {
        rawObservation,
        validationResult: existingResult,
        quarantineRecord: existingQuarantine || null,
        deduplicated: true,
      };
    }
  }

  // ---- Step 4: structural validation ----
  const { valid: schemaValid, errors: schemaErrors } = validateSchema(payload);

  await logAudit({
    rawObservationId: rawObservation._id,
    action: "schema_validated",
    details: { schemaValid, schemaErrors },
  });

  let features = {};
  let evidence = [];
  let ruleRiskScore = null;
  let ruleClassification = "valid";
  let mlResult = {
    modelName: "none",
    modelVersion: "none",
    isAnomaly: false,
    rawScore: 0,
    anomalyScore: 0,
    status: "skipped",
  };

  if (!schemaValid) {
    ruleClassification = "invalid";
  } else {
    // ---- Step 5: semantic feature construction ----
    const numericValue = payload.values.value;
    features = await buildFeatures({
      entityId: payload.entityId,
      timestamp,
      value: numericValue,
    });

    // ---- Step 6: deterministic rule engine ----
    evidence = evaluateRules(numericValue, features);
    const scoreResult = scoreAndClassify(evidence);
    ruleRiskScore = scoreResult.score;
    ruleClassification = scoreResult.classification;

    await logAudit({
      rawObservationId: rawObservation._id,
      action: "semantic_validated",
      details: { ruleRiskScore, ruleClassification },
    });

    // ---- Step 7: ML anomaly detection inference ----
    const mode = process.env.VALIDATION_MODE || "shadow";
    if (mode !== "rule_only") {
      mlResult = await predictAnomaly({
        entityId: payload.entityId,
        value: numericValue,
        timestamp,
        features,
      });

      await logAudit({
        rawObservationId: rawObservation._id,
        action: "ml_evaluated",
        details: {
          modelName: mlResult.modelName,
          modelVersion: mlResult.modelVersion,
          isAnomaly: mlResult.isAnomaly,
          anomalyScore: mlResult.anomalyScore,
          status: mlResult.status,
        },
      });
    }
  }

  // ---- Step 8: Hybrid decision layer ----
  const decision = evaluateHybridDecision({
    schemaValid,
    ruleClassification,
    ruleRiskScore: ruleRiskScore || 0,
    mlResult,
  });

  const officialClassification = decision.officialClassification;

  const validationResult = await ValidationResult.create({
    rawObservationId: rawObservation._id,
    schemaValid,
    schemaErrors,
    features,
    evidence,
    ruleRiskScore,
    ruleClassification,
    semanticRiskScore: ruleRiskScore, // legacy field compatibility
    mlResult,
    comparisonCategory: decision.comparisonCategory,
    hybridClassification: decision.hybridClassification,
    classification: officialClassification,
    decisionMode: decision.decisionMode,
    disagreementReason: decision.disagreementReason,
    decisionPolicyVersion: decision.policyVersion,
    engineVersion: process.env.SEMANTIC_ENGINE_VERSION || "v0.2.0-hybrid",
    engineMode: decision.decisionMode === "hybrid" ? "hybrid" : "rule-based",
  });

  // ---- Step 9: routing - quarantine suspicious/invalid records ----
  let quarantineRecord = null;
  if (officialClassification === "suspicious" || officialClassification === "invalid") {
    quarantineRecord = await QuarantineRecord.create({
      rawObservationId: rawObservation._id,
      validationResultId: validationResult._id,
      entityId: rawObservation.entityId,
      timestamp: rawObservation.timestamp,
      classification: officialClassification,
      semanticRiskScore: ruleRiskScore,
      ruleRiskScore,
      mlAnomalyScore: mlResult.anomalyScore,
      comparisonCategory: decision.comparisonCategory,
    });

    await logAudit({
      rawObservationId: rawObservation._id,
      action: "quarantined",
      details: {
        classification: officialClassification,
        ruleRiskScore,
        mlAnomalyScore: mlResult.anomalyScore,
        comparisonCategory: decision.comparisonCategory,
        disagreementReason: decision.disagreementReason,
      },
    });
  }

  return { rawObservation, validationResult, quarantineRecord, deduplicated: false };
}

module.exports = { runPipeline };
