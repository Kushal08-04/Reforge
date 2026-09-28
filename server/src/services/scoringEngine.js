/**
 * scoringEngine
 * ----------------
 * Combines rule evidence into a single confidence/risk score (Section 7)
 * and maps it to a Valid / Suspicious / Invalid classification.
 *
 * semanticRisk = weighted sum of triggered-rule severities.
 * Weights sum to 1.0 so the resulting score is naturally bounded to [0, 1].
 */

const RULE_WEIGHTS = {
  rateOfChangeRule: 0.2,
  historicalZScoreRule: 0.3,
  crossSensorRule: 0.25,
  implausibleJumpRule: 0.25,
};

function getThresholds() {
  return {
    suspicious: parseFloat(process.env.RISK_THRESHOLD_SUSPICIOUS ?? "0.3"),
    invalid: parseFloat(process.env.RISK_THRESHOLD_INVALID ?? "0.6"),
  };
}

/**
 * @param {Array<Object>} evidence - output of ruleEngine.evaluateRules()
 * @returns {{ score: number, classification: string }}
 */
function scoreAndClassify(evidence) {
  let weightedSum = 0;

  for (const item of evidence) {
    const weight = RULE_WEIGHTS[item.source] ?? 0;
    if (item.triggered) {
      weightedSum += weight * item.severity;
    }
  }

  const score = Math.max(0, Math.min(1, weightedSum));
  const { suspicious, invalid } = getThresholds();

  let classification;
  if (score >= invalid) {
    classification = "invalid";
  } else if (score >= suspicious) {
    classification = "suspicious";
  } else {
    classification = "valid";
  }

  return { score, classification };
}

module.exports = { scoreAndClassify, RULE_WEIGHTS, getThresholds };
