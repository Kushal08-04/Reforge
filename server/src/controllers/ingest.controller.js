const { runPipeline } = require("../services/validationPipeline");

/**
 * POST /api/ingest
 * Accepts either a single observation object or { records: [...] } for batch
 * ingestion. Each record runs through the full validation pipeline
 * synchronously and the result (including classification) is returned -
 * this keeps the MVP simple (no queue/async worker) while still being
 * correct, since the dataset sizes involved in a demo are small.
 */
async function ingest(req, res) {
  try {
    const body = req.body;
    const records = Array.isArray(body?.records) ? body.records : [body];

    if (!records.length) {
      return res.status(400).json({ error: "No records provided." });
    }

    const results = [];
    for (const record of records) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runPipeline(record);
      results.push({
        rawObservationId: result.rawObservation._id,
        entityId: result.rawObservation.entityId,
        timestamp: result.rawObservation.timestamp,
        classification: result.validationResult.classification,
        semanticRiskScore: result.validationResult.semanticRiskScore,
        schemaValid: result.validationResult.schemaValid,
        quarantined: !!result.quarantineRecord,
        deduplicated: result.deduplicated,
      });
    }

    const status = records.length === 1 ? 201 : 200;
    res.status(status).json(records.length === 1 ? results[0] : { count: results.length, results });
  } catch (err) {
    console.error("[REFORGE] Ingest error:", err);
    res.status(500).json({ error: err.message || "Ingestion failed." });
  }
}

module.exports = { ingest };
