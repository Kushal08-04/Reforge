const { AuditLog, RawObservation } = require("../models");

/**
 * GET /api/audit/:id
 * :id is a RawObservation._id. Returns the full chronological lineage for
 * that observation, plus the raw observation itself for context
 * (Section 9: Auditability and Data Lineage).
 */
async function getAudit(req, res) {
  try {
    const { id } = req.params;

    const [rawObservation, entries] = await Promise.all([
      RawObservation.findById(id).lean(),
      AuditLog.find({ rawObservationId: id }).sort({ createdAt: 1 }).lean(),
    ]);

    if (!rawObservation) {
      return res.status(404).json({ error: "Raw observation not found." });
    }

    res.json({ rawObservation, auditTrail: entries });
  } catch (err) {
    console.error("[REFORGE] getAudit error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch audit trail." });
  }
}

module.exports = { getAudit };
