const { ValidationResult, RawObservation } = require("../models");

/**
 * GET /api/validation/:id
 * :id may be either a ValidationResult._id or a RawObservation._id -
 * the latter is more convenient for frontend links that only know the
 * raw observation, so we check both.
 */
async function getValidation(req, res) {
  try {
    const { id } = req.params;

    let result = await ValidationResult.findById(id).lean().catch(() => null);

    if (!result) {
      result = await ValidationResult.findOne({ rawObservationId: id })
        .sort({ createdAt: -1 })
        .lean();
    }

    if (!result) {
      return res.status(404).json({ error: "Validation result not found." });
    }

    const rawObservation = await RawObservation.findById(
      result.rawObservationId
    ).lean();

    res.json({ validationResult: result, rawObservation });
  } catch (err) {
    console.error("[REFORGE] getValidation error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch validation result." });
  }
}

module.exports = { getValidation };
