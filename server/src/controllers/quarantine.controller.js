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
 * source/sensor, recent history, evidence, and available actions.
 */
async function getQuarantineDetail(req, res) {
  try {
    const record = await QuarantineRecord.findById(req.params.id).lean();
    if (!record) {
      return res.status(404).json({ error: "Quarantine record not found." });
    }

    const [rawObservation, validationResult, recentHistory] = await Promise.all([
      RawObservation.findById(record.rawObservationId).lean(),
      ValidationResult.findById(record.validationResultId).lean(),
      RawObservation.find({
        entityId: record.entityId,
        timestamp: { $lte: record.timestamp },
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
    ]);

    res.json({
      quarantineRecord: record,
      rawObservation,
      validationResult,
      // oldest-first for easy charting on the frontend
      recentHistory: recentHistory.reverse(),
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

module.exports = { listQuarantine, getQuarantineDetail, reviewQuarantine };
