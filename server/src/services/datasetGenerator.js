/**
 * datasetGenerator
 * ----------------
 * Produces a synthetic multi-sensor dataset with realistic normal behaviour
 * plus a set of controlled, LABELLED semantic anomalies (Section 10 of the
 * handoff doc: "inject controlled semantic errors... implausible jumps,
 * cross-sensor contradictions, temporally inconsistent observations").
 *
 * This is intentionally synthetic rather than pulled from a real IoT
 * dataset (see ways-of-working: "mock and simplify ruthlessly").
 *
 * Layout: 3 zones x 3 sensor types = 9 entities, entityId = "<zone>-<type>",
 * e.g. "zone-a-temperature". Readings every 3 hours across 3 simulated days.
 */

const ZONES = ["zone-a", "zone-b", "zone-c"];
const TYPE_CONFIG = {
  temperature: { base: 25, dailyAmplitude: 3, noise: 0.6, unit: "C" },
  humidity: { base: 50, dailyAmplitude: 8, noise: 2, unit: "%" },
  pressure: { base: 1010, dailyAmplitude: 1.5, noise: 0.4, unit: "hPa" },
};
const ZONE_OFFSET = { "zone-a": 0, "zone-b": 0.8, "zone-c": -0.6 }; // small per-zone bias
const INTERVAL_HOURS = 3;
const DAYS = 3;
const START = new Date("2026-09-01T00:00:00.000Z");

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Deterministic-ish pseudo-noise so the dataset is reproducible across runs. */
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

/**
 * Builds the full baseline dataset (no anomalies yet).
 * @returns {Array<Object>} records with { sourceId, sourceType, entityId, timestamp, values, units, _meta }
 */
function generateBaseline() {
  const records = [];
  const totalSteps = (DAYS * 24) / INTERVAL_HOURS;
  let seedOffset = 0;

  for (const zone of ZONES) {
    for (const type of Object.keys(TYPE_CONFIG)) {
      seedOffset += 17; // vary the noise pattern per entity
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

/**
 * Injects a fixed set of labelled anomalies into an existing baseline dataset
 * by mutating specific records in place (keeping the same timestamp/entity
 * so it looks like a single bad reading rather than an extra data point).
 *
 * Anomaly types (mirrors Section 3 of the handoff doc):
 *   - implausible_jump: a single reading spikes far beyond physical plausibility
 *   - historical_deviation: value drifts well outside this entity's own history
 *   - cross_sensor_contradiction: this zone disagrees sharply with peer zones
 *     for the same sensor type, while looking locally unremarkable
 *
 * @param {Array<Object>} records - output of generateBaseline(), mutated in place
 * @returns {Array<Object>} the same array, annotated with anomalies
 */
function injectAnomalies(records) {
  const byEntity = {};
  for (const r of records) {
    (byEntity[r.entityId] = byEntity[r.entityId] || []).push(r);
  }
  for (const entityId of Object.keys(byEntity)) {
    byEntity[entityId].sort((a, b) => a.timestamp - b.timestamp);
  }

  let injectedCount = 0;

  function markAnomaly(record, type, newValue) {
    record.values = { value: round(newValue) };
    record._meta = { isAnomalySeed: true, anomalyType: type };
    injectedCount++;
  }

  // ---- 1) Implausible jumps: one severe spike per zone on temperature ----
  for (const zone of ZONES) {
    const entityId = `${zone}-temperature`;
    const series = byEntity[entityId];
    const idx = Math.floor(series.length * 0.4); // roughly 40% through the series
    markAnomaly(series[idx], "implausible_jump", TYPE_CONFIG.temperature.base + 55); // e.g. ~80C
  }

  // ---- 2) Historical deviation: gradual-looking but statistically extreme, on pressure ----
  for (const zone of ZONES) {
    const entityId = `${zone}-pressure`;
    const series = byEntity[entityId];
    const idx = Math.floor(series.length * 0.65);
    markAnomaly(series[idx], "historical_deviation", TYPE_CONFIG.pressure.base - 12);
  }

  // ---- 3) Cross-sensor contradiction: one zone's humidity diverges from its peers ----
  {
    const entityId = "zone-b-humidity";
    const series = byEntity[entityId];
    const idx = Math.floor(series.length * 0.5);
    // Peers (zone-a-humidity, zone-c-humidity) stay near baseline ~50%;
    // this zone drops sharply while its OWN recent history still looks locally smooth.
    markAnomaly(series[idx], "cross_sensor_contradiction", 12);
  }

  // ---- 4) A couple of extra scattered anomalies for a fuller demo/eval set ----
  {
    const entityId = "zone-c-temperature";
    const series = byEntity[entityId];
    const idx = Math.floor(series.length * 0.8);
    markAnomaly(series[idx], "implausible_jump", TYPE_CONFIG.temperature.base - 20);
  }
  {
    const entityId = "zone-a-humidity";
    const series = byEntity[entityId];
    const idx = Math.floor(series.length * 0.25);
    markAnomaly(series[idx], "cross_sensor_contradiction", 88);
  }
  {
    const entityId = "zone-b-pressure";
    const series = byEntity[entityId];
    const idx = Math.floor(series.length * 0.85);
    markAnomaly(series[idx], "historical_deviation", TYPE_CONFIG.pressure.base + 10);
  }

  return { records, injectedCount };
}

/**
 * Generates the complete labelled dataset, sorted chronologically (required
 * so the pipeline's rolling-history features are built up correctly when
 * records are ingested in order).
 */
function generateDataset() {
  const baseline = generateBaseline();
  const { records, injectedCount } = injectAnomalies(baseline);
  records.sort((a, b) => a.timestamp - b.timestamp);
  return { records, injectedCount };
}

module.exports = { generateDataset, ZONES, TYPE_CONFIG };
