const assert = require("assert");
const dataRepairService = require("../src/services/dataRepairService");
const datasetVersionService = require("../src/services/datasetVersionService");
const { buildPdfReport } = require("../src/controllers/export.controller");

async function runDataRepairTests() {
  console.log("  Testing Mode A: Data-Level Repair candidate generator...");

  // 1. Test Physical domain boundaries
  assert(dataRepairService.PHYSICAL_SENSOR_BOUNDS.temperature.max === 60.0, "Temp max bound should be 60");
  assert(dataRepairService.PHYSICAL_SENSOR_BOUNDS.humidity.max === 100.0, "Humidity max bound should be 100");

  // 2. Test Linear temporal interpolation between predecessor and successor
  const rawObs1 = {
    entityId: "sensor-temperature-1",
    timestamp: new Date("2020-07-15T12:00:10Z"),
    values: { value: 99.0 }, // impossible spike
  };
  const pred1 = {
    timestamp: new Date("2020-07-15T12:00:00Z"),
    values: { value: 24.0 },
  };
  const succ1 = {
    timestamp: new Date("2020-07-15T12:00:20Z"),
    values: { value: 26.0 },
  };

  const candidates1 = dataRepairService.generateDataRepairCandidates({
    rawObservation: rawObs1,
    predecessor: pred1,
    successor: succ1,
    history: [pred1],
  });

  assert.strictEqual(candidates1.repairMode, "DATA_REPAIR");
  // 99.0 is out of bounds (> 60), so it triggers physical clamp / interpolation
  assert.strictEqual(candidates1.proposedValue, 25.0, "Interpolation between 24 and 26 at midpoint should be 25.0");
  assert(candidates1.confidenceScore >= 0.90, "Confidence score should be high");

  // 3. Test Peer consensus estimation when interpolation is unavailable
  const rawObs2 = {
    entityId: "sensor-humidity-1",
    timestamp: new Date("2020-07-15T12:00:10Z"),
    values: { value: 50.0 }, // in normal bounds, but let's test peer consensus
  };
  const peers2 = [
    { values: { value: 62.0 } },
    { values: { value: 64.0 } },
    { values: { value: 63.0 } },
  ];
  const candidates2 = dataRepairService.generateDataRepairCandidates({
    rawObservation: rawObs2,
    peers: peers2,
  });
  assert(candidates2.proposedValue >= 62.0 && candidates2.proposedValue <= 64.0, "Should align with peer consensus median");

  // 4. Test Sandbox overlay verification for candidate data repair
  console.log("  Testing Mode A: In-memory sandbox overlay verification...");
  const sandboxResult = await dataRepairService.verifyDataRepairInSandbox({
    rawObservation: rawObs1,
    proposedValue: 25.0,
    predecessor: pred1,
  });

  assert.strictEqual(sandboxResult.status, "PASS", "Sandbox verification should pass for 25.0");
  assert.strictEqual(sandboxResult.runtimeIsolation, "in_memory_sandbox_overlay");
  assert.strictEqual(sandboxResult.exitCode, 0);
  assert(sandboxResult.testsPassed === 4, "All 4 sandbox tests should pass");
  assert.strictEqual(sandboxResult.correctedValue, 25.0);

  // 5. Test Sandbox overlay failure on out-of-bounds candidate
  const failedSandboxResult = await dataRepairService.verifyDataRepairInSandbox({
    rawObservation: rawObs1,
    proposedValue: 120.0, // out of physical bounds
    predecessor: pred1,
  });
  assert.strictEqual(failedSandboxResult.status, "FAIL", "Sandbox verification should fail for out of bounds reading");
  assert.strictEqual(failedSandboxResult.exitCode, 1);

  // 6. Test Valid binary PDF generation
  console.log("  Testing PDF repair report generation conforming to PDF-1.4...");
  const pdfBuffer = buildPdfReport({
    versionId: "v1.0.1",
    baseVersion: "v1.0.0",
    repairedCount: 3,
    recordCount: 405171,
    changes: [
      {
        entityId: "sensor-temp-1",
        timestamp: new Date(),
        originalValue: 99.5,
        repairedValue: 24.8,
        strategy: "historical_interpolation",
      },
    ],
  });

  assert(Buffer.isBuffer(pdfBuffer), "PDF output must be a Buffer");
  const pdfString = pdfBuffer.toString("utf-8");
  assert(pdfString.startsWith("%PDF-1.4"), "PDF must start with %PDF-1.4 header");
  assert(pdfString.includes("%%EOF"), "PDF must terminate with %%EOF trailer");
  assert(pdfString.includes("REFORGE - Data-Level Repair Audit Report"), "PDF must contain REFORGE report title");

  console.log("  [ok] Mode A Data-Level Repair, sandbox overlay, and PDF generation tests passed.");
}

module.exports = runDataRepairTests;

if (require.main === module) {
  runDataRepairTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
