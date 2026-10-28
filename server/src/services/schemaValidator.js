const Joi = require("joi");

/**
 * schemaValidator
 * ----------------
 * Conventional / structural validation layer (Section 4, step 4 of the
 * handoff doc). This runs BEFORE semantic validation and checks only:
 * required fields, types, and basic format - nothing contextual.
 *
 * Deliberately generic: REFORGE ingests arbitrary sensor payloads, so the
 * schema enforces the envelope shape while accepting any IoT modality.
 */

const observationEnvelopeSchema = Joi.object({
  sourceId: Joi.string().min(1).default("generic-iot-device"),
  sourceType: Joi.string()
    .valid("sensor", "api", "file", "database", "manual", "other")
    .default("sensor"),
  entityId: Joi.string().min(1).default("generic-iot-sensor"),
  timestamp: Joi.alternatives()
    .try(Joi.date().iso(), Joi.date(), Joi.string(), Joi.number())
    .required(),
  values: Joi.object({
    value: Joi.number().allow(null).required(),
  })
    .unknown(true) // allow extra fields (humidity, pH, etc.) without rejecting
    .required(),
  units: Joi.object().unknown(true).default({}),
}).unknown(true); // allow extra top-level fields without rejection

/**
 * Ensures any IoT sensor dataset record has a valid REFORGE envelope.
 * If fields like sourceId, entityId, timestamp, or values are missing,
 * they are generically auto-synthesized from available keys or standard defaults.
 */
function ensureGenericEnvelope(rawPayload = {}, index = 0) {
  if (!rawPayload || typeof rawPayload !== "object") {
    rawPayload = {};
  }

  // Case-insensitive key lookup helper
  const findKey = (candidates) => {
    const keys = Object.keys(rawPayload);
    for (const cand of candidates) {
      const found = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (found && rawPayload[found] !== undefined && rawPayload[found] !== null && String(rawPayload[found]).trim() !== "") {
        return rawPayload[found];
      }
    }
    return undefined;
  };

  const findKeyName = (candidates) => {
    const keys = Object.keys(rawPayload);
    for (const cand of candidates) {
      const found = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (found && rawPayload[found] !== undefined && rawPayload[found] !== null && String(rawPayload[found]).trim() !== "") {
        return found.trim().toLowerCase();
      }
    }
    return undefined;
  };

  // 1. Timestamp extraction & synthesis
  let timestamp = findKey([
    "timestamp", "ts", "time", "datetime", "date",
    "event_time", "recorded_at", "created_at", "epoch", "clock"
  ]);
  let parsedDate = null;
  if (timestamp !== undefined && timestamp !== null) {
    if (typeof timestamp === "number" || (!isNaN(Number(timestamp)) && String(timestamp).trim() !== "")) {
      const numTs = Number(timestamp);
      parsedDate = numTs > 1e11 ? new Date(numTs) : new Date(numTs * 1000);
    } else {
      parsedDate = new Date(timestamp);
    }
  }
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    parsedDate = new Date(Date.now() - index * 1000);
  }

  // 2. Entity ID / Device ID extraction & synthesis
  let entityId = findKey([
    "entityId", "entity_id", "device", "deviceId", "device_id",
    "sensor", "sensorId", "sensor_id", "station", "station_id",
    "node", "node_id", "id", "mac", "source"
  ]);
  if (!entityId) {
    // If there is a primary sensor column name, e.g. temperature, name it generic-sensor-temperature
    const sensorName = findKeyName(["temperature", "temp", "humidity", "hum", "co", "smoke", "lpg", "ph", "electrical_conductivity", "pressure"]);
    entityId = sensorName ? `generic-sensor-${sensorName}` : "generic-iot-sensor";
  } else {
    entityId = String(entityId).trim();
  }


  // 3. Source ID & Type
  let sourceId = findKey(["sourceId", "source_id", "source", "dataset", "file"]) || "generic-iot-device";
  let sourceType = rawPayload.sourceType || "sensor";

  // 4. Values extraction (multi-sensor & single-sensor support)
  const values = typeof rawPayload.values === "object" && rawPayload.values !== null
    ? { ...rawPayload.values }
    : {};

  // Extract all numeric columns present at root of rawPayload into values
  const knownEnvelopeKeys = new Set(["sourceId", "sourceType", "entityId", "timestamp", "values", "units", "rawPayload", "ingestKey", "_id", "__v"]);
  for (const [k, v] of Object.entries(rawPayload)) {
    if (!knownEnvelopeKeys.has(k) && v !== undefined && v !== null && v !== "") {
      const num = Number(v);
      if (!isNaN(num)) {
        values[k] = num;
      }
    }
  }

  // Determine primary numeric value
  let primaryValue = values.value;
  if (typeof primaryValue !== "number" || isNaN(primaryValue)) {
    // Check root aliases in priority order
    const rootVal = findKey([
      "value", "val", "reading", "temperature", "temp",
      "humidity", "hum", "co", "smoke", "lpg", "ph",
      "electrical_conductivity", "pressure", "light", "motion"
    ]);
    if (rootVal !== undefined && !isNaN(Number(rootVal))) {
      primaryValue = Number(rootVal);
    } else {
      // Find first numeric property in values
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === "number" && !isNaN(v)) {
          primaryValue = v;
          break;
        }
      }
    }
  }

  values.value = typeof primaryValue === "number" && !isNaN(primaryValue) ? primaryValue : null;

  // 5. Units synthesis
  const units = typeof rawPayload.units === "object" && rawPayload.units !== null
    ? { ...rawPayload.units }
    : {};
  if (!units.value) {
    const rawUnit = findKey(["unit", "units"]);
    if (rawUnit) {
      units.value = String(rawUnit);
    } else {
      const entLower = String(entityId).toLowerCase();
      if (entLower.includes("temp")) units.value = "C";
      else if (entLower.includes("hum")) units.value = "%";
      else if (entLower.includes("co") || entLower.includes("lpg") || entLower.includes("smoke")) units.value = "ppm";
      else if (entLower.includes("ph")) units.value = "pH";
      else if (entLower.includes("conduct")) units.value = "mS/cm";
      else if (entLower.includes("press")) units.value = "hPa";
      else units.value = "units";
    }
  }

  return {
    sourceId: String(sourceId),
    sourceType: String(sourceType),
    entityId: String(entityId),
    timestamp: parsedDate,
    values,
    units,
    rawPayload,
  };
}

/**
 * Validates the structural shape of a single incoming observation.
 * Returns { valid: boolean, errors: string[] }
 */
function validateSchema(payload) {
  const { error } = observationEnvelopeSchema.validate(payload, {
    abortEarly: false,
  });

  if (!error) {
    return { valid: true, errors: [] };
  }

  const errors = error.details.map((d) => d.message);
  return { valid: false, errors };
}

module.exports = {
  validateSchema,
  observationEnvelopeSchema,
  ensureGenericEnvelope,
};

