const {
  ValidationResult,
  QuarantineRecord,
  RawObservation,
  RepairProposal,
  ModelVersion,
} = require("../models");

/**
 * GET /api/dashboard
 * Aggregate pipeline health metrics (Section 14):
 * - Ingested counts & classification totals
 * - Pending review count
 * - Rule/ML agreement rate & disagreement count
 * - ML inference failures
 * - Active model & validation mode
 * - Recent validation events & repair proposals
 * - Per-entity health breakdown
 */
async function getDashboard(req, res) {
  try {
    const [
      classificationCounts,
      totalIngested,
      pendingReviewCount,
      recentResults,
      comparisonCountsRaw,
      mlFailuresCount,
      recentRepairs,
      activeModelDoc,
    ] = await Promise.all([
      ValidationResult.aggregate([
        { $group: { _id: "$classification", count: { $sum: 1 } } },
      ]),
      RawObservation.countDocuments(),
      QuarantineRecord.countDocuments({ reviewStatus: "pending" }),
      ValidationResult.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("rawObservationId", "entityId timestamp values")
        .lean(),
      ValidationResult.aggregate([
        { $group: { _id: "$comparisonCategory", count: { $sum: 1 } } },
      ]),
      ValidationResult.countDocuments({
        "mlResult.status": { $in: ["fallback", "error"] },
      }),
      RepairProposal.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      ModelVersion.findOne({ status: "active" }).lean(),
    ]);

    const counts = { valid: 0, suspicious: 0, invalid: 0, pending: 0 };
    for (const row of classificationCounts) {
      if (row._id) counts[row._id] = row.count;
    }

    const catCounts = {
      rule_normal_ml_normal: 0,
      rule_anomaly_ml_anomaly: 0,
      rule_anomaly_ml_normal: 0,
      rule_normal_ml_anomaly: 0,
    };
    for (const r of comparisonCountsRaw) {
      if (r._id && catCounts[r._id] !== undefined) {
        catCounts[r._id] = r.count;
      }
    }

    const totalEvaluated =
      catCounts.rule_normal_ml_normal +
      catCounts.rule_anomaly_ml_anomaly +
      catCounts.rule_anomaly_ml_normal +
      catCounts.rule_normal_ml_anomaly;

    const agreementCount =
      catCounts.rule_normal_ml_normal + catCounts.rule_anomaly_ml_anomaly;
    const disagreementCount =
      catCounts.rule_anomaly_ml_normal + catCounts.rule_normal_ml_anomaly;

    const agreementRate = totalEvaluated > 0 ? agreementCount / totalEvaluated : 1.0;

    // Per-entity health
    const perEntity = await ValidationResult.aggregate([
      {
        $lookup: {
          from: "raw_observations",
          localField: "rawObservationId",
          foreignField: "_id",
          as: "raw",
        },
      },
      { $unwind: "$raw" },
      {
        $group: {
          _id: "$raw.entityId",
          total: { $sum: 1 },
          valid: { $sum: { $cond: [{ $eq: ["$classification", "valid"] }, 1, 0] } },
          suspicious: { $sum: { $cond: [{ $eq: ["$classification", "suspicious"] }, 1, 0] } },
          invalid: { $sum: { $cond: [{ $eq: ["$classification", "invalid"] }, 1, 0] } },
          avgRiskScore: { $avg: "$semanticRiskScore" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const recentEvents = recentResults.map((r) => ({
      validationResultId: r._id,
      rawObservationId: r.rawObservationId?._id,
      entityId: r.rawObservationId?.entityId,
      timestamp: r.rawObservationId?.timestamp,
      value: r.rawObservationId?.values?.value,
      classification: r.classification,
      semanticRiskScore: r.semanticRiskScore,
      ruleRiskScore: r.ruleRiskScore,
      mlAnomalyScore: r.mlResult?.anomalyScore || 0,
      comparisonCategory: r.comparisonCategory,
      createdAt: r.createdAt,
    }));

    res.json({
      totalIngested,
      classificationCounts: counts,
      pendingReviewCount,
      agreementStats: {
        agreementRate,
        disagreementCount,
        agreementCount,
        totalEvaluated,
        mlFailuresCount,
      },
      systemStatus: {
        validationMode: process.env.VALIDATION_MODE || "shadow",
        activeModel: activeModelDoc
          ? `${activeModelDoc.modelName}:${activeModelDoc.version}`
          : (process.env.ML_ACTIVE_MODEL ? `${process.env.ML_ACTIVE_MODEL}:v2.0.0-iot` : "isolation_forest:v2.0.0-iot"),
        engineVersion: process.env.SEMANTIC_ENGINE_VERSION || "v0.2.0-hybrid",
      },
      perEntity,
      recentEvents,
      recentRepairs,
    });
  } catch (err) {
    console.error("[REFORGE] getDashboard error:", err);
    res.status(500).json({ error: err.message || "Failed to build dashboard." });
  }
}

module.exports = { getDashboard };
