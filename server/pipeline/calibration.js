/**
 * pipeline/calibration.js
 * -----------------------
 * REFORGE Sensor Calibration & Peer Consensus Verification Module.
 *
 * Principles:
 * 1. Raw readings must NEVER be destructively mutated or blindly blended with peer means.
 * 2. Anomaly detection is strictly distinguished from calibration correction:
 *    - Anomaly detection identifies that a sensor reading diverges from peer consensus or baseline.
 *    - Calibration correction requires a verified baseline, known calibration curve, or validated offset.
 * 3. If a trustworthy calibration model or validated offset is unavailable, the observation
 *    is preserved in its raw state and routed to human review/quarantine.
 * 4. Units must be validated to prevent comparing mismatched units (e.g., Celsius vs Fahrenheit).
 * 5. Minimum peer group threshold (>= 2 trusted peers) must be met for cross-sensor consensus.
 */

const DEFAULT_DEVIATION_THRESHOLD = 15.0; // Threshold above which cross-sensor divergence is flagged
const MIN_PEER_COUNT = 2; // Minimum peers required to establish cluster consensus

/**
 * Validates whether a value is a valid, finite number.
 */
function isNumeric(val) {
  return typeof val === "number" && !isNaN(val) && Number.isFinite(val);
}

/**
 * Validates cross-sensor calibration context and checks for unit compatibility and peer sufficiency.
 *
 * @param {Object} ctx
 * @param {string} ctx.entityId - Sensor identifier
 * @param {number} ctx.rawValue - Raw sensor reading
 * @param {number|null} [ctx.peerClusterMean] - Consensus mean of peer sensors
 * @param {string} [ctx.unit] - Sensor measurement unit (e.g. "C", "%", "hPa")
 * @param {string} [ctx.peerUnit] - Peer sensors measurement unit
 * @param {number} [ctx.peerCount] - Number of active peer sensors in cluster
 * @param {boolean} [ctx.trustedPeers] - Whether peer sensors are trusted / certified
 * @param {number|null} [ctx.validatedOffset] - Verified hardware calibration offset, if available
 * @param {number} [ctx.threshold] - Divergence threshold (default 15.0)
 * @returns {Object} Diagnostic evaluation result
 */
