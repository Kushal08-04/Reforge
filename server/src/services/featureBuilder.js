const { RawObservation } = require("../models");

const DEFAULT_HISTORY_WINDOW = 20; // how many past readings to use for rolling stats
const CROSS_SENSOR_WINDOW_HOURS = 3; // how far to look for "same time" readings from peers

/**
 * entityId convention for this MVP: "<zone>-<type>", e.g. "zone-a-temperature".
 * This lets us group by zone (not currently used beyond documentation) and by
 * "type" across zones for cross-sensor comparison, without needing a separate
 * config table describing sensor relationships (Section 6: "domain context").
 */
function parseEntityId(entityId) {
  const parts = String(entityId).split("-");
  const type = parts.pop();
  const zone = parts.join("-");
  return { zone, type };
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr, avg) {
  if (arr.length < 2) return null;
  const m = avg !== undefined ? avg : mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Builds the semantic feature snapshot for one incoming observation.
 * This is the "Semantic feature construction" step (Section 5, step 5).
 *
 * @param {Object} opts
 * @param {string} opts.entityId
 * @param {Date}   opts.timestamp
 * @param {number} opts.value - the primary numeric reading (values.value)
 * @returns {Promise<Object>} feature snapshot consumed by the rule engine
 */
async function buildFeatures({ entityId, timestamp, value }) {
  const { zone, type } = parseEntityId(entityId);

  // ---- Temporal / historical context: recent readings for THIS entity ----
  const history = await RawObservation.find({
    entityId,
    timestamp: { $lt: timestamp },
  })
    .sort({ timestamp: -1 })
    .limit(DEFAULT_HISTORY_WINDOW)
    .lean();

  // history comes back newest-first; reverse for chronological order
  const chronological = history.reverse();
  const historicalValues = chronological
    .map((h) => (h.values && typeof h.values.value === "number" ? h.values.value : null))
    .filter((v) => v !== null);

  const previousValue = historicalValues.length
    ? historicalValues[historicalValues.length - 1]
    : null;
  const previousTimestamp = chronological.length
    ? chronological[chronological.length - 1].timestamp
    : null;

  const rollingMean = mean(historicalValues);
  const rollingStd = stdDev(historicalValues, rollingMean);

  const rateOfChange = previousValue !== null ? value - previousValue : null;
  const minutesSincePrevious =
    previousTimestamp !== null
      ? (new Date(timestamp) - new Date(previousTimestamp)) / 60000
      : null;

  const historicalZScore =
    rollingStd && rollingStd > 0 ? (value - rollingMean) / rollingStd : null;

  // ---- Cross-sensor context: peers with the same "type" in a nearby time window ----
  const windowMs = CROSS_SENSOR_WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = new Date(new Date(timestamp).getTime() - windowMs);
  const windowEnd = new Date(new Date(timestamp).getTime() + windowMs);

  const peerReadings = await RawObservation.find({
    entityId: { $ne: entityId },
    timestamp: { $gte: windowStart, $lte: windowEnd },
  }).lean();

  // Keep only peers whose entityId has the same "type" suffix (same sensor kind
  // in a different zone) - this is our simple cross-sensor correlation group.
  const peerValues = peerReadings
    .filter((p) => parseEntityId(p.entityId).type === type)
    .map((p) => (p.values && typeof p.values.value === "number" ? p.values.value : null))
    .filter((v) => v !== null);

  const crossSensorMean = mean(peerValues);
  const crossSensorStd = stdDev(peerValues, crossSensorMean);
  const crossSensorDeviation =
    crossSensorStd && crossSensorStd > 0 && crossSensorMean !== null
      ? (value - crossSensorMean) / crossSensorStd
      : null;

  return {
    zone,
    type,
    historyWindowSize: historicalValues.length,
    previousValue,
    minutesSincePrevious,
    rateOfChange,
    rollingMean,
    rollingStd,
    historicalZScore,
    peerGroupSize: peerValues.length,
    crossSensorMean,
    crossSensorStd,
    crossSensorDeviation,
  };
}

module.exports = { buildFeatures, parseEntityId, mean, stdDev };
