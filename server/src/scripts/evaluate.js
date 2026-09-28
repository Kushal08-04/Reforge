/**
 * evaluate.js
 * ----------------
 * Compares REFORGE's rule-based classifications against the ground-truth
 * anomaly labels written by seedDataset.js, and reports precision, recall,
 * F1, and false positive/negative counts (Section 10 of the handoff doc:
 * the research/experimental component).
 *
 * "Flagged" = classification is "suspicious" or "invalid" (i.e. NOT "valid").
 * This is compared against whether the record was seeded as an anomaly.
 *
 * Usage: npm run evaluate   (must run AFTER npm run seed)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const { RawObservation, ValidationResult } = require("../models");

const LABELS_PATH = path.join(__dirname, "output", "labels.json");

async function run() {
  if (!fs.existsSync(LABELS_PATH)) {
    console.error(
      `[REFORGE] No labels file found at ${LABELS_PATH}. Run "npm run seed" first.`
    );
    process.exit(1);
  }

  await connectDB();

  const labels = JSON.parse(fs.readFileSync(LABELS_PATH, "utf-8"));
  const ingestKeys = Object.keys(labels);

  let tp = 0; // flagged AND actually anomalous
  let fp = 0; // flagged BUT actually normal
  let tn = 0; // not flagged AND actually normal
  let fn = 0; // not flagged BUT actually anomalous
  const missedAnomalies = [];
  const falseAlarms = [];
  const byType = {}; // anomalyType -> { total, caught }

  for (const ingestKey of ingestKeys) {
    const label = labels[ingestKey];
    // eslint-disable-next-line no-await-in-loop
    const rawObs = await RawObservation.findOne({ ingestKey }).lean();
    if (!rawObs) continue;

    // eslint-disable-next-line no-await-in-loop
    const validationResult = await ValidationResult.findOne({
      rawObservationId: rawObs._id,
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!validationResult) continue;

    const flagged = validationResult.classification !== "valid";
    const actual = label.isAnomalySeed;

    if (flagged && actual) tp++;
    else if (flagged && !actual) {
      fp++;
      falseAlarms.push({ entityId: label.entityId, timestamp: label.timestamp });
    } else if (!flagged && !actual) tn++;
    else if (!flagged && actual) {
      fn++;
      missedAnomalies.push({
        entityId: label.entityId,
        timestamp: label.timestamp,
        anomalyType: label.anomalyType,
      });
    }

    if (actual) {
      byType[label.anomalyType] = byType[label.anomalyType] || { total: 0, caught: 0 };
      byType[label.anomalyType].total++;
      if (flagged) byType[label.anomalyType].caught++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  console.log("\n========================================");
  console.log(" REFORGE Rule-Based Engine - Evaluation");
  console.log("========================================\n");
  console.log(`Total labelled records evaluated: ${ingestKeys.length}`);
  console.log(`  True Positives  (caught anomalies):     ${tp}`);
  console.log(`  False Positives (false alarms):         ${fp}`);
  console.log(`  True Negatives  (correctly passed):     ${tn}`);
  console.log(`  False Negatives (missed anomalies):     ${fn}\n`);

  console.log(`Precision: ${precision !== null ? precision.toFixed(3) : "n/a"}`);
  console.log(`Recall:    ${recall !== null ? recall.toFixed(3) : "n/a"}`);
  console.log(`F1-score:  ${f1 !== null ? f1.toFixed(3) : "n/a"}\n`);

  console.log("Detection rate by injected anomaly type:");
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`  ${type}: ${stats.caught}/${stats.total} caught`);
  }

  if (missedAnomalies.length) {
    console.log("\nMissed anomalies:");
    missedAnomalies.forEach((m) =>
      console.log(`  - ${m.entityId} @ ${m.timestamp} (${m.anomalyType})`)
    );
  }
  if (falseAlarms.length) {
    console.log("\nFalse alarms (flagged but seeded as normal):");
    falseAlarms.forEach((f) => console.log(`  - ${f.entityId} @ ${f.timestamp}`));
  }

  console.log("\nNote: thresholds in scoringEngine.js/ruleEngine.js are hand-tuned");
  console.log("starting points, not a locked specification (Section 7 of the handoff doc).");
  console.log("Adjust RULE_WEIGHTS / thresholds and re-run seed+evaluate to tune.\n");

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("[REFORGE] Evaluation failed:", err);
  process.exit(1);
});
