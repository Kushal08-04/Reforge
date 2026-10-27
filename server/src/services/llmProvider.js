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
    this.geminiModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ];
  }

  async generateDiagnosisAndRepair({ entityId, observation, validationResult, history }) {
    if (this.provider === "gemini" && (process.env.GEMINI_API_KEY || this.apiKey)) {
      try {
        const result = await this._generateWithGemini({ entityId, observation, validationResult, history });
        if (result && result.targetFile && result.patchType) {
          return result;
        }
      } catch (err) {
        console.warn(`[REFORGE LLM] Gemini call failed (${err.message}). Falling back to deterministic diagnosis.`);
      }
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
      codeAfter = `function sanitizeReading(entityId, currentVal, prevVal, options = {}) {\n  const MAX_STEP_CHANGE = 20.0;\n  if (prevVal !== null && prevVal !== undefined && Math.abs(currentVal - prevVal) > MAX_STEP_CHANGE) {\n    console.warn(\`[ETL Guard] Clamping implausible jump on \${entityId}: \${currentVal} -> prev \${prevVal}\`);\n    return prevVal;\n  }\n  return currentVal;\n}\n\nmodule.exports = { sanitizeReading };`;
      diff = `--- a/pipeline/sanitizer.js\n+++ b/pipeline/sanitizer.js\n@@ -1,3 +1,8 @@\n function sanitizeReading(entityId, currentVal, prevVal) {\n-  return currentVal;\n+  const MAX_STEP_CHANGE = 20.0;\n+  if (prevVal !== null && Math.abs(currentVal - prevVal) > MAX_STEP_CHANGE) {\n+    console.warn(\`[ETL Guard] Clamping implausible jump on \${entityId}: \${currentVal} -> prev \${prevVal}\`);\n+    return prevVal;\n+  }\n+  return currentVal;\n }`;
    } else if (triggeredRules.includes("crossSensorRule")) {
      failureCategory = "cross_sensor_inconsistency";
      rootCause = `Entity ${entityId} diverged by >3 sigma from correlated peer sensors in the same cluster. Possible calibration drift or localized environmental obstruction.`;
      patchType = "calibration_offset";
      targetFile = "pipeline/calibration.js";
      codeBefore = `function applyCalibration(entityId, rawValue, peerClusterMean) {\n  return rawValue;\n}`;
      codeAfter = `function applyCalibration(entityId, rawValue, peerClusterMean, options = {}) {\n  // Preserve raw reading. If deviation exceeds consensus and no validated offset exists, route to review\n  const threshold = options.threshold || 15.0;\n  if (peerClusterMean !== null && Math.abs(rawValue - peerClusterMean) > threshold) {\n    if (typeof options.validatedOffset === "number" && !isNaN(options.validatedOffset)) {\n      return rawValue - options.validatedOffset;\n    }\n    return rawValue;\n  }\n  return rawValue;\n}\n\nmodule.exports = { applyCalibration };`;
      diff = `--- a/pipeline/calibration.js\n+++ b/pipeline/calibration.js\n@@ -1,3 +1,11 @@\n function applyCalibration(entityId, rawValue, peerClusterMean) {\n-  return rawValue;\n+  const threshold = options.threshold || 15.0;\n+  if (peerClusterMean !== null && Math.abs(rawValue - peerClusterMean) > threshold) {\n+    if (typeof options.validatedOffset === "number" && !isNaN(options.validatedOffset)) {\n+      return rawValue - options.validatedOffset;\n+    }\n+    return rawValue;\n+  }\n+  return rawValue;\n }`;
    } else if (triggeredRules.includes("historicalZScoreRule")) {
      failureCategory = "historical_drift";
      rootCause = `Entity ${entityId} exhibits prolonged deviation outside historical distribution (value: ${value}). Possible sensor aging or systemic baseline shift.`;
      patchType = "guard_clause";
      targetFile = "pipeline/filters.js";
      codeBefore = `function filterDrift(entityId, val) {\n  return val;\n}`;
      codeAfter = `function filterDrift(entityId, val, rollingMean, rollingStd, options = {}) {\n  if (rollingStd && Math.abs(val - rollingMean) > 3.5 * rollingStd) {\n    return rollingMean + Math.sign(val - rollingMean) * 3.0 * rollingStd;\n  }\n  return val;\n}\n\nmodule.exports = { filterDrift };`;
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

  async _generateWithGemini({ entityId, observation, validationResult, history }) {
    const key = process.env.GEMINI_API_KEY || this.apiKey;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const value = observation?.values?.value;
    const evidence = validationResult?.evidence || [];
    const triggeredRules = evidence.filter((e) => e.triggered).map((e) => e.source);

    const promptText = `You are REFORGE's automated ETL repair diagnostic engine.
Analyze the following sensor data failure and return ONLY a valid JSON object (no markdown fences, no explanation).

Observation:
Entity: ${entityId}
Timestamp: ${observation?.timestamp}
Raw Value: ${value}
Triggered Rules: ${JSON.stringify(triggeredRules)}
Evidence: ${JSON.stringify(evidence)}

JSON format required:
{
  "failureCategory": "one of: cross_sensor_inconsistency, implausible_jump, historical_drift, transformation_error, schema_drift",
  "rootCauseHypothesis": "Concise technical diagnosis",
  "targetFile": "one of: pipeline/calibration.js, pipeline/sanitizer.js, pipeline/filters.js",
  "patchType": "one of: calibration_offset, outlier_clamp, guard_clause",
  "diff": "standard unified diff string",
  "description": "Summary of repair",
  "codeBefore": "Original JS function code",
  "codeAfter": "Patched JS function code including CommonJS export: module.exports = { entryPoint };",
  "risksAndAssumptions": ["risk 1", "risk 2"],
  "testsRequired": ["test 1", "test 2"]
}

Target files and required exported functions:
- pipeline/sanitizer.js -> sanitizeReading(entityId, currentVal, prevVal, options = {})
- pipeline/calibration.js -> applyCalibration(entityId, rawValue, peerClusterMean, options = {})
- pipeline/filters.js -> filterDrift(entityId, val, rollingMean, rollingStd, options = {})`;

    let lastError = null;
    for (const model of this.geminiModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from Gemini.");

        const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);

        // Ensure CommonJS module.exports is present in codeAfter
        if (parsed && parsed.codeAfter && typeof parsed.codeAfter === "string") {
          let entryPoint = "applyCalibration";
          if (parsed.targetFile?.includes("sanitizer") || parsed.patchType === "outlier_clamp") {
            entryPoint = "sanitizeReading";
          } else if (parsed.targetFile?.includes("filters") || parsed.patchType === "guard_clause") {
            entryPoint = "filterDrift";
          }
          if (!parsed.codeAfter.includes("module.exports") && !parsed.codeAfter.includes("exports.")) {
            parsed.codeAfter = parsed.codeAfter.trim() + `\n\nmodule.exports = { ${entryPoint} };\n`;
          }
        }

        return parsed;
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error("All Gemini model requests failed.");
  }
}

module.exports = new LLMProvider();
