/**
 * hybridDecisionEngine.js
 * ----------------
 * Implements REFORGE's calibrated hybrid decision layer combining
 * deterministic rule engine evidence with ML anomaly detection scores.
 *
 * Supports three operational modes:
 *   1. "rule_only": Pure rule-based engine (backward-compatible).
 *   2. "shadow": ML runs in background and is persisted for evaluation,
 *                but the rule engine remains the sole official authority.
 *   3. "hybrid": Calibrated multi-factor decision policy.
 *
 * Policy Specification (v1.0.0-hybrid):
 *   - Schema invalid -> always "invalid"
 *   - Rule Normal + ML Normal -> "valid"
 *   - Rule Anomaly + ML Anomaly -> "invalid" (high-confidence anomaly)
 *   - Rule Anomaly + ML Normal -> "suspicious" (rule triggered physical/historical guard; ML did not see multidimensional shift)
 *   - Rule Normal + ML Anomaly -> "suspicious" (ML identified subtle multivariate outlier not caught by single-dimension thresholds)
 *   - ML Fallback / Unavailable -> rule-based authoritative result with fallback flag
 */

const DECISION_POLICY_VERSION = "v1.2.0-hybrid";

function determineComparisonCategory(isRuleAnomaly, isMlAnomaly) {
  if (!isRuleAnomaly && !isMlAnomaly) return "rule_normal_ml_normal";
  if (isRuleAnomaly && isMlAnomaly) return "rule_anomaly_ml_anomaly";
  if (isRuleAnomaly && !isMlAnomaly) return "rule_anomaly_ml_normal";
  return "rule_normal_ml_anomaly";
}

/**
 * Evaluates the hybrid decision based on rule and ML outputs.
 *
 * @param {Object} params
 * @param {boolean} params.schemaValid
 * @param {string} params.ruleClassification - "valid", "suspicious", "invalid"
 * @param {number} params.ruleRiskScore - 0.0 to 1.0
 * @param {Object} params.mlResult - output from mlClient.predictAnomaly
 * @param {string} [params.mode] - "rule_only", "shadow", "hybrid" (defaults to env or "shadow")
 * @returns {Object} { officialClassification, hybridClassification, comparisonCategory, decisionMode, disagreementReason }
 */
function evaluateHybridDecision({
  schemaValid,
  ruleClassification,
  ruleRiskScore,
  mlResult,
  mode,
}) {
  const currentMode = mode || process.env.VALIDATION_MODE || "shadow";

  // 1. Structural invalidity always takes precedence
  if (!schemaValid) {
    return {
      officialClassification: "invalid",
      hybridClassification: "invalid",
      comparisonCategory: "not_applicable",
      decisionMode: currentMode,
      disagreementReason: "Structurally invalid payload; semantic rules and ML bypassed.",
      policyVersion: DECISION_POLICY_VERSION,
    };
  }

  const isRuleAnomaly = ruleClassification === "suspicious" || ruleClassification === "invalid";
  const isMlAnomaly = Boolean(mlResult?.isAnomaly);
  const mlAvailable = mlResult?.status === "success";

  const comparisonCategory = mlAvailable
    ? determineComparisonCategory(isRuleAnomaly, isMlAnomaly)
    : "not_applicable";

  let hybridClassification = "valid";
  let disagreementReason = "";

  if (!mlAvailable) {
    // Graceful fallback to rule classification when ML is down or degraded
    hybridClassification = ruleClassification;
    disagreementReason = `ML service unavailable (${mlResult?.error || "status: " + mlResult?.status}); defaulted safely to rule engine.`;
  } else {
    switch (comparisonCategory) {
      case "rule_normal_ml_normal":
        hybridClassification = "valid";
        disagreementReason = "Rule engine and ML agree: observation is within normal operational bounds.";
        break;

      case "rule_anomaly_ml_anomaly":
        // High confidence consensus
        hybridClassification = ruleClassification === "invalid" ? "invalid" : "invalid";
        disagreementReason = `Consensus anomaly: Rule engine scored risk ${ruleRiskScore.toFixed(2)} (${ruleClassification}) and ML anomaly score was ${mlResult.anomalyScore.toFixed(2)}.`;
        break;

      case "rule_anomaly_ml_normal":
        // Rule flagged, ML passed
        hybridClassification = "suspicious";
        disagreementReason = `Disagreement: Rule engine flagged anomaly (${ruleClassification}, risk ${ruleRiskScore.toFixed(2)}) based on explicit domain constraints, but ML model considered the multi-feature vector normal (score ${mlResult.anomalyScore.toFixed(2)}). Escalated for human review.`;
        break;

      case "rule_normal_ml_anomaly": {
        // ML flagged, Rule passed
        const mlScore = typeof mlResult?.anomalyScore === "number" ? mlResult.anomalyScore : 0;
        const ruleRisk = typeof ruleRiskScore === "number" ? ruleRiskScore : 0;
        // Require either very high ML confidence (>=0.80) or corroborating rule risk evidence (>=0.20 with score >= 0.60)
        // so that noisy/borderline ML predictions do not degrade the rule-based baseline.
        const isHighConfidenceMl = mlScore >= 0.80;
        const hasCorroboratingRisk = ruleRisk >= 0.20 && mlScore >= 0.60;

        if (isHighConfidenceMl || hasCorroboratingRisk) {
          hybridClassification = "suspicious";
          disagreementReason = `Disagreement: ML model detected multidimensional outlier with ${
            isHighConfidenceMl ? `high confidence (score ${mlScore.toFixed(2)})` : `corroborating rule risk (${ruleRisk.toFixed(2)}, ML score ${mlScore.toFixed(2)})`
          }, while static rule thresholds were not breached. Escalated for human review.`;
        } else {
          hybridClassification = "valid";
          disagreementReason = `Disagreement: ML model flagged borderline outlier (score ${mlScore.toFixed(2)}), but rule engine scored negligible risk (${ruleRisk.toFixed(2)}). Preserved rule-based baseline to prevent false alarms.`;
        }
        break;
      }

      default:
        hybridClassification = ruleClassification;
        break;
    }
  }

  // 2. Select official classification based on configured mode
  let officialClassification;
  if (currentMode === "rule_only") {
    officialClassification = ruleClassification;
  } else if (currentMode === "shadow") {
    // In shadow mode, ML predictions and hybrid metrics are logged and visible,
    // but the rule engine remains the official authority.
    officialClassification = ruleClassification;
  } else if (currentMode === "hybrid") {
    officialClassification = hybridClassification;
  } else {
    officialClassification = ruleClassification;
  }

  return {
    officialClassification,
    hybridClassification,
    comparisonCategory,
    decisionMode: currentMode,
    disagreementReason,
    policyVersion: DECISION_POLICY_VERSION,
  };
}

module.exports = {
  evaluateHybridDecision,
  determineComparisonCategory,
  DECISION_POLICY_VERSION,
};
