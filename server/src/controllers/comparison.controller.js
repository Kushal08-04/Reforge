/**
 * comparison.controller.js
 * ------------------------
 * Exposes comparative records and statistics between the Rule Engine and ML models.
 */

const { ValidationResult, RawObservation } = require("../models");

async function getComparison(req, res) {
  try {
    const { category, entityId, limit } = req.query;
    const filter = {};

    if (category) filter.comparisonCategory = category;

    // Fetch comparison category aggregation
    const categoryCountsRaw = await ValidationResult.aggregate([
      { $group: { _id: "$comparisonCategory", count: { $sum: 1 } } },
    ]);

    const categoryCounts = {
      rule_normal_ml_normal: 0,
      rule_anomaly_ml_anomaly: 0,
      rule_anomaly_ml_normal: 0,
      rule_normal_ml_anomaly: 0,
      not_applicable: 0,
    };
    for (const r of categoryCountsRaw) {
      if (r._id) categoryCounts[r._id] = r.count;
    }

    const totalValidAndSemantic =
      categoryCounts.rule_normal_ml_normal +
      categoryCounts.rule_anomaly_ml_anomaly +
      categoryCounts.rule_anomaly_ml_normal +
      categoryCounts.rule_normal_ml_anomaly;

    const agreementCount =
      categoryCounts.rule_normal_ml_normal + categoryCounts.rule_anomaly_ml_anomaly;
    const disagreementCount =
      categoryCounts.rule_anomaly_ml_normal + categoryCounts.rule_normal_ml_anomaly;

    const agreementRate = totalValidAndSemantic > 0 ? agreementCount / totalValidAndSemantic : 1.0;
    const disagreementRate =
      totalValidAndSemantic > 0 ? disagreementCount / totalValidAndSemantic : 0.0;

    // Query recent records
    const records = await ValidationResult.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 100))
      .populate("rawObservationId", "entityId timestamp values")
      .lean();

    const formattedRecords = records.map((r) => ({
      validationResultId: r._id,
      rawObservationId: r.rawObservationId?._id,
      entityId: r.rawObservationId?.entityId,
      timestamp: r.rawObservationId?.timestamp,
      value: r.rawObservationId?.values?.value,
      ruleClassification: r.ruleClassification || r.classification,
      ruleRiskScore: r.ruleRiskScore ?? r.semanticRiskScore ?? 0,
      mlModel: r.mlResult?.modelName || "none",
      mlVersion: r.mlResult?.modelVersion || "none",
      mlAnomaly: Boolean(r.mlResult?.isAnomaly),
      mlAnomalyScore: r.mlResult?.anomalyScore || 0,
      mlStatus: r.mlResult?.status || "skipped",
      hybridClassification: r.hybridClassification || r.classification,
      officialClassification: r.classification,
      comparisonCategory: r.comparisonCategory,
      decisionMode: r.decisionMode || "shadow",
      disagreementReason: r.disagreementReason || "",
      evidenceCount: (r.evidence || []).filter((e) => e.triggered).length,
      createdAt: r.createdAt,
    }));

    res.json({
      summary: {
        totalEvaluated: totalValidAndSemantic,
        agreementCount,
        disagreementCount,
        agreementRate,
        disagreementRate,
        categoryCounts,
      },
      records: formattedRecords,
    });
  } catch (err) {
    console.error("[REFORGE] getComparison error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch comparison records." });
  }
}

module.exports = { getComparison };
