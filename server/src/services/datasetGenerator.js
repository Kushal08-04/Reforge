/**
 * datasetGenerator.js
 * -------------------
 * Produces a synthetic multi-sensor dataset with realistic normal behavior
 * plus controlled, LABELLED semantic anomalies:
 *   - Implausible jumps (severe physical violations)
 *   - Historical deviations (statistical z-score drift)
 *   - Cross-sensor contradictions (peer group divergence)
 *   - Gradual drift (subtle accumulative drift across timesteps)
 *
 * Fully backward compatible: generateDataset() with no arguments
 * produces the exact 216-record baseline used by the MVP.
 * Passing options ({ days, seed, includeDrift, anomalyMultiplier }) allows
 * scaling to larger evaluation and training datasets.
 */

const ZONES = ["zone-a", "zone-b", "zone-c"];
const TYPE_CONFIG = {
  temperature: { base: 25, dailyAmplitude: 3, noise: 0.6, unit: "C" },
  humidity: { base: 50, dailyAmplitude: 8, noise: 2, unit: "%" },
  pressure: { base: 1010, dailyAmplitude: 1.5, noise: 0.4, unit: "hPa" },
};
const ZONE_OFFSET = { "zone-a": 0, "zone-b": 0.8, "zone-c": -0.6 };
const INTERVAL_HOURS = 3;
const DEFAULT_DAYS = 3;
const START = new Date("2026-09-01T00:00:00.000Z");

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function seededNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function normalValueAt({ type, zone, hourIndex, seedOffset }) {
  const cfg = TYPE_CONFIG[type];
  const hourOfDay = (hourIndex * INTERVAL_HOURS) % 24;
  const daily = Math.sin((hourOfDay / 24) * 2 * Math.PI) * cfg.dailyAmplitude;
  const noise = (seededNoise(hourIndex + seedOffset) - 0.5) * 2 * cfg.noise;
  return round(cfg.base + ZONE_OFFSET[zone] + daily + noise);
}

function generateBaseline(opts = {}) {
  const days = opts.days || DEFAULT_DAYS;
  const records = [];
  const totalSteps = (days * 24) / INTERVAL_HOURS;
  let seedOffset = (opts.seed || 0) * 100;

  for (const zone of ZONES) {
    for (const type of Object.keys(TYPE_CONFIG)) {
      seedOffset += 17;
      const entityId = `${zone}-${type}`;

      for (let step = 0; step < totalSteps; step++) {
        const timestamp = new Date(START.getTime() + step * INTERVAL_HOURS * 60 * 60 * 1000);
        const value = normalValueAt({ type, zone, hourIndex: step, seedOffset });

        records.push({
          sourceId: "synthetic-iot-fleet",
          sourceType: "sensor",
          entityId,
          timestamp,
          values: { value },
          units: { value: TYPE_CONFIG[type].unit },
          _meta: { isAnomalySeed: false, anomalyType: null },
        });
      }
    }
  }

  return records;
}

function injectAnomalies(records, opts = {}) {
  const byEntity = {};
  for (const r of records) {
    (byEntity[r.entityId] = byEntity[r.entityId] || []).push(r);
  }
  for (const entityId of Object.keys(byEntity)) {
    byEntity[entityId].sort((a, b) => a.timestamp - b.timestamp);
  }

  let injectedCount = 0;

  function markAnomaly(record, type, newValue) {
    if (!record) return;
    record.values = { value: round(newValue) };
    record._meta = { isAnomalySeed: true, anomalyType: type };
    injectedCount++;
  }

  // 1. Implausible jumps on temperature
  for (const zone of ZONES) {
    const series = byEntity[`${zone}-temperature`];
    if (!series) continue;
    const idx = Math.floor(series.length * 0.4);
    markAnomaly(series[idx], "implausible_jump", TYPE_CONFIG.temperature.base + 55);
  }

  // 2. Historical deviation on pressure
  for (const zone of ZONES) {
    const series = byEntity[`${zone}-pressure`];
    if (!series) continue;
    const idx = Math.floor(series.length * 0.65);
    markAnomaly(series[idx], "historical_deviation", TYPE_CONFIG.pressure.base - 12);
  }

  // 3. Cross-sensor contradiction on humidity
  {
    const series = byEntity["zone-b-humidity"];
    if (series) {
      const idx = Math.floor(series.length * 0.5);
      markAnomaly(series[idx], "cross_sensor_contradiction", 12);
    }
  }

  // 4. Default scattered anomalies
  {
    const series = byEntity["zone-c-temperature"];
    if (series) {
      const idx = Math.floor(series.length * 0.8);
      markAnomaly(series[idx], "implausible_jump", TYPE_CONFIG.temperature.base - 20);
    }
  }
  {
    const series = byEntity["zone-a-humidity"];
    if (series) {
      const idx = Math.floor(series.length * 0.25);
      markAnomaly(series[idx], "cross_sensor_contradiction", 88);
    }
  }
  {
    const series = byEntity["zone-b-pressure"];
    if (series) {
      const idx = Math.floor(series.length * 0.85);
      markAnomaly(series[idx], "historical_deviation", TYPE_CONFIG.pressure.base + 10);
    }
  }

  // 5. Extended anomalies when scaling dataset
  if (opts.days && opts.days > 3) {
    // Inject gradual drift
    const driftSeries = byEntity["zone-a-temperature"];
    if (driftSeries && driftSeries.length > 20) {
      for (let i = 15; i < 20; i++) {
        const driftVal = driftSeries[i].values.value + (i - 14) * 2.5;
        markAnomaly(driftSeries[i], "gradual_drift", driftVal);
      }
    }

    // Additional cross-sensor contradictions
    const humSeries = byEntity["zone-c-humidity"];
    if (humSeries && humSeries.length > 25) {
      markAnomaly(humSeries[22], "cross_sensor_contradiction", 15);
      markAnomaly(humSeries[23], "cross_sensor_contradiction", 14);
    }

    // Additional implausible jump
    const pressSeries = byEntity["zone-a-pressure"];
    if (pressSeries && pressSeries.length > 30) {
      markAnomaly(pressSeries[28], "implausible_jump", 1080);
    }
  }

  return { records, injectedCount };
}

function generateDataset(opts = {}) {
  const baseline = generateBaseline(opts);
  const { records, injectedCount } = injectAnomalies(baseline, opts);
  records.sort((a, b) => a.timestamp - b.timestamp);
  return {
    records,
    injectedCount,
    datasetVersion: opts.version || `synthetic-${opts.days || DEFAULT_DAYS}d-v1.0.0`,
  };
}

module.exports = {
  generateDataset,
  generateBaseline,
  injectAnomalies,
  ZONES,
  TYPE_CONFIG,
};
