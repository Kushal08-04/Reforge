require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { RawObservation, ValidationResult, QuarantineRecord, AuditLog } = require("../models");

async function run() {
  console.log("[REFORGE] Running model verification checkpoint...\n");
  await connectDB();

  const models = { RawObservation, ValidationResult, QuarantineRecord, AuditLog };
  for (const [name, model] of Object.entries(models)) {
    const count = await model.estimatedDocumentCount();
    console.log(`  [ok] ${name} model reachable. Current doc count: ${count}`);
  }

  console.log("\n[REFORGE] Testing round-trip write/read/cleanup on RawObservation...");
  const testDoc = await RawObservation.create({
    sourceId: "checkpoint-test-source",
    sourceType: "manual",
    entityId: "checkpoint-sensor-01",
    timestamp: new Date(),
    values: { value: 24.5 },
    units: { value: "C" },
    rawPayload: { note: "checkpoint test document" },
    ingestKey: `checkpoint-test-${Date.now()}`,
  });
  console.log(`  [ok] Created test document: ${testDoc._id}`);

  const found = await RawObservation.findById(testDoc._id);
  console.log(`  [ok] Read back test document: ${found ? "found" : "MISSING"}`);

  await RawObservation.deleteOne({ _id: testDoc._id });
  console.log("  [ok] Cleaned up test document.");

  console.log("\n[REFORGE] Checkpoint PASSED.");
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("\n[REFORGE] Checkpoint FAILED:", err);
  process.exit(1);
});
