/**
 * runner.js
 * ---------
 * Robust, isolated verification runner for candidate ETL repair patches.
 *
 * Verification Gates:
 * 1. Configuration Validation: Validates patch_config.json structure, required fields, and non-empty test cases.
 * 2. Patch & Module Loading: Loads the actual patched file on disk (no new Function()).
 * 3. Entry Point Resolution: Strictly requires declared entryPoint function; NO fallback mocks.
 * 4. Contract Assertions: Compares actual outputs against declared expected behavior (values, anomalies, actions).
 * 5. Execution Stability: Handles sync/async, enforces per-test timeouts, and records exceptions.
 * 6. Non-zero exit code on ANY failure; exit code 0 ONLY on complete pass.
 */

const fs = require("fs");
const path = require("path");

const PER_TEST_TIMEOUT_MS = 2500;
const MAX_OUTPUT_SIZE_BYTES = 64 * 1024; // 64 KB limit

function isNumeric(val) {
  return typeof val === "number" && !isNaN(val) && Number.isFinite(val);
}

function emitReportAndExit(report, exitCode) {
  const serialized = JSON.stringify(report, null, 2);
  if (Buffer.byteLength(serialized, "utf-8") > MAX_OUTPUT_SIZE_BYTES) {
    // Truncate individual test results if oversized
    report.testResults = report.testResults.slice(0, 10);
    report.truncated = true;
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(serialized);
  }
  process.exit(exitCode);
}

