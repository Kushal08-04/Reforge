/**
 * pipeline/filters.js
 * -------------------
 * Filters historical drift and extreme distribution anomalies.
 */

function isNumeric(val) {
  return typeof val === "number" && !isNaN(val) && Number.isFinite(val);
}

/**
 * Bounds readings experiencing historical drift based on rolling statistics.
 *
 * @param {string} entityId - Sensor identifier
 * @param {number} val - Observed value
 * @param {number} [rollingMean] - Moving average
 * @param {number} [rollingStd] - Moving standard deviation
 * @param {Object} [options]
 * @returns {number|Object}
 */
function filterDrift(entityId, val, rollingMean, rollingStd, options = {}) {
  if (!isNumeric(val)) {
    if (options.returnObject) {
      return { status: "INVALID_INPUT", value: null, rawValue: val };
    }
    return NaN;
  }

  if (isNumeric(rollingMean) && isNumeric(rollingStd) && rollingStd > 0) {
    const z = Math.abs(val - rollingMean) / rollingStd;
    if (z > 3.5) {
      const bound = rollingMean + Math.sign(val - rollingMean) * 3.0 * rollingStd;
      if (options.returnObject) {
        return {
          status: "DRIFT_BOUNDED",
          value: bound,
          rawValue: val,
          zScore: z,
          bounded: true,
        };
      }
      return bound;
    }
  }

  if (options.returnObject) {
    return { status: "VALID", value: val, rawValue: val, bounded: false };
  }
  return val;
}

module.exports = { filterDrift, isNumeric };
