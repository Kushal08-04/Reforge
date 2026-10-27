const { RawObservation } = require("../models");

const DEFAULT_HISTORY_WINDOW = 20; // slow rolling stats window
const FAST_HISTORY_WINDOW = 5; // fast rolling stats window
const CROSS_SENSOR_WINDOW_HOURS = 3; // how far to look for "same time" readings from peers
const CROSS_SENSOR_WINDOW_MS = CROSS_SENSOR_WINDOW_HOURS * 60 * 60 * 1000;

const SENSOR_MIN_SCALES = {
  temperature: 0.6,
  humidity: 2.0,
  pressure: 0.4,
};

// Bounded in-memory per-sensor history cache
// Map: entityId -> Array<{ timestampMs: number, value: number }>
// Max 30 entries per sensor, max 500 sensors.
const MAX_HISTORY_PER_SENSOR = 30;
const MAX_CACHED_SENSORS = 500;
const sensorHistoryCache = new Map();
const hydratedSensors = new Set();

// Bounded in-memory peer consensus cache
// Map: entityId -> { type: string, zone: string, timestampMs: number, value: number }
const peerLatestCache = new Map();
const hydratedPeerTypes = new Set();

let cacheHits = 0;
let cacheMisses = 0;

/**
 * entityId convention: "<zone>-<type>", e.g. "zone-a-temperature".
 */
function parseEntityId(entityId) {
  const parts = String(entityId).split("-");
  const type = parts.pop();
  const zone = parts.join("-");
  return { zone, type };
}

