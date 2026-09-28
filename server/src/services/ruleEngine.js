/**
 * ruleEngine
 * ----------------
 * Deterministic, explainable semantic rules (Section 6-7 of the handoff doc).
 * Each rule inspects the feature snapshot built by featureBuilder.js and
 * returns a structured evidence entry: whether it triggered, how severe
 * (0-1), and a human-readable reason. This is what makes REFORGE's
 * decisions explainable rather than a mysterious model score.
 *
 * Thresholds below are intentionally simple, hand-tuned constants for the
 * MVP - Section 7 of the handoff doc explicitly notes exact weights/
 * thresholds are not locked and should be tuned experimentally.
 */

const Z_SCORE_THRESHOLD = 3; // historical deviation considered anomalous past this
const CROSS_SENSOR_THRESHOLD = 3; // stddevs away from peer group considered anomalous
const RATE_OF_CHANGE_STD_MULTIPLIER = 4; // "sudden change" relative to normal volatility
const IMPLAUSIBLE_JUMP_STD_MULTIPLIER = 8; // "physically implausible" tier, much stricter
const IMPLAUSIBLE_JUMP_ABS_FALLBACK = 40; // used only if rollingStd is unavailable/zero

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/** Rule 1: Rate-of-change - did the value move too fast relative to its own normal volatility? */
function rateOfChangeRule(value, features) {
  const { rateOfChange, rollingStd } = features;
  if (rateOfChange === null || !rollingStd || rollingStd <= 0) {
    return {
      source: "rateOfChangeRule",
      triggered: false,
      severity: 0,
      message: "Insufficient history to assess rate of change.",
      details: { rateOfChange, rollingStd },
    };
  }

  const ratio = Math.abs(rateOfChange) / rollingStd;
  const triggered = ratio > RATE_OF_CHANGE_STD_MULTIPLIER;
  const severity = triggered
    ? clamp01((ratio - RATE_OF_CHANGE_STD_MULTIPLIER) / RATE_OF_CHANGE_STD_MULTIPLIER + 0.4)
    : 0;

  return {
    source: "rateOfChangeRule",
    triggered,
    severity,
    message: triggered
      ? `Value changed by ${rateOfChange.toFixed(2)} since the previous reading, ${ratio.toFixed(
          1
        )}x the entity's normal volatility.`
      : "Rate of change is within normal volatility.",
    details: { rateOfChange, rollingStd, ratio },
  };
}

/** Rule 2: Historical z-score - is this value an outlier vs. this entity's own recent distribution? */
function historicalZScoreRule(value, features) {
  const { historicalZScore, rollingMean, rollingStd, historyWindowSize } = features;
  if (historicalZScore === null) {
    return {
      source: "historicalZScoreRule",
      triggered: false,
      severity: 0,
      message: "Insufficient history to compute a z-score.",
      details: { rollingMean, rollingStd, historyWindowSize },
    };
  }

  const absZ = Math.abs(historicalZScore);
  const triggered = absZ > Z_SCORE_THRESHOLD;
  const severity = triggered
    ? clamp01((absZ - Z_SCORE_THRESHOLD) / Z_SCORE_THRESHOLD + 0.3)
    : 0;

  return {
    source: "historicalZScoreRule",
    triggered,
    severity,
    message: triggered
      ? `Value is ${absZ.toFixed(2)} standard deviations from this entity's recent average (${rollingMean.toFixed(
          2
        )}).`
      : "Value is consistent with this entity's recent historical distribution.",
    details: { historicalZScore, rollingMean, rollingStd },
  };
}

/** Rule 3: Cross-sensor disagreement - does this value disagree with correlated peer entities? */
function crossSensorRule(value, features) {
  const { crossSensorDeviation, crossSensorMean, peerGroupSize } = features;
  if (crossSensorDeviation === null || peerGroupSize < 2) {
    return {
      source: "crossSensorRule",
      triggered: false,
      severity: 0,
      message: "Insufficient peer readings for cross-sensor comparison.",
      details: { peerGroupSize },
    };
  }

  const absDev = Math.abs(crossSensorDeviation);
  const triggered = absDev > CROSS_SENSOR_THRESHOLD;
  const severity = triggered
    ? clamp01((absDev - CROSS_SENSOR_THRESHOLD) / CROSS_SENSOR_THRESHOLD + 0.3)
    : 0;

  return {
    source: "crossSensorRule",
    triggered,
    severity,
    message: triggered
      ? `Value disagrees with ${peerGroupSize} correlated sensor(s) averaging ${crossSensorMean.toFixed(
          2
        )} in the same time window.`
      : "Value is consistent with correlated peer sensors.",
    details: { crossSensorDeviation, crossSensorMean, peerGroupSize },
  };
}

/** Rule 4: Implausible jump - a much stricter tier catching physically-impossible step changes. */
function implausibleJumpRule(value, features) {
  const { rateOfChange, rollingStd, minutesSincePrevious } = features;
  if (rateOfChange === null) {
    return {
      source: "implausibleJumpRule",
      triggered: false,
      severity: 0,
      message: "No previous reading to compare against.",
      details: { rateOfChange },
    };
  }

  const threshold =
    rollingStd && rollingStd > 0
      ? rollingStd * IMPLAUSIBLE_JUMP_STD_MULTIPLIER
      : IMPLAUSIBLE_JUMP_ABS_FALLBACK;

  const triggered = Math.abs(rateOfChange) > threshold;
  const severity = triggered ? clamp01(0.7 + Math.abs(rateOfChange) / (threshold * 4)) : 0;

  return {
    source: "implausibleJumpRule",
    triggered,
    severity,
    message: triggered
      ? `Implausible jump of ${rateOfChange.toFixed(2)} in ${
          minutesSincePrevious !== null ? minutesSincePrevious.toFixed(0) : "?"
        } minute(s) - exceeds physically plausible change for this entity.`
      : "No implausible jump detected.",
    details: { rateOfChange, threshold, minutesSincePrevious },
  };
}

/**
 * Runs all rules against a value + feature snapshot.
 * @returns {Array<Object>} evidence array, ready to store on ValidationResult.evidence
 */
function evaluateRules(value, features) {
  return [
    rateOfChangeRule(value, features),
    historicalZScoreRule(value, features),
    crossSensorRule(value, features),
    implausibleJumpRule(value, features),
  ];
}

module.exports = {
  evaluateRules,
  rateOfChangeRule,
  historicalZScoreRule,
  crossSensorRule,
  implausibleJumpRule,
};