function evaluateCalibration(ctx = {}) {
  const {
    entityId,
    rawValue,
    peerClusterMean = null,
    unit = null,
    peerUnit = null,
    peerCount = 0,
    trustedPeers = true,
    validatedOffset = null,
    threshold = DEFAULT_DEVIATION_THRESHOLD,
  } = ctx;

  // 1. Validate numeric integrity of raw reading
  if (!isNumeric(rawValue)) {
    return {
      status: "INVALID_INPUT",
      action: "REJECT",
      calibratedValue: null,
      rawValue,
      anomalyDetected: true,
      reason: `Raw sensor reading is non-numeric or non-finite: ${rawValue}`,
    };
  }

  // 2. Unit compatibility check
  if (unit && peerUnit && unit.toLowerCase() !== peerUnit.toLowerCase()) {
    return {
      status: "UNIT_MISMATCH",
      action: "ROUTE_TO_REVIEW",
      calibratedValue: rawValue,
      rawValue,
      anomalyDetected: true,
      reason: `Unit mismatch detected: sensor '${entityId}' has unit '${unit}' but peer cluster has unit '${peerUnit}'. Cross-sensor consensus aborted.`,
    };
  }

  // 3. Peer consensus availability check
  if (peerClusterMean === null || peerClusterMean === undefined || !isNumeric(peerClusterMean)) {
    return {
      status: "NO_PEER_CONSENSUS",
      action: "ACCEPT_RAW",
      calibratedValue: rawValue,
      rawValue,
      anomalyDetected: false,
      reason: "No peer cluster mean available for cross-sensor comparison.",
    };
  }

  // 4. Insufficient peer sample size check
  if (peerCount !== undefined && peerCount < MIN_PEER_COUNT) {
    return {
      status: "INSUFFICIENT_PEERS",
      action: "ACCEPT_RAW",
      calibratedValue: rawValue,
      rawValue,
      anomalyDetected: false,
      reason: `Insufficient peer sensors in cluster (found ${peerCount}, minimum ${MIN_PEER_COUNT} required for consensus).`,
    };
  }

  // 5. Untrusted peer sensors check
  if (trustedPeers === false) {
    return {
      status: "UNTRUSTED_PEERS",
      action: "ROUTE_TO_REVIEW",
      calibratedValue: rawValue,
      rawValue,
      anomalyDetected: true,
      reason: "Peer cluster sensors are flagged as untrusted or uncalibrated. Consensus discarded.",
    };
  }

  // 6. Validated offset calibration check (hardware / sensor zero-point offset)
  const deviation = Math.abs(rawValue - peerClusterMean);
  if (isNumeric(validatedOffset)) {
    const calibratedValue = rawValue - validatedOffset;
    return {
      status: "OFFSET_APPLIED",
      action: "APPLY_CALIBRATION",
      calibratedValue,
      rawValue,
      validatedOffset,
      anomalyDetected: false,
      deviation,
      reason: `Applied verified hardware calibration offset of ${validatedOffset} (raw ${rawValue} -> calibrated ${calibratedValue}).`,
    };
  }

  // 7. Divergence analysis against peer consensus
  const isDivergent = deviation > threshold;

  if (!isDivergent) {
    // Reading is within acceptable tolerance of peer consensus
    return {
      status: "IN_CONSENSUS",
      action: "ACCEPT",
      calibratedValue: rawValue,
      rawValue,
      anomalyDetected: false,
      deviation,
      reason: `Sensor reading is within tolerance of peer consensus (deviation ${deviation.toFixed(2)} <= threshold ${threshold}).`,
    };
  }

  // 8. Divergent reading WITHOUT validated calibration model:
  // PRESERVE RAW READING. Do NOT destructively blend or force convergence to peer mean.
  // Route to human review/quarantine for physical inspection.
  return {
    status: "CROSS_SENSOR_DIVERGENCE",
    action: "ROUTE_TO_REVIEW",
    calibratedValue: rawValue,
    rawValue,
    anomalyDetected: true,
    deviation,
    reason: `Reading diverges by ${deviation.toFixed(2)} from peer cluster consensus (${peerClusterMean.toFixed(2)}), exceeding threshold of ${threshold}. No validated calibration model available; routing to review without altering raw value.`,
  };
}

/**
 * Standard ETL calibration entry point.
 * Preserves raw value and applies verified offsets when available.
 *
 * @param {string} entityId
 * @param {number} rawValue
 * @param {number|null} peerClusterMean
 * @param {Object} [options]
 * @returns {number|Object} Calibrated numeric value or full diagnostic object if options.returnObject is true
 */
function applyCalibration(entityId, rawValue, peerClusterMean = null, options = {}) {
  const result = evaluateCalibration({
    entityId,
    rawValue,
    peerClusterMean,
    unit: options.unit,
    peerUnit: options.peerUnit,
    peerCount: options.peerCount !== undefined ? options.peerCount : (peerClusterMean !== null ? 2 : 0),
    trustedPeers: options.trustedPeers !== undefined ? options.trustedPeers : true,
    validatedOffset: options.validatedOffset || null,
    threshold: options.threshold || DEFAULT_DEVIATION_THRESHOLD,
  });

  if (options.returnObject) {
    return result;
  }

  if (!isNumeric(result.calibratedValue)) {
    return isNumeric(rawValue) ? rawValue : NaN;
  }

  return result.calibratedValue;
}

module.exports = {
  applyCalibration,
  evaluateCalibration,
  isNumeric,
  DEFAULT_DEVIATION_THRESHOLD,
  MIN_PEER_COUNT,
};
