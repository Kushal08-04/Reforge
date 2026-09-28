/**
 * seedDataset.js
 * ----------------
 * Generates the synthetic multi-sensor dataset (datasetGenerator.js) and
 * runs every record through the real validation pipeline, exactly as if it
 * had arrived via POST /api/ingest. This populates RawObservation,
 * ValidationResult, QuarantineRecord, and AuditLog with a realistic demo
 * dataset including labelled semantic anomalies.
 *
 * Usage:
 *   npm run seed            # seed on top of whatever is already in the DB
 *   npm run seed -- --reset # wipe REFORGE collections first, then seed
 *
 * Ground-truth labels (which records were seeded as anomalies, and of what
 * type) are written to src/scripts/output/labels.json so evaluate.js can
 * compute precision/recall/F1 against them.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const { RawObservation, ValidationResult, QuarantineRecord, AuditLog } = require("../models");
const { generateDataset } = require("../services/datasetGenerator");
const { runPipeline } = require("../services/validationPipeline");

const OUTPUT_DIR = path.join(__dirname, "output");
const LABELS_PATH = path.join(OUTPUT_DIR, "labels.json");

async function reset() {
  console.log("[REFORGE] --reset flag detected. Clearing existing REFORGE collections...");
  await Promise.all([
    RawObservation.deleteMany({}),
    ValidationResult.deleteMany({}),
    QuarantineRecord.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  console.log("[REFORGE] Collections cleared.\n");
}

async function run() {
  await connectDB();

  if (process.argv.includes("--reset")) {
    await reset();
  }

  const { records, injectedCount } = generateDataset();
  console.log(
    `[REFORGE] Generated ${records.length} synthetic observations (${injectedCount} labelled anomalies). Seeding...\n`
  );

  const labels = {};
  const summary = { valid: 0, suspicious: 0, invalid: 0 };
  let processed = 0;

  for (const record of records) {
    const { _meta, ...payload } = record;
    // eslint-disable-next-line no-await-in-loop
    const result = await runPipeline(payload);

    const ingestKey = result.rawObservation.ingestKey;
    labels[ingestKey] = {
      isAnomalySeed: _meta.isAnomalySeed,
      anomalyType: _meta.anomalyType,
      entityId: payload.entityId,
      timestamp: payload.timestamp,
    };

    summary[result.validationResult.classification] =
      (summary[result.validationResult.classification] || 0) + 1;

    processed++;
    if (processed % 50 === 0) {
      console.log(`  ...${processed}/${records.length} ingested`);
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(LABELS_PATH, JSON.stringify(labels, null, 2));

  console.log("\n[REFORGE] Seeding complete.");
  console.log(`  Total records:        ${records.length}`);
  console.log(`  Classified valid:     ${summary.valid || 0}`);
  console.log(`  Classified suspicious:${summary.suspicious || 0}`);
  console.log(`  Classified invalid:   ${summary.invalid || 0}`);
  console.log(`  Ground-truth labels written to: ${LABELS_PATH}`);
  console.log(`\n  Run "npm run evaluate" to compare classifications against ground truth.`);

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("[REFORGE] Seeding failed:", err);
  process.exit(1);
});
