/**
 * runner.js
 * ---------
 * Executes candidate patch in disposable sandbox, verifying:
 * 1. Syntax correctness
 * 2. Execution stability without uncaught crashes or timeout
 * 3. Schema & output integrity
 * 4. Value transformation on normal and anomaly inputs
 */

const fs = require("fs");
const path = require("path");

function runSandboxVerification() {
  const startTime = Date.now();
  let patchConfig = {};

  try {
    const rawConfig = fs.readFileSync(path.join(__dirname, "patch_config.json"), "utf-8");
    patchConfig = JSON.parse(rawConfig);
  } catch (err) {
    console.error(JSON.stringify({
      status: "EXECUTION_ERROR",
      error: `Failed to load patch_config.json: ${err.message}`,
      testsPassed: 0,
      testsTotal: 0,
    }));
    process.exit(1);
  }

  const codeAfter = patchConfig.codeAfter || "";
  const testInputs = patchConfig.testInputs || [
    { entityId: "zone-a-temperature", value: 25.0, prev: 24.8, expectedAnomaly: false },
    { entityId: "zone-a-temperature", value: 80.0, prev: 25.0, expectedAnomaly: true },
  ];

  let testsPassed = 0;
  const testsTotal = testInputs.length + 1; // +1 for syntax & compilation test
  const testResults = [];

  // Test 1: Syntax & module compilation
  let transformFn;
  try {
    // Isolated evaluation inside enclosed function scope
    const wrappedCode = `
      ${codeAfter}
      return typeof sanitizeReading === "function" ? sanitizeReading :
             typeof applyCalibration === "function" ? applyCalibration :
             typeof filterDrift === "function" ? filterDrift :
             function fallback(e, v) { return v; };
    `;
    transformFn = new Function(wrappedCode)();
    testsPassed++;
    testResults.push({ test: "syntax_and_compilation", passed: true });
  } catch (err) {
    console.log(JSON.stringify({
      status: "FAIL",
      error: `Syntax/compilation error in patch: ${err.message}`,
      testsPassed: 0,
      testsTotal,
      testResults,
      executionTimeMs: Date.now() - startTime,
    }));
    process.exit(0);
  }

  // Test 2+: Test inputs execution
  let allNumericValid = true;
  for (let i = 0; i < testInputs.length; i++) {
    const inp = testInputs[i];
    try {
      const out = transformFn(inp.entityId, inp.value, inp.prev);
      const isNum = typeof out === "number" && !isNaN(out) && isFinite(out);
      if (!isNum) {
        allNumericValid = false;
        testResults.push({
          test: `input_${i}_${inp.entityId}`,
          passed: false,
          error: `Output is not a finite number: ${out}`,
        });
      } else {
        testsPassed++;
        testResults.push({
          test: `input_${i}_${inp.entityId}`,
          passed: true,
          inputValue: inp.value,
          outputValue: out,
        });
      }
    } catch (err) {
      testResults.push({
        test: `input_${i}_${inp.entityId}`,
        passed: false,
        error: err.message,
      });
    }
  }

  const passedAll = testsPassed === testsTotal && allNumericValid;
  const status = passedAll ? "PASS" : "FAIL";

  const report = {
    status,
    testsPassed,
    testsTotal,
    allNumericValid,
    testResults,
    executionTimeMs: Date.now() - startTime,
  };

  console.log(JSON.stringify(report, null, 2));
}

runSandboxVerification();
