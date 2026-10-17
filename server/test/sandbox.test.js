const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const util = require("util");
const execFilePromise = util.promisify(execFile);

async function testSandboxExecution() {
  console.log("  Testing isolated sandbox runner and semantic checks...");

  const runnerPath = path.join(__dirname, "..", "..", "sandbox", "runner.js");
  assert.ok(fs.existsSync(runnerPath), "sandbox/runner.js must exist");

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-sandbox-"));

  try {
    // 1. Valid patch test
    const patchConfig = {
      targetFile: "pipeline/sanitizer.js",
      patchType: "outlier_clamp",
      codeAfter: `
        function sanitizeReading(entityId, currentVal, prevVal) {
          const MAX_STEP = 20.0;
          if (prevVal !== null && Math.abs(currentVal - prevVal) > MAX_STEP) {
            return prevVal;
          }
          return currentVal;
        }
      `,
      testInputs: [
        { entityId: "zone-a-temperature", value: 25.0, prev: 24.5 },
        { entityId: "zone-a-temperature", value: 80.0, prev: 25.0 },
      ],
    };

    fs.writeFileSync(path.join(scratchDir, "patch_config.json"), JSON.stringify(patchConfig));
    fs.copyFileSync(runnerPath, path.join(scratchDir, "runner.js"));

    const { stdout } = await execFilePromise("node", [path.join(scratchDir, "runner.js")], {
      cwd: scratchDir,
      timeout: 5000,
    });

    const report = JSON.parse(stdout);
    assert.strictEqual(report.status, "PASS", "Valid patch must PASS unit and schema checks");
    assert.strictEqual(report.testsPassed, 3, "1 compilation + 2 input tests must pass");
    assert.strictEqual(report.allNumericValid, true, "All outputs must be valid finite numbers");

    // Verify clamped output on the anomalous spike
    const spikeTest = report.testResults.find((t) => t.test.includes("input_1"));
    assert.strictEqual(spikeTest.outputValue, 25.0, "Spike to 80.0 must be clamped to 25.0");

    // 2. Syntax error patch test
    const brokenConfig = {
      codeAfter: "function brokenSyntax( { return ;",
      testInputs: [{ entityId: "zone-a", value: 10, prev: 10 }],
    };
    fs.writeFileSync(path.join(scratchDir, "patch_config.json"), JSON.stringify(brokenConfig));

    const brokenRes = await execFilePromise("node", [path.join(scratchDir, "runner.js")], {
      cwd: scratchDir,
      timeout: 5000,
    });
    const brokenReport = JSON.parse(brokenRes.stdout);
    assert.strictEqual(brokenReport.status, "FAIL", "Broken syntax must FAIL in sandbox");
    assert.ok(brokenReport.error.includes("Syntax"), "Error must report syntax failure");
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  console.log("  [ok] Sandbox runner and execution boundaries passed.");
}

module.exports = { testSandboxExecution };
