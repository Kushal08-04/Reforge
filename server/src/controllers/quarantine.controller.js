const {
  QuarantineRecord,
  RawObservation,
  ValidationResult,
} = require("../models");
const { logAudit } = require("../services/auditService");

/**
 * GET /api/quarantine
 * Lists quarantined records awaiting (or having completed) review.
 * Supports optional ?status= and ?classification= filters, and a
 * simple ?limit= (default 50) since this MVP has no true pagination UI.
 */
async function listQuarantine(req, res) {
  try {
    const { status, classification, limit } = req.query;
    const filter = {};
    if (status) filter.reviewStatus = status;
    if (classification) filter.classification = classification;

    const records = await QuarantineRecord.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 200))
      .lean();

    res.json({ count: records.length, records });
  } catch (err) {
    console.error("[REFORGE] listQuarantine error:", err);
    res.status(500).json({ error: err.message || "Failed to list quarantine records." });
  }
}

/**
 * GET /api/quarantine/:id
 * Full context for the review screen (Section 8): original value, timestamp,
 * source/sensor, recent history, evidence, diagnostic reasoning, recommended healing options.
 */
async function getQuarantineDetail(req, res) {
  try {
    const dataRepairService = require("../services/dataRepairService");
    const record = await QuarantineRecord.findById(req.params.id).lean();
    if (!record) {
      return res.status(404).json({ error: "Quarantine record not found." });
    }

    const [rawObservation, validationResult, recentHistory, predecessor, successor, peers] = await Promise.all([
      RawObservation.findById(record.rawObservationId).lean(),
      ValidationResult.findById(record.validationResultId).lean(),
      RawObservation.find({
        entityId: record.entityId,
        timestamp: { $lte: record.timestamp },
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
      RawObservation.findOne({
        entityId: record.entityId,
        timestamp: { $lt: record.timestamp },
      })
        .sort({ timestamp: -1 })
        .lean(),
      RawObservation.findOne({
        entityId: record.entityId,
        timestamp: { $gt: record.timestamp },
      })
        .sort({ timestamp: 1 })
        .lean(),
      RawObservation.find({
        entityId: { $ne: record.entityId },
        timestamp: {
          $gte: new Date(new Date(record.timestamp).getTime() - 60000),
          $lte: new Date(new Date(record.timestamp).getTime() + 60000),
        },
      })
        .limit(20)
        .lean(),
    ]);

    // 1. Defensively synthesize effective raw observation if missing or partial
    let effectiveRawObs = rawObservation;
    if (!effectiveRawObs) {
      effectiveRawObs = {
        _id: record.rawObservationId || record._id,
        entityId: record.entityId || "generic-sensor",
        timestamp: record.timestamp || new Date(),
        values: { value: record.rawReading ?? 0 },
        sourceId: "quarantined-stream",
        sourceType: "sensor",
      };
    }
    const resolvedNumericVal = dataRepairService.extractNumericValue(effectiveRawObs);
    if (resolvedNumericVal !== undefined && effectiveRawObs.values) {
      effectiveRawObs.values.value = resolvedNumericVal;
    }

    // 2. Defensively synthesize effective validation result if missing or partial
    let effectiveValResult = validationResult;
    if (!effectiveValResult) {
      effectiveValResult = {
        _id: record.validationResultId || record._id,
        rawObservationId: effectiveRawObs._id,
        classification: record.classification || "suspicious",
        ruleClassification: record.classification || "suspicious",
        ruleRiskScore: record.ruleRiskScore ?? record.semanticRiskScore ?? 0.5,
        semanticRiskScore: record.semanticRiskScore ?? record.ruleRiskScore ?? 0.5,
        mlResult: { anomalyScore: record.mlAnomalyScore ?? 0.5, isAnomaly: true },
        comparisonCategory: record.comparisonCategory || "n/a",
        schemaValid: true,
        schemaErrors: [],
        evidence: [],
        disagreementReason: "Observation was quarantined during ETL validation.",
      };
    }

    // 3. Resolve sensor modality and canonical physical boundaries
    const sensorType = dataRepairService.resolveSensorType(record.entityId, effectiveRawObs);
    const bounds = dataRepairService.PHYSICAL_SENSOR_BOUNDS[sensorType] || dataRepairService.PHYSICAL_SENSOR_BOUNDS.temperature;

    // 4. Synthesize diagnostic report (Why was this flagged?)
    const numVal = resolvedNumericVal !== undefined ? resolvedNumericVal : 0;
    const isOutOfBounds = numVal < bounds.min || numVal > bounds.max;
    const ruleRisk = effectiveValResult.ruleRiskScore ?? 0;
    const mlScore = effectiveValResult.mlResult?.anomalyScore ?? record.mlAnomalyScore ?? 0;

    let primaryReason = "Flagged by hybrid validation engine for quality review.";
    if (isOutOfBounds) {
      primaryReason = `Critical Physical Domain Violation: Value (${numVal} ${bounds.unit}) exceeds canonical physical boundaries [${bounds.min}, ${bounds.max}] ${bounds.unit}.`;
    } else if (ruleRisk >= 0.60) {
      primaryReason = `High Rule-Based Risk (Score: ${ruleRisk.toFixed(2)}): Sensor observation triggered critical deterministic validation constraints.`;
    } else if (mlScore >= 0.50 && ruleRisk < 0.30) {
      primaryReason = `ML Isolation Forest Outlier (Anomaly Score: ${mlScore.toFixed(2)} > 0.50): Flagged as statistical outlier based on multidimensional feature partition.`;
    } else if (effectiveValResult.comparisonCategory === "rule_anomaly_ml_anomaly") {
      primaryReason = `Consensus Anomaly: Both Rule-based engine (${ruleRisk.toFixed(2)}) and Isolation Forest (${mlScore.toFixed(2)}) identified anomalous sensor behavior.`;
    } else if (ruleRisk >= 0.30) {
      primaryReason = `Suspicious Reading: Observation exhibits temporal drift or rate-of-change irregularity requiring sandbox verification.`;
    }

    const diagnosticReport = {
      primaryReason,
      sensorType,
      bounds,
      observedValue: numVal,
      isOutOfBounds,
      ruleRiskScore: ruleRisk,
      mlAnomalyScore: mlScore,
      comparisonCategory: effectiveValResult.comparisonCategory,
      disagreementReason: effectiveValResult.disagreementReason,
      schemaValid: effectiveValResult.schemaValid !== false,
      schemaErrors: effectiveValResult.schemaErrors || [],
      triggeredRules: (effectiveValResult.evidence || []).filter((e) => e.triggered),
      clearRules: (effectiveValResult.evidence || []).filter((e) => !e.triggered),
    };

    // 5. Generate recommended healing options
    let healingRecommendations = null;
    try {
      healingRecommendations = await dataRepairService.getRecommendedHealingOptions({
        rawObservation: effectiveRawObs,
        validationResult: effectiveValResult,
        history: recentHistory || [],
        predecessor,
        successor,
        peers: peers || [],
      });
    } catch (healErr) {
      console.warn("[REFORGE] Failed to compute recommendations:", healErr.message);
    }

    res.json({
      quarantineRecord: record,
      rawObservation: effectiveRawObs,
      validationResult: effectiveValResult,
      recentHistory: recentHistory ? recentHistory.reverse() : [],
      diagnosticReport,
      healingRecommendations,
    });
  } catch (err) {
    console.error("[REFORGE] getQuarantineDetail error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch quarantine detail." });
  }
}

/**
 * PATCH /api/quarantine/:id/review
 * Body: { action: "approve" | "reject" | "correct", correctedValues?, reviewer?, notes? }
 *
 * "approve"  -> reviewer confirms the flagged value is actually fine.
 * "reject"   -> reviewer confirms the value is bad; no corrected value supplied.
 * "correct"  -> reviewer supplies a corrected value; original stays untouched
 *               and recoverable via rawObservation.
 */
async function reviewQuarantine(req, res) {
  try {
    const { action, correctedValues, reviewer, notes } = req.body;
    const validActions = ["approve", "reject", "correct"];

    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action "${action}". Must be one of: ${validActions.join(", ")}.`,
      });
    }

    const record = await QuarantineRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Quarantine record not found." });
    }

    if (action === "correct" && (!correctedValues || typeof correctedValues !== "object")) {
      return res.status(400).json({ error: "correctedValues object is required for action 'correct'." });
    }

    const statusMap = { approve: "approved", reject: "rejected", correct: "corrected" };
    const auditActionMap = {
      approve: "review_approved",
      reject: "review_rejected",
      correct: "review_corrected",
    };

    record.reviewStatus = statusMap[action];
    record.reviewer = reviewer || "anonymous-reviewer";
    record.reviewNotes = notes || "";
    record.reviewedAt = new Date();
    if (action === "correct") {
      record.correctedValues = correctedValues;
    }

    await record.save();

    await logAudit({
      rawObservationId: record.rawObservationId,
      action: auditActionMap[action],
      details: {
        reviewer: record.reviewer,
        notes: record.reviewNotes,
        correctedValues: action === "correct" ? correctedValues : undefined,
      },
      actor: record.reviewer,
    });

    res.json({ quarantineRecord: record });
  } catch (err) {
    console.error("[REFORGE] reviewQuarantine error:", err);
    res.status(500).json({ error: err.message || "Failed to submit review." });
  }
}

/**
 * POST /api/quarantine/heal
 * Iteratively heals flagged observations in the isolated sandbox until risk score < 0.30.
 * Supports:
 *   - tier: "low_risk" (risk <= 0.60, single-button auto-repair)
 *   - tier: "high_risk" (risk > 0.60, batch or individual)
 *   - recordIds: string[] (specific batch)
 *   - quarantineRecordId: string (single record)
 */
async function healQuarantineRecords(req, res) {
  try {
    const {
      tier,
      recordIds,
      quarantineRecordId,
      reviewer = "lead-data-engineer",
      strategy,
      targetStrategy,
      preferredValue,
    } = req.body;
    const dataRepairService = require("../services/dataRepairService");

    let targetIds = [];
    if (quarantineRecordId) {
      targetIds = [quarantineRecordId];
    } else if (Array.isArray(recordIds) && recordIds.length > 0) {
      targetIds = recordIds;
    } else if (tier === "low_risk") {
      // Find all pending low-risk observations (risk <= 0.60 or classification === 'suspicious')
      const lowRiskRecords = await QuarantineRecord.find({
        reviewStatus: "pending",
        $or: [
          { semanticRiskScore: { $lte: 0.60 } },
          { ruleRiskScore: { $lte: 0.60 } },
          { classification: "suspicious" },
        ],
      })
        .limit(200)
        .lean();
      targetIds = lowRiskRecords.map((r) => r._id.toString());
    } else if (tier === "high_risk") {
      // Find all pending high-risk observations (risk > 0.60 or classification === 'invalid')
      const highRiskRecords = await QuarantineRecord.find({
        reviewStatus: "pending",
        $or: [
          { semanticRiskScore: { $gt: 0.60 } },
          { ruleRiskScore: { $gt: 0.60 } },
          { classification: "invalid" },
        ],
      })
        .limit(200)
        .lean();
      targetIds = highRiskRecords.map((r) => r._id.toString());
    } else if (tier === "all") {
      const allPending = await QuarantineRecord.find({ reviewStatus: "pending" }).limit(200).lean();
      targetIds = allPending.map((r) => r._id.toString());
    }

    if (targetIds.length === 0) {
      return res.json({
        message: "No pending observations found matching the specified tier.",
        healedCount: 0,
        results: [],
      });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const qId of targetIds) {
      try {
        const healResult = await dataRepairService.healObservationInSandbox({
          quarantineRecordId: qId,
          actor: reviewer,
          targetStrategy: strategy || targetStrategy,
          preferredValue: typeof preferredValue === "number" ? preferredValue : (preferredValue ? Number(preferredValue) : null),
        });
        results.push(healResult);
        successCount++;
      } catch (itemErr) {
        failCount++;
        results.push({
          quarantineRecordId: qId,
          success: false,
          error: itemErr.message,
        });
      }
    }

    const remainingPending = await QuarantineRecord.countDocuments({ reviewStatus: "pending" });

    res.json({
      success: true,
      tier: tier || "custom",
      totalTargeted: targetIds.length,
      healedCount: successCount,
      failedCount: failCount,
      remainingPending,
      results,
    });
  } catch (err) {
    console.error("[REFORGE] healQuarantineRecords error:", err);
    res.status(500).json({ error: err.message || "Failed to heal quarantine records." });
  }
}

module.exports = {
  listQuarantine,
  getQuarantineDetail,
  reviewQuarantine,
  healQuarantineRecords,
};
