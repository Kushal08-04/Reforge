/**
 * runTests.js
 * -----------
 * Executes all automated unit, integration, and security guard test suites for REFORGE.
 */

const { testRules } = require("./rules.test");
const { testHybridDecisionEngine } = require("./hybrid.test");
const { testSandboxExecution } = require("./sandbox.test");
const { testGitHubIntegration } = require("./github.test");

async function main() {
  console.log("\n========================================");
  console.log(" Running REFORGE Automated Test Suites");
  console.log("========================================\n");

  try {
    testRules();
    testHybridDecisionEngine();
    await testSandboxExecution();
    await testGitHubIntegration();

    console.log("\n========================================");
    console.log(" ALL 4 TEST SUITES PASSED SUCCESSFULLY!");
    console.log("========================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\nTEST SUITE FAILED:", err);
    process.exit(1);
  }
}

main();
