const { ValidationResult, QuarantineRecord, RawObservation } = require("../models");

/**
 * GET /api/dashboard
 * Aggregate pipeline health metrics (Section 14): overall counts,
 * quarantine queue size, recent events, and per-entity health.
 */
async function getDashboard(req, res) {
  try {
    const [classificationCounts, totalIngested, pendingReviewCount, recentResults] =
      await Promise.all([
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
      ]);

    const counts = { valid: 0, suspicious: 0, invalid: 0, pending: 0 };
    for (const row of classificationCounts) {
      counts[row._id] = row.count;
    }

    // Per-entity health: how many records per entity fell into each bucket
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
      createdAt: r.createdAt,
    }));

    res.json({
      totalIngested,
      classificationCounts: counts,
      pendingReviewCount,
      perEntity,
      recentEvents,
    });
  } catch (err) {
    console.error("[REFORGE] getDashboard error:", err);
    res.status(500).json({ error: err.message || "Failed to build dashboard." });
  }
}

module.exports = { getDashboard };
