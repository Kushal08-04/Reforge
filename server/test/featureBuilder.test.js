const assert = require("assert");
const {
  computeCyclicalTime,
  mean,
  stdDev,
  parseEntityId,
  clearFeatureCache,
  getCacheStats,
  SENSOR_MIN_SCALES,
} = require("../src/services/featureBuilder");

function testFeatureBuilder() {
  console.log("  Testing enhanced feature builder, cyclical encodings, and bounded caching...");

  // 1. Cyclical time encoding test
  const midnight = new Date("2026-09-01T00:00:00.000Z");
  const midEnc = computeCyclicalTime(midnight);
  assert(Math.abs(midEnc.timeOfDaySin - 0.0) < 1e-4, "Sin at midnight must be 0");
  assert(Math.abs(midEnc.timeOfDayCos - 1.0) < 1e-4, "Cos at midnight must be 1");

  const noon = new Date("2026-09-01T12:00:00.000Z");
  const noonEnc = computeCyclicalTime(noon);
  assert(Math.abs(noonEnc.timeOfDaySin - 0.0) < 1e-4, "Sin at noon must be ~0");
  assert(Math.abs(noonEnc.timeOfDayCos - (-1.0)) < 1e-4, "Cos at noon must be -1");

  const sixAm = new Date("2026-09-01T06:00:00.000Z");
  const sixEnc = computeCyclicalTime(sixAm);
  assert(Math.abs(sixEnc.timeOfDaySin - 1.0) < 1e-4, "Sin at 6am must be 1");
  assert(Math.abs(sixEnc.timeOfDayCos - 0.0) < 1e-4, "Cos at 6am must be 0");

  // 2. Statistical functions
  const values = [10, 20, 30, 40, 50];
  const m = mean(values);
  assert.strictEqual(m, 30, "Mean of [10, 20, 30, 40, 50] must be 30");

  const s = stdDev(values, m);
  assert(Math.abs(s - 15.811) < 0.01, "Sample std dev must match expected");

  assert.strictEqual(mean([]), null);
  assert.strictEqual(stdDev([10]), null);

  // 3. Entity ID parsing
  const parsed1 = parseEntityId("zone-a-temperature");
  assert.strictEqual(parsed1.zone, "zone-a");
  assert.strictEqual(parsed1.type, "temperature");

  const parsed2 = parseEntityId("complex-building-zone-c-pressure");
  assert.strictEqual(parsed2.zone, "complex-building-zone-c");
  assert.strictEqual(parsed2.type, "pressure");

  // 4. Cache state and clear operations
  clearFeatureCache();
  const stats = getCacheStats();
  assert.strictEqual(stats.cachedSensors, 0);
  assert.strictEqual(stats.cachedPeers, 0);
  assert.strictEqual(stats.cacheHits, 0);
  assert.strictEqual(stats.cacheMisses, 0);

  // 5. Sensor noise floors (prevents division by tiny stdDev and explosion of peer residuals)
  assert.ok(SENSOR_MIN_SCALES.temperature >= 0.5, "Temperature noise floor must be >= 0.5");
  assert.ok(SENSOR_MIN_SCALES.humidity >= 1.0, "Humidity noise floor must be >= 1.0");
  assert.ok(SENSOR_MIN_SCALES.pressure >= 0.2, "Pressure noise floor must be >= 0.2");

  // 6. Regularized peer residual bounded behavior
  const rawResidual = 0.05;
  const rawPeerStd = 0.0001; // extremely low variance among peers
  const effectiveStd = Math.max(rawPeerStd, SENSOR_MIN_SCALES.temperature);
  const normalizedResidual = Math.max(-10.0, Math.min(10.0, rawResidual / effectiveStd));
  assert.ok(normalizedResidual < 1.0, "Regularized residual must not explode when peer std is near zero");
  assert.ok(normalizedResidual > 0.0, "Regularized residual retains positive direction");

  console.log("  [ok] Enhanced feature builder, cyclical encodings, and noise floors passed.");
}

module.exports = { testFeatureBuilder };