function mean(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr, avg) {
  if (!arr || arr.length < 2) return null;
  const m = avg !== undefined ? avg : mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Computes continuous cyclical time-of-day encodings (sin and cos of 24h diurnal cycle).
 */
function computeCyclicalTime(timestamp) {
  const d = new Date(timestamp);
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const radians = (hour / 24) * 2 * Math.PI;
  return {
    timeOfDaySin: Math.sin(radians),
    timeOfDayCos: Math.cos(radians),
  };
}

/**
 * Manages the bounded in-memory sensor history cache.
 */
function getCachedHistory(entityId, currentTimestampMs) {
  const cached = sensorHistoryCache.get(entityId);
  if (!cached || !cached.length) return null;
  // Return entries strictly before current timestamp
  const valid = cached.filter((item) => item.timestampMs < currentTimestampMs);
  return valid;
}

function updateSensorCache(entityId, timestampMs, value) {
  if (typeof value !== "number" || isNaN(value)) return;

  if (!sensorHistoryCache.has(entityId)) {
    if (sensorHistoryCache.size >= MAX_CACHED_SENSORS) {
      // Evict oldest sensor entry
      const firstKey = sensorHistoryCache.keys().next().value;
      sensorHistoryCache.delete(firstKey);
      hydratedSensors.delete(firstKey);
    }
    sensorHistoryCache.set(entityId, []);
  }

  const list = sensorHistoryCache.get(entityId);
  // Insert in chronological order or append if latest
  if (!list.length || timestampMs >= list[list.length - 1].timestampMs) {
    list.push({ timestampMs, value });
  } else {
    list.push({ timestampMs, value });
    list.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  if (list.length > MAX_HISTORY_PER_SENSOR) {
    list.splice(0, list.length - MAX_HISTORY_PER_SENSOR);
  }
}

function updatePeerCache(entityId, zone, type, timestampMs, value) {
  if (typeof value !== "number" || isNaN(value)) return;
  peerLatestCache.set(entityId, { zone, type, timestampMs, value });
}

function clearFeatureCache() {
  sensorHistoryCache.clear();
  peerLatestCache.clear();
  hydratedSensors.clear();
  hydratedPeerTypes.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

function getCacheStats() {
  return {
    cachedSensors: sensorHistoryCache.size,
    cachedPeers: peerLatestCache.size,
    cacheHits,
    cacheMisses,
    hitRate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 1.0,
  };
}

/**
 * Builds the semantic feature snapshot for one incoming observation.
 *
 * @param {Object} opts
 * @param {string} opts.entityId
 * @param {Date|string} opts.timestamp
 * @param {number} opts.value - primary numeric reading
 * @returns {Promise<Object>} feature snapshot consumed by rule engine and ML model
 */
async function buildFeatures({ entityId, timestamp, value }) {
  const { zone, type } = parseEntityId(entityId);
  const currentTimestampMs = new Date(timestamp).getTime();
  const numericValue = typeof value === "number" && !isNaN(value) ? value : 0.0;

  // 1. Cyclical time-of-day encodings
  const { timeOfDaySin, timeOfDayCos } = computeCyclicalTime(timestamp);

  // 2. Temporal history context: check in-memory cache first to avoid DB queries
  let historicalValues = [];
  let previousTimestampMs = null;
  const isHydrated = hydratedSensors.has(entityId);
  const cachedHistory = getCachedHistory(entityId, currentTimestampMs);

  if (isHydrated || (cachedHistory && cachedHistory.length > 0)) {
    cacheHits++;
    if (cachedHistory && cachedHistory.length > 0) {
      historicalValues = cachedHistory.map((h) => h.value);
      previousTimestampMs = cachedHistory[cachedHistory.length - 1].timestampMs;
    }
  } else {
    cacheMisses++;
    const dbHistory = await RawObservation.find({
      entityId,
      timestamp: { $lt: timestamp },
    })
      .sort({ timestamp: -1 })
      .limit(DEFAULT_HISTORY_WINDOW)
      .lean();

    hydratedSensors.add(entityId);
    const chronological = dbHistory.reverse();
    for (const h of chronological) {
      if (h.values && typeof h.values.value === "number") {
        const tMs = new Date(h.timestamp).getTime();
        historicalValues.push(h.values.value);
        updateSensorCache(entityId, tMs, h.values.value);
        previousTimestampMs = tMs;
      }
    }
  }

  const previousValue = historicalValues.length
    ? historicalValues[historicalValues.length - 1]
    : null;
  const rateOfChange = previousValue !== null ? numericValue - previousValue : null;
  const minutesSincePrevious =
    previousTimestampMs !== null
      ? (currentTimestampMs - previousTimestampMs) / 60000
      : null;

  // Dual-scale rolling statistics: Fast (5-sample) vs Slow (20-sample)
  const slowValues = historicalValues.slice(-DEFAULT_HISTORY_WINDOW);
  const fastValues = historicalValues.slice(-FAST_HISTORY_WINDOW);

  const slowRollingMean = mean(slowValues);
  const slowRollingStd = stdDev(slowValues, slowRollingMean);

  const fastRollingMean = mean(fastValues);
  const fastRollingStd = stdDev(fastValues, fastRollingMean);

  // Backward-compatible rolling stats
  const rollingMean = slowRollingMean !== null ? slowRollingMean : numericValue;
  const rollingStd = slowRollingStd !== null ? slowRollingStd : null;

  const historicalZScore =
    rollingStd && rollingStd > 0
      ? Math.max(-10.0, Math.min(10.0, (numericValue - rollingMean) / rollingStd))
      : null;

  // Volatility ratio and mean divergence between fast and slow scales
  const safeSlowStd = slowRollingStd && slowRollingStd > 0 ? slowRollingStd : 0.1;
  const safeFastStd = fastRollingStd && fastRollingStd > 0 ? fastRollingStd : 0.1;
  const volatilityRatio = safeFastStd / safeSlowStd;
  const meanDivergence =
    fastRollingMean !== null && slowRollingMean !== null
      ? fastRollingMean - slowRollingMean
      : 0.0;

  // 3. Cross-sensor peer context: check peer cache first
  const windowStartMs = currentTimestampMs - CROSS_SENSOR_WINDOW_MS;
  const windowEndMs = currentTimestampMs + CROSS_SENSOR_WINDOW_MS;
  let peerValues = [];

  for (const [peerId, peerData] of peerLatestCache.entries()) {
    if (
      peerId !== entityId &&
      peerData.type === type &&
      peerData.timestampMs >= windowStartMs &&
      peerData.timestampMs <= windowEndMs
    ) {
      peerValues.push(peerData.value);
    }
  }

  // If peer cache is cold or has never been initialized for this type, query MongoDB once
  if (peerValues.length < 2 && !hydratedPeerTypes.has(type)) {
    const peerReadings = await RawObservation.find({
      entityId: { $ne: entityId },
      timestamp: { $gte: new Date(windowStartMs), $lte: new Date(windowEndMs) },
    }).lean();

    hydratedPeerTypes.add(type);
    peerValues = peerReadings
      .filter((p) => parseEntityId(p.entityId).type === type)
      .map((p) => {
        const val = p.values && typeof p.values.value === "number" ? p.values.value : null;
        if (val !== null) {
          const pInfo = parseEntityId(p.entityId);
          updatePeerCache(
            p.entityId,
            pInfo.zone,
            pInfo.type,
            new Date(p.timestamp).getTime(),
            val
          );
        }
        return val;
      })
      .filter((v) => v !== null);
  }

  const crossSensorMean = mean(peerValues);
  const crossSensorStd = stdDev(peerValues, crossSensorMean);
  const minPeerScale = SENSOR_MIN_SCALES[type] || 0.5;
  const effectivePeerStd = Math.max(crossSensorStd || 0, minPeerScale);

  const crossSensorDeviation =
    peerValues.length >= 2 && crossSensorMean !== null
      ? Math.max(-10.0, Math.min(10.0, (numericValue - crossSensorMean) / effectivePeerStd))
      : null;

  const normalizedPeerResidual =
    crossSensorMean !== null
      ? Math.max(-10.0, Math.min(10.0, (numericValue - crossSensorMean) / effectivePeerStd))
      : safeSlowStd > 0
      ? Math.max(-10.0, Math.min(10.0, (numericValue - rollingMean) / safeSlowStd))
      : 0.0;
  const peerResidual = crossSensorMean !== null ? numericValue - crossSensorMean : 0.0;

  // 4. Update in-memory caches with this observation for subsequent streaming readings
  updateSensorCache(entityId, currentTimestampMs, numericValue);
  updatePeerCache(entityId, zone, type, currentTimestampMs, numericValue);

  return {
    zone,
    type,
    value: numericValue,
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
    // Enhanced v1.1.0 feature fields:
    timeOfDaySin,
    timeOfDayCos,
    fastRollingMean: fastRollingMean !== null ? fastRollingMean : numericValue,
    fastRollingStd: fastRollingStd !== null ? fastRollingStd : 0.1,
    slowRollingMean: slowRollingMean !== null ? slowRollingMean : numericValue,
    slowRollingStd: slowRollingStd !== null ? slowRollingStd : 0.1,
    volatilityRatio,
    meanDivergence,
    normalizedPeerResidual,
    peerResidual,
  };
}

module.exports = {
  buildFeatures,
  parseEntityId,
  mean,
  stdDev,
  computeCyclicalTime,
  clearFeatureCache,
  getCacheStats,
  SENSOR_MIN_SCALES,
};

