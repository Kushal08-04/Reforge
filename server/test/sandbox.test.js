const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const util = require("util");
const execFilePromise = util.promisify(execFile);
const mongoose = require("mongoose");

const { verifyRepairInSandbox, checkDockerAvailable } = require("../src/services/sandboxService");

/**
 * Helper to run runner.js in a directory and capture exit code, stdout, stderr
 */
async function runRunnerProcess(dir, runnerPath, timeout = 6000) {
  try {
    const { stdout, stderr } = await execFilePromise("node", [runnerPath], {
      cwd: dir,
      timeout,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    });
    return { exitCode: 0, stdout, stderr, report: JSON.parse(stdout) };
  } catch (err) {
    let report = null;
    if (err.stdout) {
      try {
        report = JSON.parse(err.stdout);
      } catch {
        report = null;
      }
    }
    return { exitCode: err.code || 1, stdout: err.stdout || "", stderr: err.stderr || err.message, report };
  }
}

async function testSandboxExecution() {
  console.log("  Testing comprehensive sandbox runner and execution boundaries (17 test cases)...");

  const runnerPath = fs.existsSync(path.join(__dirname, "..", "sandbox", "runner.js"))
    ? path.join(__dirname, "..", "sandbox", "runner.js")
    : path.join(__dirname, "..", "..", "sandbox", "runner.js");
  assert.ok(fs.existsSync(runnerPath), "sandbox/runner.js must exist");

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "reforge-test-runner-"));

  const auditService = require("../src/services/auditService");
  const originalLogAudit = auditService.logAudit;
  auditService.logAudit = async () => ({});

  try {
    // -------------------------------------------------------------------------
    // 1. Missing configuration file
    // -------------------------------------------------------------------------
    {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-1-"));
      try {
        const res = await runRunnerProcess(emptyDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 1: Missing config must exit with code 1");
        assert.ok(res.report, "Case 1: Must emit JSON report");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.failureStage, "config_validation");
        assert.ok(res.report.error.includes("Missing configuration file"));
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 2. Malformed JSON
    // -------------------------------------------------------------------------
    {
      const malformedDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-2-"));
      try {
        fs.writeFileSync(path.join(malformedDir, "patch_config.json"), "{ targetFile: incomplete, ");
        const res = await runRunnerProcess(malformedDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 2: Malformed JSON must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.failureStage, "config_validation");
        assert.ok(res.report.error.includes("Malformed JSON"));
      } finally {
        fs.rmSync(malformedDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 3. Missing expected entry point
    // -------------------------------------------------------------------------
    {
      const noEntryDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-3-"));
      try {
        fs.writeFileSync(
          path.join(noEntryDir, "module.js"),
          "function otherFunc() { return 42; }\nmodule.exports = { otherFunc };"
        );
        fs.writeFileSync(
          path.join(noEntryDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "module.js",
            entryPoint: "expectedEntryPoint",
            patchType: "guard_clause",
            testCases: [{ name: "test_1", entityId: "sensor_a", value: 10, expectedValue: 10 }],
          })
        );
        const res = await runRunnerProcess(noEntryDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 3: Missing entry point must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.failureStage, "entry_point_resolution");
        assert.ok(res.report.error.includes("Missing expected entry point"));
      } finally {
        fs.rmSync(noEntryDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 4. Empty test suite
    // -------------------------------------------------------------------------
    {
      const emptySuiteDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-4-"));
      try {
        fs.writeFileSync(path.join(emptySuiteDir, "mod.js"), "module.exports = { run: () => 1 };");
        fs.writeFileSync(
          path.join(emptySuiteDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "mod.js",
            entryPoint: "run",
            patchType: "guard_clause",
            testCases: [],
          })
        );
        const res = await runRunnerProcess(emptySuiteDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 4: Empty test suite must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.ok(res.report.error.includes("Empty test suite"));
      } finally {
        fs.rmSync(emptySuiteDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 5. Syntax error in candidate code
    // -------------------------------------------------------------------------
    {
      const syntaxDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-5-"));
      try {
        fs.writeFileSync(path.join(syntaxDir, "broken.js"), "function broken( { return ;");
        fs.writeFileSync(
          path.join(syntaxDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "broken.js",
            entryPoint: "broken",
            patchType: "guard_clause",
            testCases: [{ name: "t1", value: 1 }],
          })
        );
        const res = await runRunnerProcess(syntaxDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 5: Syntax error must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.failureStage, "module_loading");
        assert.ok(res.report.error.includes("Syntax"));
      } finally {
        fs.rmSync(syntaxDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 6. Expected-value mismatch
    // -------------------------------------------------------------------------
    {
      const mismatchDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-6-"));
      try {
        fs.writeFileSync(path.join(mismatchDir, "mod.js"), "module.exports = { calc: (e, v) => v + 5 };");
        fs.writeFileSync(
          path.join(mismatchDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "mod.js",
            entryPoint: "calc",
            patchType: "guard_clause",
            testCases: [{ name: "calc_test", value: 10, expectedValue: 99.0 }],
          })
        );
        const res = await runRunnerProcess(mismatchDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 6: Value mismatch must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.testsPassed, 0);
        assert.ok(res.report.testResults[0].error.includes("Expected output 99"));
      } finally {
        fs.rmSync(mismatchDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 7. Thrown exception in test function
    // -------------------------------------------------------------------------
    {
      const throwDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-7-"));
      try {
        fs.writeFileSync(
          path.join(throwDir, "crash.js"),
          "module.exports = { compute: () => { throw new Error('Hardware ADC Bus Fault'); } };"
        );
        fs.writeFileSync(
          path.join(throwDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "crash.js",
            entryPoint: "compute",
            patchType: "guard_clause",
            testCases: [{ name: "should_fail", value: 10 }],
          })
        );
        const res = await runRunnerProcess(throwDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 7: Thrown exception must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.ok(res.report.testResults[0].error.includes("Hardware ADC Bus Fault"));
      } finally {
        fs.rmSync(throwDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 8. Non-finite output (NaN / Infinity)
    // -------------------------------------------------------------------------
    {
      const nanDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-8-"));
      try {
        fs.writeFileSync(path.join(nanDir, "div.js"), "module.exports = { div: (e, v) => 0 / 0 };");
        fs.writeFileSync(
          path.join(nanDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "div.js",
            entryPoint: "div",
            patchType: "guard_clause",
            testCases: [{ name: "nan_test", value: 10 }],
          })
        );
        const res = await runRunnerProcess(nanDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 8: Non-finite output must exit with code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.allNumericValid, false);
      } finally {
        fs.rmSync(nanDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 9. Infinite loop and timeout
    // -------------------------------------------------------------------------
    {
      const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-9-"));
      try {
        fs.writeFileSync(
          path.join(loopDir, "loop.js"),
          "module.exports = { hang: () => new Promise((resolve) => setTimeout(resolve, 10000)) };"
        );
        fs.writeFileSync(
          path.join(loopDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "loop.js",
            entryPoint: "hang",
            patchType: "guard_clause",
            testCases: [{ name: "hang_test", value: 10 }],
          })
        );
        const res = await runRunnerProcess(loopDir, runnerPath, 5000);
        assert.strictEqual(res.exitCode, 1, "Case 9: Infinite loop must time out and exit code 1");
        assert.ok(res.report, "Case 9: Report must be emitted");
        assert.strictEqual(res.report.status, "FAIL");
        assert.ok(res.report.testResults[0].error.includes("timed out"));
      } finally {
        fs.rmSync(loopDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 10. Attempted unauthorized filesystem access
    // -------------------------------------------------------------------------
    {
      const fsDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-10-"));
      try {
        fs.writeFileSync(
          path.join(fsDir, "hack.js"),
          "module.exports = { exploit: () => { try { require('fs').writeFileSync('/etc/hacked.txt', 'pwned'); return 0; } catch (e) { return -1; } } };"
        );
        fs.writeFileSync(
          path.join(fsDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "hack.js",
            entryPoint: "exploit",
            patchType: "guard_clause",
            testCases: [{ name: "exploit_test", value: 10, expectedValue: -1 }],
          })
        );
        const res = await runRunnerProcess(fsDir, runnerPath);
        assert.strictEqual(res.exitCode, 0, "Case 10: Unauthorized filesystem write must be blocked");
      } finally {
        fs.rmSync(fsDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 11. Attempted network access
    // -------------------------------------------------------------------------
    {
      const netDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-11-"));
      try {
        fs.writeFileSync(
          path.join(netDir, "net.js"),
          "module.exports = { dial: async () => { try { await fetch('http://127.0.0.1:59999', { signal: AbortSignal.timeout(800) }); return 'connected'; } catch { return 'blocked'; } } };"
        );
        fs.writeFileSync(
          path.join(netDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "net.js",
            entryPoint: "dial",
            patchType: "guard_clause",
            testCases: [{ name: "net_test", value: 10, expectedValue: "blocked" }],
          })
        );
        const res = await runRunnerProcess(netDir, runnerPath);
        assert.strictEqual(res.exitCode, 0, "Case 11: Network access must be blocked/handled");
      } finally {
        fs.rmSync(netDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 12. Failed patch application
    // -------------------------------------------------------------------------
    {
      const mockProposalId = new mongoose.Types.ObjectId();
      const mockProposal = {
        _id: mockProposalId,
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "PROPOSED",
        entityId: "zone-a-temperature",
        proposedPatch: {
          targetFile: "pipeline/calibration.js",
          patchType: "calibration_offset",
          codeAfter: "", // Empty patch code must fail patch application!
        },
        stateHistory: [],
        save: async function () {
          return this;
        },
      };

      const originalFindById = require("../src/models").RepairProposal.findById;
      require("../src/models").RepairProposal.findById = async () => mockProposal;

      try {
        const result = await verifyRepairInSandbox(mockProposalId.toString(), "tester");
        assert.strictEqual(result.proposedPatch.applicationState, "FAILED");
        assert.strictEqual(result.lifecycleState, "SANDBOX_FAILED");
        assert.strictEqual(result.sandboxResult.status, "EXECUTION_ERROR");
      } finally {
        require("../src/models").RepairProposal.findById = originalFindById;
      }
    }

    // -------------------------------------------------------------------------
    // 13. Failed repository test
    // -------------------------------------------------------------------------
    {
      const failTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-13-"));
      try {
        fs.writeFileSync(
          path.join(failTestDir, "failing_sanitizer.js"),
          "module.exports = { sanitizeReading: () => 999.0 };" // returns wrong value
        );
        fs.writeFileSync(
          path.join(failTestDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "failing_sanitizer.js",
            entryPoint: "sanitizeReading",
            patchType: "outlier_clamp",
            testCases: [
              { name: "normal", value: 25.0, prev: 24.5, expectedValue: 25.0 },
              { name: "spike", value: 80.0, prev: 25.0, expectedValue: 25.0 },
            ],
          })
        );
        const res = await runRunnerProcess(failTestDir, runnerPath);
        assert.strictEqual(res.exitCode, 1, "Case 13: Failed tests must exit code 1");
        assert.strictEqual(res.report.status, "FAIL");
        assert.strictEqual(res.report.testsPassed, 0);
      } finally {
        fs.rmSync(failTestDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 14. Semantic verification failure
    // -------------------------------------------------------------------------
    {
      const mockProposalId = new mongoose.Types.ObjectId();
      const mockProposal = {
        _id: mockProposalId,
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "PROPOSED",
        entityId: "zone-b-humidity",
        evidence: { rawReading: 95.0 },
        proposedPatch: {
          targetFile: "pipeline/calibration.js",
          patchType: "calibration_offset",
          entryPoint: "applyCalibration",
          codeAfter: `
            function applyCalibration(entityId, rawValue, peerClusterMean, options = {}) {
              return 95.0; // Extreme semantic outlier!
            }
            module.exports = { applyCalibration };
          `,
          testCases: [
            {
              name: "semantic_outlier_test",
              entityId: "zone-b-humidity",
              value: 95.0,
              expectedValue: 95.0,
            },
          ],
        },
        stateHistory: [],
        save: async function () {
          return this;
        },
      };

      const originalFindById = require("../src/models").RepairProposal.findById;
      require("../src/models").RepairProposal.findById = async () => mockProposal;

      try {
        // Run verification: code is syntactically valid and returns 95.0, but 95.0 triggers rule engine!
        const result = await verifyRepairInSandbox(mockProposalId.toString(), "tester");
        assert.strictEqual(result.sandboxResult.semanticChecksPassed, false);
        assert.ok(
          result.lifecycleState === "NEEDS_REVIEW" || result.lifecycleState === "SANDBOX_FAILED",
          `Expected NEEDS_REVIEW or SANDBOX_FAILED, got ${result.lifecycleState}`
        );
        assert.ok(
          ["NEEDS_HUMAN_REVIEW", "FAIL", "EXECUTION_ERROR"].includes(result.sandboxResult.status),
          `Expected status NEEDS_HUMAN_REVIEW, FAIL, or EXECUTION_ERROR, got ${result.sandboxResult.status}`
        );


      } finally {
        require("../src/models").RepairProposal.findById = originalFindById;
      }
    }

    // -------------------------------------------------------------------------
    // 15. Successful repair
    // -------------------------------------------------------------------------
    {
      const successDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-case-15-"));
      try {
        const calibContent = fs.readFileSync(path.join(__dirname, "..", "..", "pipeline", "calibration.js"), "utf-8");
        fs.writeFileSync(path.join(successDir, "calibration.js"), calibContent);
        fs.writeFileSync(
          path.join(successDir, "patch_config.json"),
          JSON.stringify({
            targetFile: "calibration.js",
            entryPoint: "applyCalibration",
            patchType: "calibration_offset",
            testCases: [
              {
                name: "normal_reading",
                entityId: "zone-a-temp",
                value: 25.0,
                peerClusterMean: 25.0,
                expectedAnomaly: false,
                expectedValue: 25.0,
              },
              {
                name: "divergent_reading_preserves_raw",
                entityId: "zone-a-temp",
                value: 80.0,
                peerClusterMean: 25.0,
                expectedAnomaly: true,
                expectedValue: 80.0,
              },
              {
                name: "validated_offset_application",
                entityId: "zone-a-temp",
                value: 80.0,
                peerClusterMean: 25.0,
                options: { validatedOffset: 10.0, returnObject: true },
                expectedAnomaly: false,
                expectedValue: 70.0,
              },
            ],
          })
        );
        const res = await runRunnerProcess(successDir, runnerPath);
        assert.strictEqual(res.exitCode, 0, "Case 15: Successful repair must exit code 0");
        assert.strictEqual(res.report.status, "PASS");
        assert.strictEqual(res.report.testsPassed, 3);
        assert.strictEqual(res.report.testsTotal, 3);
      } finally {
        fs.rmSync(successDir, { recursive: true, force: true });
      }
    }

    // -------------------------------------------------------------------------
    // 16. Sandbox unavailable
    // -------------------------------------------------------------------------
    {
      const prevSubprocess = process.env.ALLOW_SUBPROCESS_SANDBOX;
      delete process.env.ALLOW_SUBPROCESS_SANDBOX; // Disallow subprocess fallback

      const mockProposalId = new mongoose.Types.ObjectId();
      const mockProposal = {
        _id: mockProposalId,
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "PROPOSED",
        entityId: "zone-a",
        proposedPatch: {
          targetFile: "pipeline/calibration.js",
          patchType: "calibration_offset",
          codeAfter: "module.exports = { applyCalibration: () => 25 };",
        },
        stateHistory: [],
        save: async function () {
          return this;
        },
      };

      const originalFindById = require("../src/models").RepairProposal.findById;
      require("../src/models").RepairProposal.findById = async () => mockProposal;

      // Temporarily mock checkDockerAvailable to return false
      const sandboxService = require("../src/services/sandboxService");
      const originalCheckDocker = sandboxService.checkDockerAvailable;

      try {
        sandboxService.checkDockerAvailable = async () => false;
        const result = await verifyRepairInSandbox(mockProposalId.toString(), "tester");
        assert.strictEqual(result.sandboxResult.status, "UNAVAILABLE");
        assert.strictEqual(result.lifecycleState, "SANDBOX_FAILED");
        assert.strictEqual(result.sandboxResult.runtimeIsolation, "docker_unavailable");
      } finally {
        sandboxService.checkDockerAvailable = originalCheckDocker;
        require("../src/models").RepairProposal.findById = originalFindById;
        if (prevSubprocess) process.env.ALLOW_SUBPROCESS_SANDBOX = prevSubprocess;
      }
    }

    // -------------------------------------------------------------------------
    // 17. Correct parent-process interpretation of exit codes
    // -------------------------------------------------------------------------
    {
      const mockProposalId = new mongoose.Types.ObjectId();
      const mockProposal = {
        _id: mockProposalId,
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "PROPOSED",
        entityId: "zone-a",
        evidence: { rawReading: 80.0 },
        proposedPatch: {
          targetFile: "pipeline/sanitizer.js",
          patchType: "outlier_clamp",
          codeAfter: "module.exports = { sanitizeReading: () => 999.0 };", // Triggers exit code 1
        },
        stateHistory: [],
        save: async function () {
          return this;
        },
      };

      const originalFindById = require("../src/models").RepairProposal.findById;
      require("../src/models").RepairProposal.findById = async () => mockProposal;

      try {
        const result = await verifyRepairInSandbox(mockProposalId.toString(), "tester");
        assert.strictEqual(result.sandboxResult.status, "FAIL");
        assert.strictEqual(result.sandboxResult.exitCode, 1);
        assert.strictEqual(result.lifecycleState, "SANDBOX_FAILED");
        assert.ok(result.sandboxResult.testResults.length > 0);
      } finally {
        require("../src/models").RepairProposal.findById = originalFindById;
      }
    }

    // -------------------------------------------------------------------------
    // 18. End-to-end successful repair verification advancing to VERIFIED
    // -------------------------------------------------------------------------
    {
      const mockProposalId = new mongoose.Types.ObjectId();
      const mockProposal = {
        _id: mockProposalId,
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "PROPOSED",
        entityId: "zone-a-temp",
        evidence: { rawReading: 80.0, rollingMean: 25.0, rollingStd: 1.0 },
        proposedPatch: {
          targetFile: "pipeline/calibration.js",
          patchType: "calibration_offset",
          entryPoint: "applyCalibration",
          codeAfter: fs.readFileSync(path.join(__dirname, "..", "..", "pipeline", "calibration.js"), "utf-8"),
        },
        stateHistory: [],
        save: async function () {
          return this;
        },
      };

      const originalFindById = require("../src/models").RepairProposal.findById;
      require("../src/models").RepairProposal.findById = async () => mockProposal;

      try {
        const result = await verifyRepairInSandbox(mockProposalId.toString(), "tester");
        assert.strictEqual(result.sandboxResult.status, "PASS", "Proposal status must be PASS");
        assert.strictEqual(result.sandboxResult.exitCode, 0, "Exit code must be 0");
        assert.strictEqual(result.sandboxResult.semanticChecksPassed, true, "Semantic checks must pass");
        assert.strictEqual(result.lifecycleState, "VERIFIED", "Lifecycle state must advance to VERIFIED");
        assert.strictEqual(result.sandboxResult.testsPassed, result.sandboxResult.testsTotal);
        assert.ok(result.sandboxResult.testsTotal > 0);
      } finally {
        require("../src/models").RepairProposal.findById = originalFindById;
      }
    }

    // -------------------------------------------------------------------------
    // 19. End-to-end sanitizer outlier clamp verification advancing to VERIFIED
    // -------------------------------------------------------------------------
    {
      const mockProposalId = new mongoose.Types.ObjectId();
      const mockProposal = {
        _id: mockProposalId,
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "PROPOSED",
        entityId: "zone-b-humidity",
        evidence: { rawReading: 95.0, rollingMean: 50.0, rollingStd: 5.0 },
        proposedPatch: {
          targetFile: "pipeline/sanitizer.js",
          patchType: "outlier_clamp",
          entryPoint: "sanitizeReading",
          codeAfter: fs.readFileSync(path.join(__dirname, "..", "..", "pipeline", "sanitizer.js"), "utf-8"),
        },
        stateHistory: [],
        save: async function () {
          return this;
        },
      };

      const originalFindById = require("../src/models").RepairProposal.findById;
      require("../src/models").RepairProposal.findById = async () => mockProposal;

      try {
        const result = await verifyRepairInSandbox(mockProposalId.toString(), "tester");
        assert.strictEqual(result.sandboxResult.status, "PASS", "Proposal status must be PASS");
        assert.strictEqual(result.sandboxResult.exitCode, 0, "Exit code must be 0");
        assert.strictEqual(result.sandboxResult.semanticChecksPassed, true, "Semantic checks must pass");
        assert.strictEqual(result.lifecycleState, "VERIFIED", "Lifecycle state must advance to VERIFIED");
        assert.strictEqual(result.sandboxResult.testsPassed, result.sandboxResult.testsTotal);
        assert.ok(result.sandboxResult.testsTotal > 0);
      } finally {
        require("../src/models").RepairProposal.findById = originalFindById;
      }
    }
  } finally {
    auditService.logAudit = originalLogAudit;
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  console.log("  [ok] All 19 sandbox execution and security boundary test cases passed.");
}

module.exports = { testSandboxExecution };