async function runSandboxVerification() {
  const startTime = Date.now();
  const configPath = path.resolve(process.cwd(), "patch_config.json");

  // --- 1. Load and Validate Configuration ---
  if (!fs.existsSync(configPath)) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "config_validation",
      error: `Missing configuration file: "${configPath}" does not exist.`,
      testsPassed: 0,
      testsTotal: 0,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  let patchConfig;
  try {
    const rawContent = fs.readFileSync(configPath, "utf-8");
    patchConfig = JSON.parse(rawContent);
  } catch (err) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "config_validation",
      error: `Malformed JSON in patch_config.json: ${err.message}`,
      testsPassed: 0,
      testsTotal: 0,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  // Validate required configuration fields
  if (typeof patchConfig !== "object" || patchConfig === null) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "config_validation",
      error: "patch_config.json must contain a JSON object.",
      testsPassed: 0,
      testsTotal: 0,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  const { targetFile, entryPoint, patchType } = patchConfig;

  if (!targetFile || typeof targetFile !== "string" || !targetFile.trim()) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "config_validation",
      error: "Invalid patch configuration: 'targetFile' must be a non-empty string.",
      testsPassed: 0,
      testsTotal: 0,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  if (!entryPoint || typeof entryPoint !== "string" || !entryPoint.trim()) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "config_validation",
      error: "Invalid patch configuration: 'entryPoint' must be a non-empty string (e.g., 'applyCalibration', 'sanitizeReading').",
      testsPassed: 0,
      testsTotal: 0,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  const testCases = patchConfig.testCases || patchConfig.testInputs;
  if (!Array.isArray(testCases) || testCases.length === 0) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "config_validation",
      error: "Empty test suite: at least one test case is required in 'testCases' (or 'testInputs').",
      testsPassed: 0,
      testsTotal: 0,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  // --- 2. Verify Patched File on Disk & Load Module ---
  const targetFilePath = path.resolve(process.cwd(), targetFile);

  // If file doesn't exist on disk but codeAfter is provided in config, write it
  if (!fs.existsSync(targetFilePath) && patchConfig.codeAfter) {
    try {
      fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
      fs.writeFileSync(targetFilePath, patchConfig.codeAfter, "utf-8");
    } catch (writeErr) {
      emitReportAndExit({
        status: "FAIL",
        failureStage: "patch_application",
        error: `Failed to write candidate patch to ${targetFilePath}: ${writeErr.message}`,
        testsPassed: 0,
        testsTotal: testCases.length,
        testResults: [],
        executionTimeMs: Date.now() - startTime,
        exitCode: 1,
      }, 1);
    }
  }

  if (!fs.existsSync(targetFilePath)) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "patch_application",
      error: `Target file "${targetFilePath}" not found on disk.`,
      testsPassed: 0,
      testsTotal: testCases.length,
      testResults: [],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  // Load module using Node's CommonJS loader
  let candidateModule;
  try {
    candidateModule = require(targetFilePath);
  } catch (syntaxErr) {
    emitReportAndExit({
      status: "FAIL",
      failureStage: "module_loading",
      error: `Syntax or compilation error in "${targetFile}": ${syntaxErr.message}`,
      testsPassed: 0,
      testsTotal: testCases.length + 1,
      testResults: [
        {
          name: "module_syntax_and_compilation",
          status: "FAIL",
          expectedOutcome: "Module loads without syntax or compilation error",
          actualOutcome: `Compilation error: ${syntaxErr.message}`,
          error: syntaxErr.message,
          durationMs: Date.now() - startTime,
        },
      ],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  // --- 3. Resolve Declared Entry Point (NO FALLBACK FUNCTION) ---
  let targetFn = null;
  if (typeof candidateModule === "function") {
    targetFn = candidateModule;
  } else if (candidateModule && typeof candidateModule[entryPoint] === "function") {
    targetFn = candidateModule[entryPoint];
  }

  if (!targetFn) {
    const availableExports = candidateModule ? Object.keys(candidateModule) : [];
    emitReportAndExit({
      status: "FAIL",
      failureStage: "entry_point_resolution",
      error: `Missing expected entry point "${entryPoint}" in "${targetFile}". Available exports: [${availableExports.join(", ")}].`,
      testsPassed: 0,
      testsTotal: testCases.length + 1,
      testResults: [
        {
          name: "entry_point_resolution",
          status: "FAIL",
          expectedOutcome: `Function "${entryPoint}" exported by "${targetFile}"`,
          actualOutcome: `Entry point missing. Exports: [${availableExports.join(", ")}]`,
          error: `Missing function "${entryPoint}"`,
          durationMs: Date.now() - startTime,
        },
      ],
      executionTimeMs: Date.now() - startTime,
      exitCode: 1,
    }, 1);
  }

  // --- 4. Execute Test Cases Against Declared Contracts ---
  let testsPassed = 0;
  const testResults = [];
  let allNumericValid = true;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const testName = tc.name || tc.test || `case_${i}_${tc.entityId || "sensor"}`;
    const tcStart = Date.now();

    let actualOutcome = undefined;
    let threwError = false;
    let caughtError = null;

    try {
      // Build call arguments according to input format
      let args = [];
      if (Array.isArray(tc.args)) {
        args = tc.args;
      } else if (tc.input && typeof tc.input === "object") {
        if (entryPoint === "applyCalibration") {
          args = [
            tc.input.entityId || tc.entityId,
            tc.input.rawValue ?? tc.input.value,
            tc.input.peerClusterMean ?? null,
            tc.input.options || { returnObject: true },
          ];
        } else if (entryPoint === "sanitizeReading") {
          args = [
            tc.input.entityId || tc.entityId,
            tc.input.currentVal ?? tc.input.value,
            tc.input.prevVal ?? tc.input.prev ?? null,
            tc.input.options || { returnObject: true },
          ];
        } else if (entryPoint === "filterDrift") {
          args = [
            tc.input.entityId || tc.entityId,
            tc.input.val ?? tc.input.value,
            tc.input.rollingMean,
            tc.input.rollingStd,
            tc.input.options || { returnObject: true },
          ];
        } else {
          args = [tc.input.entityId || tc.entityId, tc.input.value, tc.input.prev, tc.input.options];
        }
      } else {
        // Direct fields on test case
        if (entryPoint === "applyCalibration") {
          args = [
            tc.entityId,
            tc.rawValue ?? tc.value,
            tc.peerClusterMean !== undefined ? tc.peerClusterMean : (tc.prev !== undefined ? tc.prev : null),
            tc.options || { returnObject: true },
          ];
        } else if (entryPoint === "sanitizeReading") {
          args = [
            tc.entityId,
            tc.value ?? tc.currentVal,
            tc.prev !== undefined ? tc.prev : (tc.prevVal !== undefined ? tc.prevVal : null),
            tc.options || { returnObject: true },
          ];
        } else if (entryPoint === "filterDrift") {
          args = [
            tc.entityId,
            tc.value ?? tc.val,
            tc.rollingMean,
            tc.rollingStd,
            tc.options || { returnObject: true },
          ];
        } else {
          args = [tc.entityId, tc.value, tc.prev, tc.options];
        }
      }

      // Enforce per-test timeout
      const testTimeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Test "${testName}" timed out after ${PER_TEST_TIMEOUT_MS}ms`));
        }, PER_TEST_TIMEOUT_MS);
        if (typeof timer.unref === "function") timer.unref();
      });

      const execPromise = Promise.resolve().then(() => targetFn(...args));
      actualOutcome = await Promise.race([execPromise, testTimeoutPromise]);
    } catch (err) {
      threwError = true;
      caughtError = err;
    }

    const durationMs = Date.now() - tcStart;

    // --- Assertions ---
    let testSuccess = true;
    let failureDetail = null;

    // 1. Exception handling assertion
    if (tc.shouldThrow) {
      if (!threwError) {
        testSuccess = false;
        failureDetail = "Expected function to throw an exception, but it executed without error.";
      }
    } else if (threwError) {
      testSuccess = false;
      failureDetail = `Unexpected exception thrown: ${caughtError.message}`;
    }

    // 2. Output and numeric validity assertion
    if (testSuccess && !tc.shouldThrow) {
      const extractedNumeric =
        typeof actualOutcome === "number"
          ? actualOutcome
          : typeof actualOutcome === "object" && actualOutcome !== null
          ? actualOutcome.calibratedValue ?? actualOutcome.value
          : undefined;

      if (extractedNumeric !== undefined) {
        if (!isNumeric(extractedNumeric)) {
          allNumericValid = false;
          testSuccess = false;
          failureDetail = `Output numeric value is non-finite or NaN: ${extractedNumeric}`;
        }
      }

      // 3. Expected Value assertion
      const expectedVal = tc.expectedValue !== undefined ? tc.expectedValue : tc.expectedOutput;
      if (testSuccess && expectedVal !== undefined) {
        const tolerance = tc.tolerance || 1e-4;
        if (typeof expectedVal === "number" && typeof extractedNumeric === "number") {
          if (Math.abs(extractedNumeric - expectedVal) > tolerance) {
            testSuccess = false;
            failureDetail = `Expected output ${expectedVal}, but got ${extractedNumeric} (diff: ${Math.abs(extractedNumeric - expectedVal)} > tolerance ${tolerance})`;
          }
        } else if (actualOutcome !== expectedVal && extractedNumeric !== expectedVal) {
          testSuccess = false;
          failureDetail = `Expected output ${JSON.stringify(expectedVal)}, but got ${JSON.stringify(actualOutcome)}`;
        }
      }

      // 4. Expected Anomaly / Correction Contract assertion
      if (testSuccess && typeof actualOutcome === "object" && actualOutcome !== null) {
        if (tc.expectedAnomaly !== undefined) {
          const actualAnomaly = Boolean(actualOutcome.anomalyDetected || actualOutcome.clamped || actualOutcome.bounded);
          if (actualAnomaly !== Boolean(tc.expectedAnomaly)) {
            testSuccess = false;
            failureDetail = `Expected anomaly detection to be ${tc.expectedAnomaly}, but got ${actualAnomaly}`;
          }
        }

        if (testSuccess && tc.expectedAction && actualOutcome.action) {
          if (actualOutcome.action !== tc.expectedAction) {
            testSuccess = false;
            failureDetail = `Expected action "${tc.expectedAction}", but got "${actualOutcome.action}"`;
          }
        }

        if (testSuccess && tc.expectedStatus && actualOutcome.status) {
          if (actualOutcome.status !== tc.expectedStatus) {
            testSuccess = false;
            failureDetail = `Expected status "${tc.expectedStatus}", but got "${actualOutcome.status}"`;
          }
        }
      }

      // 5. Raw Value Preservation verification for calibration repairs
      if (testSuccess && entryPoint === "applyCalibration" && tc.expectedAnomaly === true) {
        const rawIn = tc.rawValue ?? tc.value;
        const rawOut = actualOutcome && typeof actualOutcome === "object" ? actualOutcome.rawValue : undefined;
        if (rawOut !== undefined && rawIn !== undefined && rawOut !== rawIn) {
          testSuccess = false;
          failureDetail = `Raw reading was mutated (expected raw ${rawIn}, got ${rawOut}). Raw readings must be preserved!`;
        }
      }
    }

    if (testSuccess) {
      testsPassed++;
      testResults.push({
        name: testName,
        status: "PASS",
        expectedOutcome: tc.expectedValue ?? tc.expectedAction ?? tc.expectedStatus ?? "Valid execution",
        actualOutcome:
          typeof actualOutcome === "object" && actualOutcome !== null
            ? actualOutcome.calibratedValue ?? actualOutcome.value ?? actualOutcome.status
            : actualOutcome,
        outputValue:
          typeof actualOutcome === "object" && actualOutcome !== null
            ? actualOutcome.calibratedValue ?? actualOutcome.value
            : typeof actualOutcome === "number"
            ? actualOutcome
            : undefined,
        inputValue: tc.value ?? tc.rawValue,
        error: null,
        durationMs,
      });
    } else {
      testResults.push({
        name: testName,
        status: "FAIL",
        expectedOutcome: tc.expectedValue ?? tc.expectedAction ?? tc.expectedStatus ?? "Valid execution",
        actualOutcome:
          threwError
            ? `Exception: ${caughtError.message}`
            : typeof actualOutcome === "object" && actualOutcome !== null
            ? actualOutcome.calibratedValue ?? actualOutcome.value ?? actualOutcome.status
            : actualOutcome,
        inputValue: tc.value ?? tc.rawValue,
        error: failureDetail,
        durationMs,
      });
    }
  }

  // --- 5. Determine Overall Status & Emit Report ---
  const testsTotal = testCases.length;
  const passedAll = testsPassed === testsTotal && testsTotal > 0 && allNumericValid;
  const overallStatus = passedAll ? "PASS" : "FAIL";
  const exitCode = passedAll ? 0 : 1;

  const report = {
    status: overallStatus,
    targetFile,
    entryPoint,
    patchType,
    testsPassed,
    testsTotal,
    allNumericValid,
    testResults,
    executionTimeMs: Date.now() - startTime,
    exitCode,
  };

  emitReportAndExit(report, exitCode);
}

runSandboxVerification();
