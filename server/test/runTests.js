require("dotenv").config();

const { testRules } = require("./rules.test");
const { testHybridDecisionEngine } = require("./hybrid.test");
const { testCalibrationModule } = require("./calibration.test");
const { testFeatureBuilder } = require("./featureBuilder.test");
const { testRepairLifecycle } = require("./repair.test");
const { testSandboxExecution } = require("./sandbox.test");
const { testGitHubIntegration } = require("./github.test");
const runDataRepairTests = require("./dataRepair.test");

async function main() {
  console.log("\n========================================");
  console.log(" Running REFORGE Automated Test Suites");
  console.log("========================================\n");

  try {
    testRules();
    testFeatureBuilder();
    testHybridDecisionEngine();
    testCalibrationModule();
    await testRepairLifecycle();
    await testSandboxExecution();
    await testGitHubIntegration();
    await runDataRepairTests();

    console.log("\n========================================");
    console.log(" ALL 8 TEST SUITES PASSED SUCCESSFULLY!");
    console.log("========================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\nTEST SUITE FAILED:", err);
    process.exit(1);
  }
}

main();
