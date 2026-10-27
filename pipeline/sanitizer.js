/**
 * pipeline/sanitizer.js
 * ---------------------
 * Sanitizes sensor readings against implausible step changes and transient spikes.
 */

function isNumeric(val) {
  return typeof val === "number" && !isNaN(val) && Number.isFinite(val);
}

/**
 * Sanitizes an incoming sensor reading.
 * If delta exceeds MAX_STEP_CHANGE, clamps to previous reading or flags outlier.
 *
 * @param {string} entityId - Sensor identifier
 * @param {number} currentVal - Current raw reading
 * @param {number|null} prevVal - Previous valid reading
 * @param {Object} [options]
 * @returns {number|Object}
 */
function sanitizeReading(entityId, currentVal, prevVal, options = {}) {
  const maxStep = options.maxStep || 20.0;

  if (!isNumeric(currentVal)) {
    if (options.returnObject) {
      return { status: "INVALID_INPUT", value: null, rawValue: currentVal, clamped: false };
    }
    return NaN;
  }

  if (prevVal !== null && prevVal !== undefined && isNumeric(prevVal)) {
    if (Math.abs(currentVal - prevVal) > maxStep) {
      if (options.returnObject) {
        return {
          status: "CLAMPED",
          value: prevVal,
          rawValue: currentVal,
          clamped: true,
          delta: Math.abs(currentVal - prevVal),
        };
      }
      return prevVal;
    }
  }

  if (options.returnObject) {
    return { status: "VALID", value: currentVal, rawValue: currentVal, clamped: false };
  }
  return currentVal;
}

module.exports = { sanitizeReading, isNumeric };
