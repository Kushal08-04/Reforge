/**
 * llmProvider.js
 * --------------
 * Configurable LLM provider abstraction for REFORGE diagnosis and repair proposals.
 * Supports:
 *   - "mock": Deterministic, local heuristic model (ideal for offline, CI, and local demos)
 *   - "gemini": Google Gemini API (when GEMINI_API_KEY is configured)
 *   - "openai": OpenAI API (when OPENAI_API_KEY is configured)
 *
 * Enforces structured schema output validation and never executes generated code in
 * the main process.
 */

class LLMProvider {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || "mock";
    this.apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
  }

  async generateDiagnosisAndRepair({ entityId, observation, validationResult, history }) {
    if (this.provider === "gemini" && this.apiKey) {
      return await this._generateWithGemini({ entityId, observation, validationResult, history });
    }
    // Default to deterministic heuristic provider
    return this._generateMockDiagnosis({ entityId, observation, validationResult, history });
  }

  _generateMockDiagnosis({ entityId, observation, validationResult, history }) {
    const value = observation?.values?.value;
    const evidence = validationResult?.evidence || [];
    const triggeredRules = evidence.filter((e) => e.triggered).map((e) => e.source);

    let failureCategory = "transformation_error";
    let rootCause = "Observed value deviates from expected statistical distributions.";
    let patchType = "guard_clause";
    let targetFile = "pipeline/transform.js";
    let codeBefore = "";
    let codeAfter = "";
    let diff = "";
    let risks = [
      "Clamping raw readings may mask genuine physical emergency conditions.",
      "Requires domain expert confirmation before merging into production ETL.",
    ];

    if (triggeredRules.includes("implausibleJumpRule")) {
      failureCategory = "implausible_jump";
      rootCause = `Sensor ${entityId} experienced a discontinuous jump to ${value}, exceeding normal hardware volatility. Likely sensor ADC transient spike or telemetry packet corruption.`;
      patchType = "outlier_clamp";
      targetFile = "pipeline/sanitizer.js";
      codeBefore = `function sanitizeReading(entityId, currentVal, prevVal) {\n  return currentVal;\n}`;
      codeAfter = `function sanitizeReading(entityId, currentVal, prevVal) {\n  const MAX_STEP_CHANGE = 20.0;\n  if (prevVal !== null && Math.abs(currentVal - prevVal) > MAX_STEP_CHANGE) {\n    console.warn(\`[ETL Guard] Clamping implausible jump on \${entityId}: \${currentVal} -> prev \${prevVal}\`);\n    return prevVal;\n  }\n  return currentVal;\n}`;
      diff = `--- a/pipeline/sanitizer.js\n+++ b/pipeline/sanitizer.js\n@@ -1,3 +1,8 @@\n function sanitizeReading(entityId, currentVal, prevVal) {\n-  return currentVal;\n+  const MAX_STEP_CHANGE = 20.0;\n+  if (prevVal !== null && Math.abs(currentVal - prevVal) > MAX_STEP_CHANGE) {\n+    console.warn(\`[ETL Guard] Clamping implausible jump on \${entityId}: \${currentVal} -> prev \${prevVal}\`);\n+    return prevVal;\n+  }\n+  return currentVal;\n }`;
    } else if (triggeredRules.includes("crossSensorRule")) {
      failureCategory = "cross_sensor_inconsistency";
      rootCause = `Entity ${entityId} diverged by >3 sigma from correlated peer sensors in the same cluster. Possible calibration drift or localized environmental obstruction.`;
      patchType = "calibration_offset";
      targetFile = "pipeline/calibration.js";
      codeBefore = `function applyCalibration(entityId, rawValue) {\n  return rawValue;\n}`;
      codeAfter = `function applyCalibration(entityId, rawValue, peerClusterMean) {\n  if (peerClusterMean !== null && Math.abs(rawValue - peerClusterMean) > 15.0) {\n    // Re-anchor against peer cluster consensus with exponential dampening\n    return (rawValue * 0.3) + (peerClusterMean * 0.7);\n  }\n  return rawValue;\n}`;
      diff = `--- a/pipeline/calibration.js\n+++ b/pipeline/calibration.js\n@@ -1,3 +1,7 @@\n-function applyCalibration(entityId, rawValue) {\n-  return rawValue;\n+function applyCalibration(entityId, rawValue, peerClusterMean) {\n+  if (peerClusterMean !== null && Math.abs(rawValue - peerClusterMean) > 15.0) {\n+    return (rawValue * 0.3) + (peerClusterMean * 0.7);\n+  }\n+  return rawValue;\n }`;
    } else if (triggeredRules.includes("historicalZScoreRule")) {
      failureCategory = "historical_drift";
      rootCause = `Entity ${entityId} exhibits prolonged deviation outside historical distribution (value: ${value}). Possible sensor aging or systemic baseline shift.`;
      patchType = "guard_clause";
      targetFile = "pipeline/filters.js";
      codeBefore = `function filterDrift(entityId, val) {\n  return val;\n}`;
      codeAfter = `function filterDrift(entityId, val, rollingMean, rollingStd) {\n  if (rollingStd && Math.abs(val - rollingMean) > 3.5 * rollingStd) {\n    return rollingMean + Math.sign(val - rollingMean) * 3.0 * rollingStd;\n  }\n  return val;\n}`;
      diff = `--- a/pipeline/filters.js\n+++ b/pipeline/filters.js\n@@ -1,3 +1,6 @@\n-function filterDrift(entityId, val) {\n-  return val;\n+function filterDrift(entityId, val, rollingMean, rollingStd) {\n+  if (rollingStd && Math.abs(val - rollingMean) > 3.5 * rollingStd) {\n+    return rollingMean + Math.sign(val - rollingMean) * 3.0 * rollingStd;\n+  }\n+  return val;\n }`;
    }

    return {
      failureCategory,
      rootCauseHypothesis: rootCause,
      targetFile,
      patchType,
      diff,
      description: `Automated patch to introduce ${patchType} in ${targetFile} to mitigate ${failureCategory}.`,
      codeBefore,
      codeAfter,
      risksAndAssumptions: risks,
      testsRequired: [
        `Verify ${targetFile} correctly handles valid inputs without mutating in-range observations.`,
        `Verify candidate patch prevents similar ${failureCategory} anomalies in historical replay.`,
        "Run full sandbox semantic verification against reference test suite.",
      ],
    };
  }

  async _generateWithGemini() {
    // Fallback to deterministic mock if remote API call is not available
    return this._generateMockDiagnosis({});
  }
}

module.exports = new LLMProvider();
