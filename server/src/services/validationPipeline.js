const { RawObservation, ValidationResult, QuarantineRecord } = require("../models");
const { validateSchema } = require("./schemaValidator");
const { buildFeatures } = require("./featureBuilder");
const { evaluateRules } = require("./ruleEngine");
const { scoreAndClassify } = require("./scoringEngine");
const { logAudit } = require("./auditService");

/**
 * validationPipeline
 * ----------------
 * The full REFORGE decision pipeline for one incoming observation
 * (Section 5, "Detailed Data Flow", steps 1-9 + 12).
 *
 * Order of operations:
 *   1. Preserve the raw observation exactly as received (never skipped,
 *      even if the payload later fails validation).
 *   2. Run structural/schema validation.
 *   3. If schema is invalid -> classify "invalid" immediately and quarantine;
 *      semantic rules are skipped since there's no reliable value to reason
 *      about.
 *   4. If schema is valid -> build semantic features, run the rule engine,
 *      score, and classify.
 *   5. If classification is "suspicious" or "invalid" -> create a
 *      QuarantineRecord for human review.
 *   6. Write an AuditLog entry at every step.
 *
 * @param {Object} payload - raw observation payload as received by the API
 * @returns {Promise<Object>} { rawObservation, validationResult, quarantineRecord }
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

  // ---- Step 4 (structural validation) ----
  const { valid: schemaValid, errors: schemaErrors } = validateSchema(payload);

  await logAudit({
    rawObservationId: rawObservation._id,
    action: "schema_validated",
    details: { schemaValid, schemaErrors },
  });

  let features = {};
  let evidence = [];
  let semanticRiskScore = null;
  let classification;

  if (!schemaValid) {
    // Structurally invalid data never reaches the semantic engine - there's
    // no trustworthy numeric value to reason about.
    classification = "invalid";
  } else {
    // ---- Step 5: semantic feature construction ----
    const numericValue = payload.values.value;
    features = await buildFeatures({
      entityId: payload.entityId,
      timestamp,
      value: numericValue,
    });

    // ---- Step 6-8: semantic inference, scoring, classification ----
    evidence = evaluateRules(numericValue, features);
    const result = scoreAndClassify(evidence);
    semanticRiskScore = result.score;
    classification = result.classification;

    await logAudit({
      rawObservationId: rawObservation._id,
      action: "semantic_validated",
      details: { semanticRiskScore, classification },
    });
  }

  const validationResult = await ValidationResult.create({
    rawObservationId: rawObservation._id,
    schemaValid,
    schemaErrors,
    features,
    evidence,
    semanticRiskScore,
    classification,
    engineMode: "rule-based",
  });

  // ---- Step 9: routing - quarantine suspicious/invalid records ----
  let quarantineRecord = null;
  if (classification === "suspicious" || classification === "invalid") {
    quarantineRecord = await QuarantineRecord.create({
      rawObservationId: rawObservation._id,
      validationResultId: validationResult._id,
      entityId: rawObservation.entityId,
      timestamp: rawObservation.timestamp,
      classification,
      semanticRiskScore,
    });

    await logAudit({
      rawObservationId: rawObservation._id,
      action: "quarantined",
      details: { classification, semanticRiskScore },
    });
  }

  return { rawObservation, validationResult, quarantineRecord, deduplicated: false };
}

module.exports = { runPipeline };
