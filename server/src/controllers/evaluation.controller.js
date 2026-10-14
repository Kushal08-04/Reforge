/**
 * evaluation.controller.js
 * -------------------------
 * Exposes endpoints for running and retrieving comparative benchmarks.
 */

const { EvaluationRun } = require("../models");
const { runEvaluationBenchmark } = require("../services/evaluationBenchmarkService");

async function getLatest(req, res) {
  try {
    let latest = await EvaluationRun.findOne().sort({ evaluatedAt: -1 }).lean();
    if (!latest) {
      // Run initial benchmark on the fly
      latest = await runEvaluationBenchmark();
    }
    res.json({ evaluation: latest });
  } catch (err) {
    console.error("[REFORGE] getLatest evaluation error:", err);
    res.status(500).json({ error: err.message || "Failed to retrieve evaluation." });
  }
}

async function triggerRun(req, res) {
  try {
    const report = await runEvaluationBenchmark();
    res.status(201).json({ evaluation: report });
  } catch (err) {
    console.error("[REFORGE] triggerRun evaluation error:", err);
    res.status(500).json({ error: err.message || "Failed to execute evaluation benchmark." });
  }
}

async function getHistory(req, res) {
  try {
    const history = await EvaluationRun.find()
      .sort({ evaluatedAt: -1 })
      .limit(10)
      .lean();
    res.json({ history });
  } catch (err) {
    console.error("[REFORGE] getHistory evaluation error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch evaluation history." });
  }
}

module.exports = { getLatest, triggerRun, getHistory };
