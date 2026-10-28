const path = require("path");
const fs = require("fs");
const { ensureGenericEnvelope, validateSchema } = require("../src/services/schemaValidator");
const { resolveSensorType } = require("../src/services/dataRepairService");


console.log("=== REFORGE Generic Ingestion Test Suite ===");

// Test Case 1: Arbitrary wide IoT sensor table (sensor_data_2025-03-01.csv shape)
const wideRecord = {
  timestamp: "2025-03-01 00:00:00",
  temperature: 24.69,
  humidity: 52.66,
  light: 118.65,
  pH: 6.68,
  electrical_conductivity: 0.996
};

const env1 = ensureGenericEnvelope(wideRecord);
console.log("\n[Test 1] Wide CSV Row:");
console.log("  Output Envelope:", JSON.stringify(env1, null, 2));
const val1 = validateSchema(env1);
console.log("  Schema Valid:", val1.valid, "Errors:", val1.errors);
console.log("  Resolved Sensor Type:", resolveSensorType(env1.entityId, env1));
console.assert(val1.valid === true, "Test 1 failed schema validation!");
console.assert(env1.values.value === 24.69, "Test 1 primary value mapping failed!");
console.assert(env1.values.pH === 6.68, "Test 1 pH mapping failed!");

// Test Case 2: Telemetry dataset shape (ts, device, co, humidity, light, lpg, motion, smoke, temp)
const telemetryRecord = {
  ts: 1594512094.3859746,
  device: "b8:27:eb:bf:9d:51",
  co: 0.00495,
  humidity: 51.0,
  light: false,
  lpg: 0.00765,
  motion: false,
  smoke: 0.0204,
  temp: 22.7
};

const env2 = ensureGenericEnvelope(telemetryRecord);
console.log("\n[Test 2] IoT Telemetry Row:");
console.log("  Output Envelope:", JSON.stringify(env2, null, 2));
const val2 = validateSchema(env2);
console.log("  Schema Valid:", val2.valid, "Errors:", val2.errors);
console.assert(val2.valid === true, "Test 2 failed schema validation!");
console.assert(env2.entityId === "b8:27:eb:bf:9d:51", "Test 2 entityId failed!");
console.assert(env2.values.value === 22.7, "Test 2 primary temp value failed!");

// Test Case 3: Completely bare / missing fields record (only has reading: 45.2)
const bareRecord = {
  reading: 45.2
};

const env3 = ensureGenericEnvelope(bareRecord);
console.log("\n[Test 3] Bare Record with Missing Fields:");
console.log("  Output Envelope:", JSON.stringify(env3, null, 2));
const val3 = validateSchema(env3);
console.log("  Schema Valid:", val3.valid, "Errors:", val3.errors);
console.assert(val3.valid === true, "Test 3 failed schema validation!");
console.assert(env3.sourceId === "generic-iot-device", "Test 3 generic sourceId failed!");
console.assert(env3.entityId === "generic-iot-sensor", "Test 3 generic entityId failed!");
console.assert(env3.values.value === 45.2, "Test 3 reading mapping failed!");

// Test Case 4: Corrupted / empty record with no numbers (for self-healing)
const corruptRecord = {
  status: "sensor_error",
  raw_text: "N/A"
};

const env4 = ensureGenericEnvelope(corruptRecord);
console.log("\n[Test 4] Corrupted Record for Self-Healing:");
console.log("  Output Envelope:", JSON.stringify(env4, null, 2));
const val4 = validateSchema(env4);
console.log("  Schema Valid:", val4.valid, "Errors:", val4.errors);
console.assert(val4.valid === true, "Test 4 failed schema validation!");
console.assert(env4.values.value === null, "Test 4 null value mapping failed!");

console.log("\nALL 4 INGESTION TESTS PASSED WITHOUT REJECTION!");
